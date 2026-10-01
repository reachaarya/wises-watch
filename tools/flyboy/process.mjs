import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, resample, textureCompress, draco, getBounds } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { wrapStraps } from './wrist.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read('../Wise FlyBoy Watch.glb');
const root = doc.getRoot();
const scene = root.listScenes()[0];
const byName = n => root.listNodes().find(x => x.getName() === n);

const watchRoot = byName('Empty.004');
const strapRoot = byName('Empty.005');

// Assemblies for the exploded view. Each group copies the original root transform,
// so moving children in with unchanged local transforms keeps world placement identical.
const GROUPS = {
  crystal:     ['Main dile.001'],
  bezel:       ['Main dile', 'Circle.005'],
  hand_minute: ['Hour Hand'],
  hand_hour:   ['Hour Hand.001', 'Plane.024'],
  hand_second: ['SecondHand'],
  dial:        ['Inside dile', 'Plane.014', 'Circle.013', 'Text', 'Text.001', 'Text.002', 'Text.003',
                'Text.004', 'Text.005', 'Text.006', 'Circle.006', 'Circle.008', 'Plane.022', 'Plane', 'Plane.001'],
  case:        ['Circle.007'],
  caseback:    ['Circle.010'],
  crown:       ['Cylinder', 'Cylinder.001', 'Plane.003', 'Plane.004', 'Circle.011', 'Circle.012'],
};
const STRAPS = { strap_top: ['Cube.001', 'Cube.005'], strap_bottom: ['Cube', 'Cube.006'] };

const assembly = doc.createNode('Watch');
scene.addChild(assembly);

function makeGroup(name, srcParent, kids, parentGroup) {
  const g = doc.createNode(name)
    .setTranslation(srcParent.getTranslation()).setRotation(srcParent.getRotation()).setScale(srcParent.getScale());
  parentGroup.addChild(g);
  for (const k of kids) { const n = byName(k); if (!n) throw new Error('missing ' + k); srcParent.removeChild(n); g.addChild(n); }
  return g;
}
for (const [name, kids] of Object.entries(GROUPS)) makeGroup(name, watchRoot, kids, assembly);
// strap groups: nested transform watchRoot * strapRoot
for (const [name, kids] of Object.entries(STRAPS)) {
  const outer = doc.createNode(name).setTranslation(watchRoot.getTranslation()).setRotation(watchRoot.getRotation()).setScale(watchRoot.getScale());
  assembly.addChild(outer);
  const inner = doc.createNode(name + '_inner').setTranslation(strapRoot.getTranslation()).setRotation(strapRoot.getRotation()).setScale(strapRoot.getScale());
  outer.addChild(inner);
  for (const k of kids) { const n = byName(k); strapRoot.removeChild(n); inner.addChild(n); }
}
// report leftovers, then drop the old roots and stray root objects
const left = [...watchRoot.listChildren().map(n => n.getName()), ...strapRoot.listChildren().map(n => n.getName())].filter(n => n !== 'Empty.005');
console.log('unassigned:', left);
for (const n of scene.listChildren()) if (n !== assembly) { scene.removeChild(n); }
for (const n of [watchRoot, strapRoot, ...['MAin thread','Empty','Empty.001','Empty.002','Empty.003','Small thread','Thread','Upper thread','Upper thread.001'].map(byName)]) n && n.dispose();

// Curve the straps around a wrist, as the watch would sit when worn
console.log('wrapping straps:');
wrapStraps(doc);

for (const g of assembly.listChildren()) {
  const b = getBounds(g);
  console.log(g.getName().padEnd(13), 'center', b.min.map((v, i) => ((v + b.max[i]) / 2).toFixed(3)).join(','), 'size', b.max.map((v, i) => (v - b.min[i]).toFixed(3)).join(','));
}

await doc.transform(
  prune({ keepAttributes: true }), dedup(), weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 88 }),
  draco({ quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14 }),
);
await io.write('public/models/flyboy.glb', doc);
