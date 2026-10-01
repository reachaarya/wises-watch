/**
 * Shared helper: works out the transform that puts the Datejust model into "watch space":
 * dial centre at the origin, dial facing +Z, 12 o'clock at +Y, 3 o'clock at +X,
 * scaled so the case is ~2.45 units across (the size the site's camera is tuned for).
 */
import { mat4, vec3 } from 'gl-matrix';

export function worldPoints(node) {
  const M = node.getWorldMatrix(), pts = [];
  for (const p of node.getMesh().listPrimitives()) {
    const a = p.getAttribute('POSITION'), v = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) pts.push(vec3.transformMat4([], a.getElement(i, v), M));
  }
  return pts;
}
const centre = (pts) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  return mn.map((v, k) => (v + mx[k]) / 2);
};

export function watchFrame(doc, caseWidth = 2.45) {
  const byName = (n) => doc.getRoot().listNodes().find((x) => x.getName() === n);
  const dial = centre(worldPoints(byName('tablo')));
  const twelve = centre(worldPoints(byName('tablo_monday'))); // day window sits at 12
  const three = centre(worldPoints(byName('tablo_28')));       // date window sits at 3

  const right = vec3.normalize([], vec3.sub([], three, dial));
  let up = vec3.sub([], twelve, dial);
  vec3.normalize(up, vec3.scaleAndAdd([], up, right, -vec3.dot(up, right)));
  const normal = vec3.cross([], right, up); // viewer side of the dial

  // world → watch space rotation (rows are the new axes)
  const R = mat4.fromValues(
    right[0], up[0], normal[0], 0,
    right[1], up[1], normal[1], 0,
    right[2], up[2], normal[2], 0,
    0, 0, 0, 1,
  );
  // width of the case along 3 o'clock
  const casePts = worldPoints(byName('case_rolex'));
  let mn = Infinity, mx = -Infinity;
  for (const p of casePts) { const d = vec3.dot(vec3.sub([], p, dial), right); mn = Math.min(mn, d); mx = Math.max(mx, d); }
  const s = caseWidth / (mx - mn);

  const M = mat4.create();
  mat4.scale(M, M, [s, s, s]);
  mat4.multiply(M, M, R);
  mat4.translate(M, M, vec3.negate([], dial));
  return { M, scale: s };
}
