import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
function walk(n, d){
  const m = n.getMesh();
  let info='';
  if(m){ const b=getBounds(n); const c=b.min.map((v,i)=>((v+b.max[i])/2).toFixed(4)); const s=b.max.map((v,i)=>(v-b.min[i]).toFixed(4));
    let tris=0; m.listPrimitives().forEach(p=>{const ix=p.getIndices(); tris+= ix? ix.getCount()/3 : p.getAttribute('POSITION').getCount()/3});
    info=` mesh=${m.getName()} prims=${m.listPrimitives().length} tris=${tris} mats=[${m.listPrimitives().map(p=>p.getMaterial()?.getName()).join(',')}] c=${c} s=${s}`;}
  console.log('  '.repeat(d)+'- '+n.getName()+` t=${n.getTranslation().map(v=>v.toFixed(3))} r=${n.getRotation().map(v=>v.toFixed(2))} sc=${n.getScale().map(v=>v.toFixed(3))}`+info);
  n.listChildren().forEach(c=>walk(c,d+1));
}
root.listScenes().forEach(s=>s.listChildren().forEach(n=>walk(n,0)));
console.log('TEXTURES');
root.listTextures().forEach(t=>console.log(t.getName(), t.getMimeType(), t.getSize(), (t.getImage().byteLength/1e6).toFixed(2)+'MB'));
console.log('MATERIALS');
root.listMaterials().forEach(m=>console.log(m.getName(), m.getBaseColorFactor().map(v=>v.toFixed(2)), 'metal',m.getMetallicFactor(),'rough',m.getRoughnessFactor(), 'tex', !!m.getBaseColorTexture(), m.getAlphaMode()));
console.log('anims', root.listAnimations().length);
