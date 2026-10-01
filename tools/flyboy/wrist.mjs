/**
 * Bends both straps around an elliptical "wrist", as if the watch were being worn.
 *
 * Works in watch space: the dial faces +Z, 12 o'clock is +Y, and the straps wrap in the Y-Z plane.
 * Each strap is treated as a flat strip with coordinates (s along its length, t through its thickness).
 * Leather is subdivided and bent along the wrist ellipse. Hardware (buckle, keepers, a stitch bar)
 * is placed rigidly onto the strap, because in the source file those pieces float away from it.
 */
import { mat3, mat4, vec3 } from 'gl-matrix';

export const WRIST = {
  a: 2.0,     // half-width of the wrist along Y, in world units (the case is about 2.45 wide)
  b: 1.5,     // half-depth of the wrist along Z
  yc: -0.05,  // centred between the two lugs
  zc: -1.32,  // so the ellipse passes through the lug bars
};

// Lug spring bars stay where they are. Each strap root is pulled onto its bar.
const LUG = { strap_top: [1.247, -0.255], strap_bottom: [-1.345, -0.055] };
const FIXED = new Set(['Cylinder.008', 'Cylinder.010']);
const MAIN = { strap_top: 'Cube.001', strap_bottom: 'Cube' };
const MAX_SEGMENT = 0.08; // longest edge allowed along the strap before bending
const LEATHER_TILE = 1.4;  // world units covered by one repeat of the leather grain texture

/**
 * Rigid pieces, in strap coordinates.
 *  s, t     where the piece's centre (or its anchor) lands on the strap. 'end' = the strap's tip.
 *  rot      rotation in the s-t plane, degrees, or 'align' to point the piece along the strap
 *  anchor   the member that lands exactly on (s, t); the rest keep their offset to it
 *  raise    extra outward offset for the non-anchor members, as a multiple of the overlap lift
 */
const RIGID = [
  { group: 'strap_bottom', members: ['Cylinder.011'], s: 0.55, t: 'outer', rot: 0 },
  { group: 'strap_top', members: ['Cube.003', 'Cube.008'], s: 2.95, t: 'wrap', rot: -62 },
  { group: 'strap_top', members: ['Cube.002', 'Cube.009'], s: 3.32, t: 'wrap', rot: -58 },
  { group: 'strap_top', members: ['Plane.002', 'Cube.004', 'Cylinder.009'], anchor: 'Cylinder.009', s: 'end', t: 0, rot: 'align', raise: 0.75 },
];

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Arc-length table for the ellipse y = a·sin(phi), z = b·cos(phi). Length 0 is the top of the wrist. */
function ellipseLUT({ a, b }) {
  const N = 16384, phis = new Float64Array(N + 1), L = new Float64Array(N + 1);
  let acc = 0;
  for (let i = 0; i <= N; i++) {
    const phi = -2 * Math.PI + (4 * Math.PI * i) / N;
    if (i) {
      const p0 = phis[i - 1];
      acc += Math.hypot(a * (Math.sin(phi) - Math.sin(p0)), b * (Math.cos(phi) - Math.cos(p0)));
    }
    phis[i] = phi;
    L[i] = acc;
  }
  const L0 = L[N / 2];
  for (let i = 0; i <= N; i++) L[i] -= L0;
  const search = (arr, x) => {
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m; else hi = m; }
    return [lo, hi, (x - arr[lo]) / (arr[hi] - arr[lo] || 1)];
  };
  return {
    perimeter: (L[N] - L[0]) / 2,
    phiAt: (len) => { const [lo, hi, t] = search(L, len); return phis[lo] + t * (phis[hi] - phis[lo]); },
    lenAt: (phi) => { const [lo, hi, t] = search(phis, phi); return L[lo] + t * (L[hi] - L[lo]); },
  };
}

function meshNodes(node, out = []) {
  if (node.getMesh()) out.push(node);
  node.listChildren().forEach((c) => meshNodes(c, out));
  return out;
}

function worldPoints(node) {
  const M = node.getWorldMatrix(), pts = [];
  for (const p of node.getMesh().listPrimitives()) {
    const a = p.getAttribute('POSITION'), v = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) pts.push(vec3.transformMat4([], a.getElement(i, v), M));
  }
  return pts;
}

/** The strap as a flat strip: root R on its mid-surface, length direction d (away from the case), outward normal n. */
function stripFrame(pts) {
  let my = 0, mz = 0;
  for (const p of pts) { my += p[1]; mz += p[2]; }
  my /= pts.length; mz /= pts.length;
  let syy = 0, szz = 0, syz = 0;
  for (const p of pts) { const u = p[1] - my, w = p[2] - mz; syy += u * u; szz += w * w; syz += u * w; }
  const ang = 0.5 * Math.atan2(2 * syz, syy - szz);
  let d = [Math.cos(ang), Math.sin(ang)];
  const proj = (p) => (p[1] - my) * d[0] + (p[2] - mz) * d[1];
  let smin = Infinity, smax = -Infinity, pmin, pmax;
  for (const p of pts) { const s = proj(p); if (s < smin) { smin = s; pmin = p; } if (s > smax) { smax = s; pmax = p; } }
  if (Math.hypot(pmax[1], pmax[2]) < Math.hypot(pmin[1], pmin[2])) { d = [-d[0], -d[1]]; [smin, smax] = [-smax, -smin]; }
  const R = [my + d[0] * smin, mz + d[1] * smin];
  let n = [-d[1], d[0]];
  if (n[1] < 0) n = [-n[0], -n[1]]; // outward is the side that faces the viewer, like the dial
  let tmin = Infinity, tmax = -Infinity;
  for (const p of pts) { const t = (p[1] - R[0]) * n[0] + (p[2] - R[1]) * n[1]; tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
  const mid = (tmin + tmax) / 2;
  const frame = { R: [R[0] + n[0] * mid, R[1] + n[1] * mid], d, n, length: smax - smin, half: (tmax - tmin) / 2 };
  frame.st = (w) => [(w[1] - frame.R[0]) * d[0] + (w[2] - frame.R[1]) * d[1], (w[1] - frame.R[0]) * n[0] + (w[2] - frame.R[1]) * n[1]];
  return frame;
}

/** Give a node its own copy of its geometry, so editing it never touches anything else. */
function ownGeometry(node) {
  const mesh = node.getMesh().clone();
  for (const prim of mesh.listPrimitives()) {
    const copy = prim.clone();
    for (const sem of copy.listSemantics()) copy.setAttribute(sem, prim.getAttribute(sem).clone());
    if (prim.getIndices()) copy.setIndices(prim.getIndices().clone());
    mesh.removePrimitive(prim);
    mesh.addPrimitive(copy);
  }
  node.setMesh(mesh);
  return mesh;
}

/** Split triangle edges that are longer than maxDs along the strap, so the bend stays smooth. */
function refine(prim, sOfLocal, maxDs) {
  const indices = prim.getIndices();
  if (!indices) return;
  const sems = prim.listSemantics();
  const data = {}, size = {};
  for (const sem of sems) { const acc = prim.getAttribute(sem); size[sem] = acc.getElementSize(); data[sem] = Array.from(acc.getArray()); }
  let idx = Array.from(indices.getArray());
  const vcount = () => data.POSITION.length / 3;
  const sv = [];
  for (let i = 0; i < vcount(); i++) sv.push(sOfLocal(data.POSITION.slice(i * 3, i * 3 + 3)));

  for (let pass = 0; pass < 10; pass++) {
    const mids = new Map();
    const mid = (i, j) => {
      if (Math.abs(sv[i] - sv[j]) <= maxDs) return -1;
      const key = i < j ? i * 4194304 + j : j * 4194304 + i;
      if (mids.has(key)) return mids.get(key);
      const k = vcount();
      for (const sem of sems) {
        const n = size[sem], A = data[sem];
        for (let c = 0; c < n; c++) A.push((A[i * n + c] + A[j * n + c]) / 2);
        if (sem === 'NORMAL') {
          const o = k * 3, l = Math.hypot(A[o], A[o + 1], A[o + 2]) || 1;
          A[o] /= l; A[o + 1] /= l; A[o + 2] /= l;
        }
      }
      sv.push((sv[i] + sv[j]) / 2);
      mids.set(key, k);
      return k;
    };
    const out = [];
    let split = 0;
    for (let f = 0; f < idx.length; f += 3) {
      let [a, b, c] = [idx[f], idx[f + 1], idx[f + 2]];
      let ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      const k = (ab >= 0) + (bc >= 0) + (ca >= 0);
      if (k === 0) { out.push(a, b, c); continue; }
      split++;
      if (k === 3) { out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); continue; }
      // rotate so the split pattern is canonical, keeping the winding
      while (!(ab >= 0 && (k === 1 || bc >= 0))) {
        [a, b, c] = [b, c, a];
        [ab, bc, ca] = [bc, ca, ab];
      }
      if (k === 1) out.push(a, ab, c, ab, b, c);
      else out.push(ab, b, bc, a, ab, bc, a, bc, c);
    }
    idx = out;
    if (!split) break;
  }
  for (const sem of sems) prim.getAttribute(sem).setArray(new Float32Array(data[sem]));
  const big = vcount() > 65535;
  indices.setArray(big ? new Uint32Array(idx) : new Uint16Array(idx));
}

export function wrapStraps(doc, log = console.log) {
  const root = doc.getRoot();
  const byName = (n) => root.listNodes().find((x) => x.getName() === n);
  const { a, b, yc, zc } = WRIST;
  const lut = ellipseLUT(WRIST);

  const at = (len, sign) => {
    const phi = lut.phiAt(len);
    let ny = Math.sin(phi) / a, nz = Math.cos(phi) / b;
    const nl = Math.hypot(ny, nz); ny /= nl; nz /= nl;
    let ty = a * Math.cos(phi), tz = -b * Math.sin(phi);
    const tl = Math.hypot(ty, tz) * sign; ty /= tl; tz /= tl; // direction of travel along the strap
    return { y: yc + a * Math.sin(phi), z: zc + b * Math.cos(phi), ny, nz, ty, tz };
  };

  const F = {}, start = {};
  for (const g of ['strap_top', 'strap_bottom']) {
    F[g] = stripFrame(worldPoints(byName(MAIN[g])));
    const sign = g === 'strap_top' ? 1 : -1;
    start[g] = lut.lenAt(sign * Math.asin(Math.min(1, Math.abs(LUG[g][0] - yc) / a)));
    log(`  ${g}: length ${F[g].length.toFixed(2)}, thickness ${(F[g].half * 2).toFixed(3)}`);
  }
  // The long strap's tail runs over the buckle strap, through the keepers and under the buckle.
  const lift = F.strap_top.half + F.strap_bottom.half + 0.012;
  const zone = { from: start.strap_top, to: start.strap_top + F.strap_top.length + 1.0 };
  const open = lut.perimeter - (start.strap_top - start.strap_bottom);
  log(`  wrist perimeter ${lut.perimeter.toFixed(2)}, straps overlap by ${(F.strap_top.length + F.strap_bottom.length - open).toFixed(2)}`);

  const bendFor = (g) => {
    const sign = g === 'strap_top' ? 1 : -1;
    const e0 = at(start[g], sign);
    const rootFix = [LUG[g][0] - e0.y, LUG[g][1] - e0.z];
    return (s, t) => {
      const len = start[g] + sign * s;
      let tt = t;
      if (g === 'strap_bottom') {
        let w = len;
        while (w < zone.from - 1) w += lut.perimeter;
        tt += lift * smooth(zone.from - 0.1, zone.from + 0.5, w) * (1 - smooth(zone.to - 0.2, zone.to + 1.6, w));
      }
      const e = at(len, sign);
      const fade = 1 - smooth(0, 1.4, s);
      return { y: e.y + e.ny * tt + rootFix[0] * fade, z: e.z + e.nz * tt + rootFix[1] * fade, e };
    };
  };

  // Rigid placements: per member node, a function from a world point to its (s, t) on the strap,
  // plus the rotation to apply to normals. Anything else on the strap bends with the leather.
  const rigid = new Map();
  for (const spec of RIGID) {
    const f = F[spec.group];
    const members = spec.members.map(byName);
    const pts = members.flatMap((m) => worldPoints(m).map((w) => ({ m: m.getName(), st: f.st(w) })));
    const anchorPts = spec.anchor ? pts.filter((p) => p.m === spec.anchor) : pts;
    const c = anchorPts.reduce((acc, p) => [acc[0] + p.st[0] / anchorPts.length, acc[1] + p.st[1] / anchorPts.length], [0, 0]);
    let rot = spec.rot;
    if (rot === 'align') {
      // point the piece from its anchor along +s
      const others = pts.filter((p) => p.m !== spec.anchor);
      const oc = others.reduce((acc, p) => [acc[0] + p.st[0] / others.length, acc[1] + p.st[1] / others.length], [0, 0]);
      rot = (-Math.atan2(oc[1] - c[1], oc[0] - c[0]) * 180) / Math.PI;
    }
    const r = (rot * Math.PI) / 180, cr = Math.cos(r), sr = Math.sin(r);
    const s0 = spec.s === 'end' ? f.length + 0.03 : spec.s;
    const t0 = spec.t === 'outer' ? f.half + 0.01 : spec.t === 'wrap' ? lift / 2 : spec.t;
    for (const m of members) {
      const raise = spec.anchor && m.getName() !== spec.anchor ? (spec.raise ?? 0) * lift : 0;
      rigid.set(m.getName(), { c, cr, sr, s0, t0: t0 + raise });
    }
    log(`  placed ${spec.members.join(' + ')} at s=${s0.toFixed(2)} (rotated ${rot.toFixed(0)}°)`);
  }

  for (const g of ['strap_top', 'strap_bottom']) {
    const f = F[g], bend = bendFor(g);
    for (const node of meshNodes(byName(g))) {
      if (FIXED.has(node.getName())) continue;
      const mesh = ownGeometry(node);
      const M = node.getWorldMatrix();
      const Minv = mat4.invert([], M);
      const toWorldN = mat3.normalFromMat4([], M);
      const toLocalN = mat3.transpose([], mat3.fromMat4([], M));
      const R = rigid.get(node.getName());

      for (const prim of mesh.listPrimitives()) {
        // texture coordinates that follow the strap: u across its width, v along its length
        if (prim.getMaterial()?.getName().startsWith('leather') && !prim.getAttribute('TEXCOORD_0')) {
          const pos = prim.getAttribute('POSITION'), uv = new Float32Array(pos.getCount() * 2);
          for (let i = 0; i < pos.getCount(); i++) {
            const w = vec3.transformMat4([], pos.getElement(i, [0, 0, 0]), M);
            uv[i * 2] = w[0] / LEATHER_TILE + 0.5;
            uv[i * 2 + 1] = f.st(w)[0] / LEATHER_TILE;
          }
          prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(root.listBuffers()[0]));
        }
        if (!R) refine(prim, (p) => f.st(vec3.transformMat4([], p, M))[0], MAX_SEGMENT);
        prim.setAttribute('TANGENT', null); // tangents would no longer match the bent surface
        const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL');
        const centre = R ? bend(R.s0, R.t0) : null;

        for (let i = 0; i < pos.getCount(); i++) {
          const w = vec3.transformMat4([], pos.getElement(i, [0, 0, 0]), M);
          const [s, t] = f.st(w);
          let y, z, e, rc = 1, rs = 0;
          if (R) {
            // rigid: rotate about the piece's centre, then lay it on the strap's local frame at (s0, t0)
            const ds = s - R.c[0], dt = t - R.c[1];
            const rs_ = ds * R.cr - dt * R.sr, rt_ = ds * R.sr + dt * R.cr;
            e = centre.e;
            y = centre.y + e.ty * rs_ + e.ny * rt_;
            z = centre.z + e.tz * rs_ + e.nz * rt_;
            rc = R.cr; rs = R.sr;
          } else {
            const m = bend(Math.max(-0.2, s), t);
            ({ y, z, e } = m);
          }
          pos.setElement(i, vec3.transformMat4([], [w[0], y, z], Minv));

          if (nor) {
            const nw = vec3.transformMat3([], nor.getElement(i, [0, 0, 0]), toWorldN);
            const cd0 = nw[1] * f.d[0] + nw[2] * f.d[1];
            const cn0 = nw[1] * f.n[0] + nw[2] * f.n[1];
            const cd = cd0 * rc - cn0 * rs, cn = cd0 * rs + cn0 * rc;
            const bent = [nw[0], cd * e.ty + cn * e.ny, cd * e.tz + cn * e.nz];
            nor.setElement(i, vec3.normalize([], vec3.transformMat3([], bent, toLocalN)));
          }
        }
      }
    }
  }
}
