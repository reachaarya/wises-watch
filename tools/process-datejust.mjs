/**
 * Builds public/models/watch.glb from ../rolex-datejust/source/rolex_datejust.glb.
 *
 *  1. Bakes the model into "watch space": dial at the origin facing +Z, 12 o'clock at +Y, case ~2.45 wide.
 *  2. Groups the parts into the assemblies the exploded view moves (crystal, bezel, hands, dial, case...).
 *  3. Splits the one-piece bracelet into top and bottom halves so they can separate.
 *  4. Resizes textures to WebP and compresses geometry with Draco.
 *
 * Run: npm run optimize-model
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, draco, transformMesh, getBounds } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { mat4, vec3 } from 'gl-matrix';
import { watchFrame } from './datejust-frame.mjs';

const SRC = '../rolex-datejust/source/rolex_datejust.glb';
const OUT = 'public/models/watch.glb';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const byName = (n) => root.listNodes().find((x) => x.getName() === n);

// 1. bake every mesh into watch space and clear the node transforms
const { M } = watchFrame(doc);
const meshNodes = root.listNodes().filter((n) => n.getMesh());
const used = new Set();
for (const n of meshNodes) {
  let mesh = n.getMesh();
  if (used.has(mesh)) { mesh = mesh.clone(); n.setMesh(mesh); }
  used.add(mesh);
  transformMesh(mesh, mat4.multiply([], M, n.getWorldMatrix()));
}
for (const n of root.listNodes()) n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);

// 3. split a mesh into the half above and the half below y = 0 (12 o'clock side / 6 o'clock side)
function splitByY(name) {
  const node = byName(name);
  const top = doc.createNode(name + '_top').setMesh(node.getMesh().clone());
  const bottom = doc.createNode(name + '_bottom').setMesh(node.getMesh().clone());
  for (const [half, keep] of [[top, (y) => y >= 0], [bottom, (y) => y < 0]]) {
    const mesh = half.getMesh();
    // Mesh.clone() shares primitives by reference, so give this half its own primitives first
    for (const shared of mesh.listPrimitives()) {
      const own = shared.clone();
      mesh.removePrimitive(shared);
      mesh.addPrimitive(own);
    }
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
      const src = idx.getArray(), out = [];
      const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
      for (let i = 0; i < src.length; i += 3) {
        pos.getElement(src[i], a); pos.getElement(src[i + 1], b); pos.getElement(src[i + 2], c);
        if (keep((a[1] + b[1] + c[1]) / 3)) out.push(src[i], src[i + 1], src[i + 2]);
      }
      prim.setIndices(idx.clone().setArray(pos.getCount() > 65535 ? new Uint32Array(out) : new Uint16Array(out)));
    }
  }
  node.dispose();
  return [top.getName(), bottom.getName()];
}
const [linksTop, linksBottom] = splitByY('strap_medium_5');
const [endTop1, endBottom1] = splitByY('belt fastener_1');
const [endTop2, endBottom2] = splitByY('belt fastener_2');

// 2. assemblies (names are what the site's exploded view and labels refer to)
const GROUPS = {
  crystal: ['glass', 'glass_numbers'],
  bezel: ['case_signature'],
  hand_hour: ['arrow_small'],
  hand_minute: ['arrow_medium'],
  hand_second: ['arrow_big', 'arrow_cylinder'],
  dial: ['tablo', 'tablo_logo', 'numbers', 'logo', 'tablo_monday', 'tablo_28', 'case_logo_rolex',
         'case_logo_rolex.002', 'case_logo_rolex.003', 'logo_case_rolex', 'logo_case_rolex.001'],
  case: ['case_rolex', 'case_bolts'],
  crown: ['clasp', 'clasp_logo'],
  caseback: ['back_cap', 'back_cap_2', 'back_cap_3', 'back_cap_4', 'back_cap_signature'],
  strap_top: ['strap_3', 'strap_2', 'split_pin', linksTop, endTop1, endTop2],
  strap_bottom: ['strap_4', 'strap_1', 'belt buckle', 'logo_back', linksBottom, endBottom1, endBottom2],
};
for (const n of [...scene.listChildren()]) scene.removeChild(n);
const assembly = doc.createNode('Watch');
scene.addChild(assembly);
const assigned = new Set();
for (const [group, members] of Object.entries(GROUPS)) {
  const g = doc.createNode(group);
  assembly.addChild(g);
  for (const m of members) {
    const n = byName(m);
    if (!n) throw new Error('missing part ' + m);
    n.getParentNode()?.removeChild(n);
    g.addChild(n);
    assigned.add(n);
  }
}
const leftovers = root.listNodes().filter((n) => n.getMesh() && !assigned.has(n));
if (leftovers.length) console.log('unassigned parts:', leftovers.map((n) => n.getName()));

for (const g of assembly.listChildren()) {
  const b = getBounds(g);
  console.log(g.getName().padEnd(13), 'centre', b.min.map((v, i) => ((v + b.max[i]) / 2).toFixed(2)).join(','), 'size', b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join(','));
}

// hand directions (clockwise degrees from 12) for the live-time hands in the site
for (const g of ['hand_hour', 'hand_minute', 'hand_second']) {
  let best = [0, 0, 0];
  for (const n of byName(g).listChildren()) {
    if (n.getName() === 'arrow_cylinder') continue;
    for (const p of n.getMesh().listPrimitives()) {
      const a = p.getAttribute('POSITION'), v = [0, 0, 0];
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); const d = Math.hypot(v[0], v[1]); if (d > best[0]) best = [d, v[0], v[1]]; }
    }
  }
  let ang = (Math.atan2(best[1], best[2]) * 180) / Math.PI;
  if (ang < 0) ang += 360;
  console.log(`${g}: length ${best[0].toFixed(2)}, points to ${ang.toFixed(1)}°`);
}

// 4. compress
await doc.transform(
  prune(), dedup(), weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 90 }),
  draco({ quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14 }),
);
await io.write(OUT, doc);
console.log('wrote', OUT);
