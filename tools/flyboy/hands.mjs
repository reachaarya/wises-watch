import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('../Wise FlyBoy Watch.glb');
const cx=0, cy=-0.0063;
for (const name of ['Hour Hand','Hour Hand.001','SecondHand']) {
  const n = doc.getRoot().listNodes().find(x=>x.getName()===name);
  const M = n.getWorldMatrix(); let best=[0,0,0];
  for (const p of n.getMesh().listPrimitives()) { const a=p.getAttribute('POSITION'); const v=[0,0,0];
    for (let i=0;i<a.getCount();i++){ a.getElement(i,v); const x=M[0]*v[0]+M[4]*v[1]+M[8]*v[2]+M[12]-cx, y=M[1]*v[0]+M[5]*v[1]+M[9]*v[2]+M[13]-cy;
      const d=Math.hypot(x,y); if(d>best[0]) best=[d,x,y]; } }
  let ang = Math.atan2(best[1],best[2])*180/Math.PI; if(ang<0) ang+=360;
  console.log(name, 'len', best[0].toFixed(3), 'clockwise-from-12 deg', ang.toFixed(1));
}
