import * as THREE from 'three';
import { FACTORY_Z, FINAL_ENTRY_Z, FINAL_LENGTH } from './finalSequence';
import type { AABBCollider } from './types';
import type { BuildingTextures } from './textures';

export function finalColliders(): AABBCollider[] {
  return [-1, 1].map(side => ({ id: `final-wall-${side}`, minX: side < 0 ? -3.5 : 3, maxX: side < 0 ? -3 : 3.5, minZ: FACTORY_Z - 2, maxZ: FINAL_ENTRY_Z, kind: 'wall' }));
}

/** Shared geometry and material batches keep the monumental set inexpensive. */
export function buildFinalEnvironment(textures: BuildingTextures) {
  const group = new THREE.Group();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const steel = new THREE.MeshStandardMaterial({ color: 0x708590, metalness: .35, roughness: .66, map: textures.metalMap });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x727c7b, roughness: .98, map: textures.wallMap });
  const rust = new THREE.MeshStandardMaterial({ color: 0x735039, roughness: .84, map: textures.metalMap });
  const cold = new THREE.MeshBasicMaterial({ color: 0x8ec9da });
  const red = new THREE.MeshBasicMaterial({ color: 0xf64c25 });
  const batches = new Map<THREE.Material, THREE.Matrix4[]>();
  const pipes: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  function box(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    dummy.position.set(x,y,z); dummy.rotation.set(0,0,0); dummy.scale.set(w,h,d); dummy.updateMatrix();
    const batch = batches.get(mat) ?? []; batch.push(dummy.matrix.clone()); batches.set(mat,batch);
  }
  function pipe(x: number,y: number,z: number,r: number,length: number, horizontal = true) {
    dummy.position.set(x,y,z); dummy.rotation.set(horizontal ? Math.PI/2 : 0,0,0); dummy.scale.set(r,length,r); dummy.updateMatrix(); pipes.push(dummy.matrix.clone());
  }
  const mid = FINAL_ENTRY_Z - FINAL_LENGTH/2;
  box(concrete,0,-.15,mid,6.6,.3,FINAL_LENGTH + 1);
  box(concrete,0,4.5,mid,6.6,.35,FINAL_LENGTH);
  for (const s of [-1,1]) {
    box(concrete,s*3.25,2.2,mid,.5,4.5,FINAL_LENGTH);
    pipe(s*2.7,3.4,mid,.16,FINAL_LENGTH);
    pipe(s*2.5,3.9,mid,.09,FINAL_LENGTH);
  }
  for (let z = -25; z > FACTORY_Z; z -= 7) {
    for (const s of [-1,1]) {
      box(steel,s*2.93,2.2,z,.14,4.4,.22);
      box(red,s*2.87,1,z,.08,.12,1.8);
      box(rust,s*2.91,1.6,z-2,.12,1.1,.55);
    }
    // Vent grills, damp seams and suspended service duct.
    for(let j=0;j<6;j++) box(steel,2.97,2+j*.09,z-3,.06,.035,1.2);
    box(rust,-2.99,1.9,z-1,.025,2.4,.35);
    box(steel,.5,4.05,z,1.1,.45,6.8);
    box(steel,0,4.2,z,6,.18,.22);
    box(steel,0,.015,z,4.8,.025,.22);
    // Hanging cable bundles remain above the actors' collision volume.
    box(steel,1.4,3.65,z,.04,1,.04);
  }
  // 110 m wide / 62 m tall hall; platforms, trusses, gantry and reactor silhouettes.
  box(concrete,0,-.3,FACTORY_Z-65,120,.6,132);
  box(concrete,0,62,FACTORY_Z-65,120,.8,132);
  box(concrete,0,30,FACTORY_Z-130,120,62,1);
  for (const x of [-44,-16,16,44]) for (let i=0;i<6;i++) {
    const z=FACTORY_Z-12-i*20;
    box(steel,x,30,z,1.7,60,1.7);
    box(rust,x,2,z,3,4,3);
    box(cold,x,44,z,1,.3,1);
    box(steel,0,59,z,100,1.4,1.1);
    for (const y of [12,27,43]) {
      box(steel,x,y,z,13,.5,18);
      box(rust,x-6,y+1,z,.13,2,18);
      box(rust,x+6,y+1,z,.13,2,18);
      box(cold,x,y-.4,z,8,.08,.2);
    }
  }
  for (const z of [FACTORY_Z-28,FACTORY_Z-68,FACTORY_Z-108]) {
    box(steel,0,28,z,90,.7,4);
    for (const side of [-1,1]) box(rust,0,29,z+side*2,90,1.7,.12);
    pipe(-17,46,z,2.4,38); pipe(17,51,z,1.8,38);
    for (const x of [-36,36]) {
      pipe(x,9,z,6,18,false);
      box(rust,x,19,z,9,2,9);
      box(red,x,11,z+6,.6,7,.12);
    }
  }
  box(rust,0,50,FACTORY_Z-52,72,3,3);
  box(steel,4,40,FACTORY_Z-52,.18,18,.18);
  box(rust,4,31,FACTORY_Z-52,3,1,1);
  // Frame the arrival with a warm aperture against the cold hall.
  for (const x of [-4,4]) box(rust,x,4,FACTORY_Z,1,8,1);
  box(cold,0,7.7,FACTORY_Z,9,.25,.3);
  for (const [mat, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(cube, mat, matrices.length);
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix)); mesh.computeBoundingSphere(); group.add(mesh);
  }
  const tubes = new THREE.InstancedMesh(cylinder,steel,pipes.length);
  pipes.forEach((matrix,i)=>tubes.setMatrixAt(i,matrix)); tubes.computeBoundingSphere(); group.add(tubes);
  const fill = new THREE.HemisphereLight(0x9dbfd4,0x30261f,2.6); fill.position.z=FACTORY_Z-40; fill.visible=false; group.add(fill);
  const lamps = [new THREE.PointLight(0xff522c,14,18,2),new THREE.PointLight(0xaadfff,90,95,1.5)];
  lamps[1].position.set(0,22,FACTORY_Z-40); group.add(...lamps);
  const steamGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(80*3);
  for(let i=0;i<80;i++){ positions[i*3]=Math.sin(i*31)*45; positions[i*3+1]=3+(i%13)*3; positions[i*3+2]=FACTORY_Z-10-(i%17)*7; }
  steamGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const vaporCanvas=document.createElement('canvas');vaporCanvas.width=vaporCanvas.height=64;
  const vaporCtx=vaporCanvas.getContext('2d')!;
  const gradient=vaporCtx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(190,215,225,.5)');gradient.addColorStop(1,'rgba(190,215,225,0)');
  vaporCtx.fillStyle=gradient;vaporCtx.fillRect(0,0,64,64);
  const vaporMap=new THREE.CanvasTexture(vaporCanvas);
  const steamMat=new THREE.PointsMaterial({map:vaporMap,color:0xacc4ca,size:5,transparent:true,opacity:.12,depthWrite:false});
  const steam=new THREE.Points(steamGeo,steamMat); group.add(steam);
  return {group, update(z:number,time:number,reveal:boolean,disableFlashes:boolean){
    fill.visible=reveal; lamps[0].position.set(0,3,z-5); lamps[0].intensity=disableFlashes?14:11+3*Math.sin(time*7);
    steam.position.y=Math.sin(time*.18)*1.5;
  }, dispose(){ cube.dispose(); cylinder.dispose(); steamGeo.dispose(); steamMat.dispose(); vaporMap.dispose(); [steel,concrete,rust,cold,red].forEach(m=>m.dispose()); }};
}
