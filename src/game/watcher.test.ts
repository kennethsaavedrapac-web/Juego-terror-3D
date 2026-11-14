import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUILDING_DOORS, BUILDING_KEYS, BUILDING_ROOMS, buildStaticColliders, getDoorClosedCollider } from './mapData';
import { floorHeightAt } from './expansion';
import { NavigationGraph, clearSegment } from './navigation';
import { Watcher, WatcherVision, WATCHER_DIFFICULTY } from './watcher';
import { createDoorSystem } from './doors';
import type { BuildingTextures } from './textures';

const colliders = [...buildStaticColliders(),...BUILDING_DOORS.map(d=>({...getDoorClosedCollider(d),active:false}))];
const graph = new NavigationGraph(colliders);
const origin={x:0,z:15};
const cameraAt=(x:number,y:number,z:number,tx:number,ty:number,tz:number)=>{
  const camera=new THREE.PerspectiveCamera(70,16/9,.1,80);
  camera.position.set(x,y,z); camera.lookAt(tx,ty,tz); camera.updateMatrixWorld(true); return camera;
};

test('A* reaches every playable room and each relocated key, with swept clearance on every edge',()=>{
  for(const room of BUILDING_ROOMS) {
    const target=graph.nodes.find(p=>p.x>room.minX+1 && p.x<room.maxX-1 && p.z>room.minZ+1 && p.z<room.maxZ-1);
    assert.ok(target,room.id);
    const path=graph.findPath(origin,target);
    assert.ok(path.length,`disconnected: ${room.id}`);
    for(let i=1;i<path.length;i++) assert.ok(clearSegment(path[i-1],path[i],colliders),`${room.id}: edge ${i}`);
  }
  for(const key of BUILDING_KEYS) {
    const approaches=graph.nodes.filter(p=>Math.hypot(p.x-key.x,p.z-key.z)<1.5);
    assert.ok(approaches.some(p=>graph.findPath(origin,p).length),`unreachable key: ${key.id}`);
  }
});

test('stair connection has continuous support and routes down and back up',()=>{
  const path=graph.findPath({x:15,z:-12},{x:20,z:-25});
  assert.ok(path.length);
  assert.ok(path.some(p=>floorHeightAt(p.x,p.z)===-3));
  for(let i=1;i<path.length;i++) assert.ok(Math.abs(floorHeightAt(path[i].x,path[i].z)-floorHeightAt(path[i-1].x,path[i-1].z))<=.19);
  assert.ok(graph.findPath({x:20,z:-25},{x:15,z:-12}).length);
});

test('a player hugging a wall remains reachable without steering the wider enemy into it',()=>{
  const path=graph.findPath({x:0,z:5},{x:1.17,z:0});
  assert.ok(path.length);
  assert.ok(Math.hypot(path.at(-1)!.x-1.17,path.at(-1)!.z)<.85);
  for(let i=1;i<path.length;i++)assert.ok(clearSegment(path[i-1],path[i],colliders));
});

test('closed doors cannot be crossed; live opening restores the route',()=>{
  const doors=BUILDING_DOORS.map(getDoorClosedCollider);
  const nav=new NavigationGraph([...buildStaticColliders(),...doors]);
  assert.equal(nav.findPath(origin,{x:15,z:4}).length,0);
  doors.find(d=>d.id==='door-pasillo-almacen')!.active=false;
  const path=nav.findPath(origin,{x:15,z:4}); assert.ok(path.length);
  doors.find(d=>d.id==='door-pasillo-almacen')!.active=true;
  assert.ok(path.some((p,i)=>i>0&&!clearSegment(path[i-1],p,doors)));
});

test('vision freezes a distant and partially exposed body; walls, doors, rear and pitch occlude correctly',()=>{
  const camera=cameraAt(0,1.68,15,0,1.7,-10), pos=new THREE.Vector3(0,0,-10);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(8,4,.4),new THREE.MeshBasicMaterial());
  mesh.position.set(0,2,0); mesh.updateMatrixWorld(true);
  const vision=new WatcherVision([]);
  assert.equal(vision.visible(camera,pos),true);
  assert.equal(new WatcherVision([mesh]).visible(camera,pos),false);
  mesh.scale.y=.2; mesh.position.y=.4; mesh.updateMatrixWorld(true);
  assert.equal(new WatcherVision([mesh]).visible(camera,pos),true,'head visible over low furniture');
  camera.lookAt(0,1.7,30); camera.updateMatrixWorld(true);
  assert.equal(vision.visible(camera,pos),false);
  camera.lookAt(0,40,15); camera.updateMatrixWorld(true);
  assert.equal(vision.visible(camera,pos),false);
  mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
});

test('watching wins over capture at every key tier, fast turns freeze immediately, reset clears capture',()=>{
  let captures=0;
  const enemy=new Watcher(colliders,[],()=>captures++,()=>{});
  const camera=cameraAt(0,1.68,5,0,1.7,4.3);
  enemy.active=true; enemy.position.set(0,0,4.3);
  for(let keys=0;keys<=3;keys++) {
    const before=enemy.position.clone();
    enemy.update(.05,camera,{x:0,z:5},keys);
    assert.equal(enemy.state,'FROZEN'); assert.ok(enemy.position.equals(before));
  }
  assert.equal(captures,0);
  camera.lookAt(0,1.7,20); camera.updateMatrixWorld(true);
  enemy.update(.05,camera,{x:0,z:5},3);
  assert.equal(captures,1); assert.equal(enemy.state,'ATTACK');
  enemy.update(.05,camera,{x:0,z:5},3); assert.equal(captures,1);
  enemy.reset(); assert.equal(enemy.active,false); assert.equal(enemy.state,'PATROL');
  enemy.active=true; enemy.position.set(0,0,-8);
  enemy.update(.05,camera,{x:0,z:5},3); assert.ok(enemy.position.z>-8);
  camera.lookAt(enemy.position.x,1.8,enemy.position.z); camera.updateMatrixWorld(true);
  const before=enemy.position.clone(); enemy.update(.05,camera,{x:0,z:5},3);
  assert.equal(enemy.state,'FROZEN'); assert.ok(enemy.position.equals(before)); enemy.dispose();
});

test('enemy actually walks a multi-room pursuit, around furniture and down/up the stairs without penetration',()=>{
  const enemy=new Watcher(colliders,[],()=>{},()=>{}); enemy.active=true; enemy.position.set(0,0,14);
  for(const target of [{x:15,z:4},{x:24,z:-6},{x:20,z:-25},{x:-20,z:-8},{x:0,z:-19}]) {
    let frames=0;
    while(Math.hypot(enemy.position.x-target.x,enemy.position.z-target.z)>1.1 && frames++<9000) {
      const dx=target.x-enemy.position.x,dz=target.z-enemy.position.z;
      const camera=cameraAt(target.x,floorHeightAt(target.x,target.z)+1.68,target.z,target.x+dx,1.68,target.z+dz);
      const before={x:enemy.position.x,z:enemy.position.z};
      enemy.update(.05,camera,target,3);
      assert.ok(clearSegment(before,enemy.position,colliders),'crossed an obstacle');
      assert.equal(enemy.position.y,floorHeightAt(enemy.position.x,enemy.position.z));
    }
    assert.ok(frames<9000,`stuck pursuing ${JSON.stringify(target)} at ${enemy.position.toArray()}`);
  }
  enemy.dispose();
});

test('introduction waits 18 seconds and never appears in the visible corridor',()=>{
  const enemy=new Watcher(colliders,[],()=>{},()=>{});
  const camera=cameraAt(0,1.68,15,0,1.7,-10);
  for(let i=0;i<359;i++)enemy.update(.05,camera,origin,0);
  assert.equal(enemy.active,false);
  camera.lookAt(0,1.7,30);camera.updateMatrixWorld(true);
  for(let i=0;i<25;i++)enemy.update(.05,camera,origin,0);
  assert.equal(enemy.active,true); assert.ok(enemy.position.distanceTo(camera.position)>14); enemy.dispose();
});

test('difficulty is progressive and remains slower than walking; model gait animates then freezes',()=>{
  for(let i=1;i<4;i++) { assert.ok(WATCHER_DIFFICULTY[i].speed>WATCHER_DIFFICULTY[i-1].speed); assert.ok(WATCHER_DIFFICULTY[i].repath<WATCHER_DIFFICULTY[i-1].repath); }
  assert.ok(WATCHER_DIFFICULTY[3].speed<3.4);
  const enemy=new Watcher(colliders,[],()=>{},()=>{});
  const snapshot=()=>{const r:number[]=[];enemy.model.root.traverse(o=>r.push(o.rotation.x,o.rotation.y,o.rotation.z));return r;};
  const before=snapshot();enemy.model.animate(.3,2,false,false);assert.notDeepEqual(snapshot(),before);
  const frozen=snapshot();enemy.model.animate(.3,2,true,false);assert.deepEqual(snapshot(),frozen);enemy.dispose();
});

test('animated door leaves remain physical when open and refuse to sweep through an occupant',()=>{
  const texture=new THREE.Texture();
  const textures=new Proxy({createSignTexture:()=>texture},{get:(target,key)=>key in target?Reflect.get(target,key):texture}) as unknown as BuildingTextures;
  const system=createDoorSystem([BUILDING_DOORS[0]],textures,false), d=system.doors[0];
  d.isOpen=true;d.targetAngle=d.def.openAngle;
  for(let i=0;i<60;i++)system.update(.05);
  assert.equal(d.collider.active,false);assert.equal(d.leafCollider.active,true);
  assert.ok(d.leafCollider.maxZ-d.leafCollider.minZ>1);
  const actor=new THREE.Vector3(d.def.x,0,d.def.z);
  d.isOpen=false;d.targetAngle=0;
  for(let i=0;i<60;i++)system.update(.05,[actor]);
  assert.ok(Math.abs(d.currentAngle)>1.2,'door closed through occupant');
  system.reset();assert.equal(d.collider.active,true);system.dispose();texture.dispose();
});

test('real fully-open door leaves allow navigation to both wings and basement',()=>{
  const texture=new THREE.Texture();
  const textures=new Proxy({createSignTexture:()=>texture},{get:(target,key)=>key in target?Reflect.get(target,key):texture}) as unknown as BuildingTextures;
  const system=createDoorSystem(BUILDING_DOORS,textures,false);
  for(const d of system.doors){d.isOpen=true;d.targetAngle=d.def.openAngle;}
  for(let i=0;i<60;i++)system.update(.05);
  const boxes=[...buildStaticColliders().filter(c=>c.id!=='exit-door'),...system.colliders];
  const nav=new NavigationGraph(boxes);
  for(const target of [{x:15,z:4},{x:20,z:-25},{x:-20,z:-8}]) {
    const path=nav.findPath(origin,target);assert.ok(path.length,JSON.stringify(target));
    for(let i=1;i<path.length;i++)assert.ok(clearSegment(path[i-1],path[i],boxes));
  }
  system.dispose();texture.dispose();
});
