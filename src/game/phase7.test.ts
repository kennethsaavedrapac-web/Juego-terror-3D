import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FinalSequence, FINAL_LENGTH, FACTORY_Z, FINAL_MONSTER_SPEED, smooth } from './finalSequence';
import { finalColliders } from './finalEnvironment';
import { resolvePlayerMovement, SPRINT_SPEED } from './physics';
import { Watcher } from './watcher';
import { createDoorSystem } from './doors';
import { InteractionSystem } from './interactions';
import { InventoryManager } from './inventory';
import { buildStaticColliders } from './mapData';
import type { BuildingTextures } from './textures';

test('final door rejects missing keys, physically opens over four seconds and connects to tunnel',()=>{
  const texture=new THREE.Texture();
  const textures=new Proxy({createSignTexture:()=>texture},{get:(t,k)=>k in t?Reflect.get(t,k):texture}) as unknown as BuildingTextures;
  const doors=createDoorSystem([],textures,false);
  const interactions=new InteractionSystem();
  const inv=new InventoryManager(); const final=new FinalSequence();
  const p=new THREE.Vector3(0,1.68,-19.2);
  doors.registerInteractions(interactions,p,()=>{},{canUnlock:()=>inv.canUnlockExit(),onLockedAttempt:()=>{},onUnlockSuccess:()=>{inv.unlockExit();final.unlock(true);}});
  const camera=new THREE.PerspectiveCamera(70,1,.1,240);camera.position.copy(p);camera.lookAt(0,1.68,-30);camera.updateMatrixWorld();doors.group.updateMatrixWorld(true);
  interactions.evaluate(camera);interactions.triggerActive();assert.equal(final.stage,'PLAYING');
  for(const id of ['key-recepcion','key-oficina','key-almacen'])inv.collectKey(id);
  interactions.evaluate(camera);interactions.triggerActive();assert.equal(final.stage,'FINAL_DOOR_OPENING');
  const gate=doors.colliders.find(c=>c.id==='exit-door')!;
  for(let i=0;i<70;i++)doors.update(.05);
  assert.equal(gate.active,true);
  for(let i=0;i<12;i++)doors.update(.05);
  assert.equal(gate.active,false);
  const colliders=[...buildStaticColliders().filter(c=>c.id!=='exit-door'),...doors.colliders,...finalColliders()];
  let z=-19.2;
  for(let i=0;i<440;i++)z=resolvePlayerMovement(0,z,{value:100,exhausted:false},{forward:1,strafe:0,yaw:0,sprintHeld:true,dt:.05},colliders).z;
  assert.ok(z<FACTORY_Z,'continuous walkable route through real exit leaves and old north wall');
  final.reset(true); inv.relockExit(); doors.reset();
  assert.equal(inv.getSnapshot().keysCollected,3);assert.equal(gate.active,true);assert.equal(final.checkpoint,true);
  assert.equal(final.unlock(true),true); assert.equal(final.unlock(true),false);
  doors.dispose();texture.dispose();
});

test('20 second route is survivable at 30/60/120 FPS; stopping is lethal; rig runs',()=>{
  assert.equal(FINAL_LENGTH/SPRINT_SPEED,20);
  for(const fps of [30,60,120]){
    let captures=0,steps=0;
    const enemy=new Watcher(finalColliders(),[],()=>captures++,()=>{}, {onFootstep:()=>steps++});
    enemy.active=true;enemy.position.set(0,0,-23);
    let z=-37;
    while(z>FACTORY_Z){const old=z;z-=SPRINT_SPEED/fps;if(z>FACTORY_Z)enemy.updateFinal(1/fps,{x:0,z},{x:0,z:old},FINAL_MONSTER_SPEED);}
    assert.equal(captures,0);assert.ok(steps>15);assert.equal(enemy.state,'CHASE');
    for(let i=0;i<fps*5;i++)enemy.updateFinal(1/fps,{x:0,z},{x:0,z},FINAL_MONSTER_SPEED);
    assert.equal(captures,1);assert.equal(enemy.state,'ATTACK');enemy.dispose();
  }
});

test('safe boundary precedes attack; reveal, title and moving credits finish once; reset is clean',()=>{
  const sequence=new FinalSequence();assert.equal(sequence.unlock(false),false);sequence.unlock(true);
  sequence.update(4,-22);assert.equal(sequence.stage,'FINAL_ESCAPE');
  sequence.update(.05,FACTORY_Z);assert.equal(sequence.stage,'FINAL_FACTORY_REVEAL');
  sequence.update(9,FACTORY_Z);assert.equal(sequence.stage,'TO_BE_CONTINUED');
  sequence.update(5,FACTORY_Z);assert.equal(sequence.stage,'END_CREDITS');
  sequence.update(26,FACTORY_Z);assert.equal(sequence.stage,'END_CREDITS');
  sequence.update(1,FACTORY_Z);assert.equal(sequence.stage,'END_COMPLETE');
  sequence.update(30,FACTORY_Z);assert.equal(sequence.stage,'END_COMPLETE');
  sequence.reset();assert.equal(sequence.stage,'PLAYING');assert.equal(sequence.checkpoint,false);
  assert.equal(smooth(0),0);assert.equal(smooth(1),1);assert.ok(smooth(.01)<.001);
});
