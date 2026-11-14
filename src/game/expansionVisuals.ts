import * as THREE from 'three';
import { CLINICAL_SOLIDS, EXPANSION_ROOMS, floorHeightAt } from './expansion';
import type { BuildingTextures } from './textures';

export function buildExpansionVisuals(textures: BuildingTextures) {
  const group = new THREE.Group(), occluders: THREE.Object3D[] = [];
  const geo=new THREE.BoxGeometry(1,1,1);
  const steel=new THREE.MeshStandardMaterial({color:0x475451,roughness:.85,metalness:.2});
  const fabric=new THREE.MeshStandardMaterial({color:0x637e72,map:textures.wallMap,roughness:1});
  const dark=new THREE.MeshStandardMaterial({color:0x272c2b,roughness:.95});
  const floor=new THREE.MeshStandardMaterial({color:0x9eaca5,map:textures.floorMap,roughness:.92});
  const materials: THREE.Material[]=[steel,fabric,dark,floor];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material,solid=true)=>{
    const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.scale.set(w,h,d); group.add(m); if(solid)occluders.push(m); return m;
  };
  for (const r of EXPANSION_ROOMS) {
    if(r.id==='escaleras')continue;
    const x=(r.minX+r.maxX)/2,z=(r.minZ+r.maxZ)/2,y=floorHeightAt(x,z);
    box(x,y-.1,z,r.maxX-r.minX,.2,r.maxZ-r.minZ,floor);
    box(x,y+3.65,z,r.maxX-r.minX,.1,r.maxZ-r.minZ,dark);
    const signMat=new THREE.MeshStandardMaterial({map:textures.createSignTexture(r.name.toUpperCase(),r.id==='sotano'?'AISLAMIENTO · NO ABRIR':'SECTOR CLAUSURADO'),emissive:0x25332e,emissiveIntensity:.3});
    materials.push(signMat);
    box(x,y+2.5,r.minZ+.24,2,.5,.03,signMat,false);
  }
  for(let i=0;i<32;i++) {
    const z=-14-(i+.5)*.25,y=floorHeightAt(15,z);
    box(15,y-.075,z,3.6,.15,.25,steel);
  }
  // Continuous side rails follow the stair incline; no collision across the passage.
  for(const x of [13.4,16.6]) {
    const rail=box(x,-.4,-18,.05,.05,Math.hypot(8,3),steel,false); rail.rotation.x=-Math.atan2(3,8);
  }
  box(15,3.65,-18,4,.1,8,dark);
  for(const p of CLINICAL_SOLIDS) {
    const y=floorHeightAt(p.x,p.z);
    if(p.kind==='bed') {
      box(p.x,y+.6,p.z,p.w,.12,p.d,steel);
      box(p.x,y+.73,p.z,p.w*.92,.15,p.d*.94,fabric);
      for(const side of [-1,1]) {
        box(p.x,y+.98,p.z+side*(p.d/2-.07),p.w,.045,.045,steel);
        box(p.x,y+.86,p.z+side*(p.d/2-.07),p.w,.035,.035,steel);
        for(const end of [-1,1])box(p.x+end*(p.w/2-.1),y+.28,p.z+side*(p.d/2-.15),.07,.56,.07,steel);
      }
    } else box(p.x,y+p.h/2,p.z,p.w,p.h,p.d,p.kind==='generator'?steel:dark);
  }
  for(let i=0;i<7;i++)box(20, .4+i*.16, 1.46, 1.5, .06, .025, dark);
  box(20.6, 1.9, .2, .14, .5, .14, steel);
  // Torn curtain panels hang behind beds, leaving both patient routes unobstructed.
  box(24.2,2.95,-13.55,3,.035,.035,steel,false);
  for(let i=0;i<12;i++) {
    const h=1.7+(i%4)*.09;
    const sheet=box(22.9+i*.24,2.9-h/2,-13.55,.26,h,.025,fabric);
    sheet.rotation.y=i%2===0 ? .35 : -.35;
  }
  // Medical monitor and IV stand stay inside a bed's existing collision footprint.
  box(19.3,1.13,-12.8,.35,.34,.22,dark);
  box(25.4,1.2,-11,.035,2.3,.035,steel);
  box(25.35,2.15,-11,.15,.27,.08,fabric);
  // Industrial conduits high above the walkable lanes.
  for(const z of [-1,0,1])box(22,3.15,z,9,.1,.12,steel,false);
  const isolation=new THREE.MeshStandardMaterial({color:0x342b29,roughness:1,map:textures.metalMap}); materials.push(isolation);
  box(25.5,-1.8,-27.76,1.5,2.4,.06,isolation);
  for(const y of [-2,-1])box(25.5,y,-27.7,1.7,.09,.08,steel,false);
  // Batch repeated boxes by material; one draw call per material, including raycast support.
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of group.children) {
    const mesh = child as THREE.Mesh; const material = mesh.material as THREE.Material;
    const batch = batches.get(material) ?? []; batch.push(mesh); batches.set(material,batch);
  }
  group.clear(); occluders.length=0;
  const instances: THREE.InstancedMesh[]=[];
  for (const [material,meshes] of batches) {
    const batch = new THREE.InstancedMesh(geo,material,meshes.length);
    meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);});
    batch.computeBoundingSphere(); group.add(batch); occluders.push(batch); instances.push(batch);
  }
  return {group,occluders,dispose(){instances.forEach(m=>m.dispose());geo.dispose();materials.forEach(m=>m.dispose());}};
}
