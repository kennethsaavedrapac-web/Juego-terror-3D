import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  FinalSequence,
  FINAL_LENGTH,
  FACTORY_Z,
  FINAL_MONSTER_SPEED,
  FINAL_STAGE_B_Z,
  FINAL_STAGE_C_Z,
  END_CREDITS_DURATION,
  computeFinalChaseSpeed,
  getFinalChasePhase,
  getFinalChaseMetrics,
  smooth,
} from './finalSequence';
import { finalColliders } from './finalEnvironment';
import { FinalAudio } from './finalAudio';
import {
  DOOR_MATERIAL_PROFILES,
  getAudioSettings,
  getEffectiveVolume,
  setAudioSettings,
  type DoorAction,
} from './audio';
import { resolvePlayerMovement, SPRINT_SPEED, WALK_SPEED } from './physics';
import { Watcher } from './watcher';
import { createWatcherModel } from './watcherModel';
import { createDoorSystem } from './doors';
import { InteractionSystem } from './interactions';
import { InventoryManager } from './inventory';
import { BUILDING_DOORS, buildStaticColliders } from './mapData';
import type { BuildingTextures } from './textures';
import type { DoorMaterial } from './types';

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

test('Phase 7.1: 3-stage final chase progression and real-distance proximity metrics', () => {
  assert.equal(END_CREDITS_DURATION, 27);
  assert.equal(getFinalChasePhase(-30, false, 'FINAL_ESCAPE'), 'NONE');
  assert.equal(getFinalChasePhase(-50, true, 'FINAL_ESCAPE'), 'PANIC_START');
  assert.equal(getFinalChasePhase(FINAL_STAGE_B_Z - 1, true, 'FINAL_ESCAPE'), 'DESPERATE_CHASE');
  assert.equal(getFinalChasePhase(FINAL_STAGE_C_Z - 1, true, 'FINAL_ESCAPE'), 'FINAL_METERS');

  const far = getFinalChaseMetrics(-50, -25, true, 'FINAL_ESCAPE');
  const close = getFinalChaseMetrics(-115, -110.5, true, 'FINAL_ESCAPE');
  assert.equal(far.phase, 'PANIC_START');
  assert.equal(close.phase, 'FINAL_METERS');
  assert.ok(close.threatProximity > far.threatProximity);
  assert.ok(close.monsterDistance < far.monsterDistance);
  assert.ok(close.tunnelProgress > 0.8 && close.tunnelProgress < 1);
  assert.equal(getFinalChaseMetrics(-135, -130, true, 'FINAL_FACTORY_REVEAL').threatProximity, 0);
});

test('Phase 7.1: shared audio volume and mute controls clamp cleanly', () => {
  const prev = getAudioSettings();
  try {
    setAudioSettings(0.6, false);
    assert.equal(getEffectiveVolume(), 0.6);
    setAudioSettings(1.8, false);
    assert.equal(getEffectiveVolume(), 1);
    setAudioSettings(-0.4, false);
    assert.equal(getEffectiveVolume(), 0);
    setAudioSettings(0.75, true);
    assert.equal(getEffectiveVolume(), 0);
  } finally {
    setAudioSettings(prev.volume, prev.muted);
  }
});

test('Phase 7.1: FinalAudio handles stage changes, updates, and reset safely without Web Audio global', () => {
  const audio = new FinalAudio();
  assert.doesNotThrow(() => {
    audio.setStage('FINAL_DOOR_OPENING');
    audio.update(0.05, 'PANIC_START', 0.2);
    audio.setStage('FINAL_ESCAPE');
    audio.playTunnelLockdownSlam();
    audio.update(0.05, 'DESPERATE_CHASE', 0.65);
    audio.update(0.05, 'FINAL_METERS', 0.9);
    audio.setStage('FINAL_FACTORY_REVEAL');
    audio.setStage('TO_BE_CONTINUED');
    audio.setStage('END_CREDITS');
    audio.update(0.5, 'FINAL_METERS', 0);
    audio.setStage('END_COMPLETE');
    audio.stop();
    audio.dispose();
  });
});

test('Phase 7.1: emergency tunnel walls leave clear 6m interior corridor', () => {
  const walls = finalColliders();
  assert.equal(walls.length, 2);
  const left = walls.find((c) => c.maxX <= 0)!;
  const right = walls.find((c) => c.minX >= 0)!;
  assert.equal(left.maxX, -3);
  assert.equal(right.minX, 3);
});

test('Phase 7.2: escalated final chase is violently faster yet survivable with clean sprint and lethal when walking/stopping', () => {
  const early = computeFinalChaseSpeed('PANIC_START', 14, 0.4);
  const settled = computeFinalChaseSpeed('PANIC_START', 10, 3.0);
  const mid = computeFinalChaseSpeed('DESPERATE_CHASE', 7.5, 8.0);
  const climax = computeFinalChaseSpeed('FINAL_METERS', 4.5, 14.0);
  assert.ok(early > settled, 'Initial burst accelerates aggressively');
  assert.ok(climax > settled && mid >= settled, 'Chase escalates toward FINAL_METERS');

  for (const fps of [30, 60, 120]) {
    let captures = 0;
    const enemy = new Watcher(finalColliders(), [], () => captures++, () => {});
    enemy.active = true;
    enemy.position.set(0, 0, -23);
    let z = -37;
    let t = 0;
    while (z > FACTORY_Z) {
      const old = z;
      const dt = 1 / fps;
      t += dt;
      z -= SPRINT_SPEED * dt;
      if (z > FACTORY_Z) {
        const phase = getFinalChasePhase(z, true, 'FINAL_ESCAPE');
        const dist = Math.abs(z - enemy.position.z);
        const speed = computeFinalChaseSpeed(phase, dist, t);
        enemy.updateFinal(dt, { x: 0, z }, { x: 0, z: old }, speed, phase === 'FINAL_METERS' ? 1.32 : 1.1);
      }
    }
    assert.equal(captures, 0, `Clean sprint must survive at ${fps} FPS`);
    const finalGap = Math.abs(FACTORY_Z - enemy.position.z);
    assert.ok(finalGap > 2.65 && finalGap < 7.0, `Monster should finish threateningly close (gap=${finalGap.toFixed(2)}m)`);
    enemy.dispose();
  }

  // Walking instead of sprinting through the tunnel MUST get caught
  let walkCaptures = 0;
  const walkEnemy = new Watcher(finalColliders(), [], () => walkCaptures++, () => {});
  walkEnemy.active = true;
  walkEnemy.position.set(0, 0, -23);
  let wz = -37;
  let wt = 0;
  for (let i = 0; i < 60 * 15 && walkCaptures === 0 && wz > FACTORY_Z; i++) {
    const old = wz;
    const dt = 1 / 60;
    wt += dt;
    wz -= WALK_SPEED * dt;
    const phase = getFinalChasePhase(wz, true, 'FINAL_ESCAPE');
    const speed = computeFinalChaseSpeed(phase, Math.abs(wz - walkEnemy.position.z), wt);
    walkEnemy.updateFinal(dt, { x: 0, z: wz }, { x: 0, z: old }, speed, 1.2);
  }
  assert.equal(walkCaptures, 1, 'Walking slowly in tunnel must result in monster capture');
  walkEnemy.dispose();
});

test('Phase 7.2: aggressive RUN pose deepens forward torso hunch and increases footstep cadence', () => {
  const normal = createWatcherModel();
  const furious = createWatcherModel();
  let normalSteps = 0;
  let furiousSteps = 0;

  for (let i = 0; i < 60; i++) {
    normal.animate(1 / 60, 5.95, false, false, {
      animState: 'RUN',
      aggression: 0,
      onFootstep: () => normalSteps++,
    });
    furious.animate(1 / 60, 6.25, false, false, {
      animState: 'RUN',
      aggression: 1.3,
      onFootstep: () => furiousSteps++,
    });
  }

  assert.ok(furiousSteps >= normalSteps, 'Furious aggression matches or exceeds normal run cadence');
  assert.ok(
    furious.rig.torso.rotation.x < normal.rig.torso.rotation.x,
    'Aggressive pursuit hunches torso further forward',
  );
  normal.dispose();
  furious.dispose();
});

test('Phase 7.2: material door audio emits distinct wood, metal, and 4-stage heavy_iron events plus physical close_slam', () => {
  assert.ok(DOOR_MATERIAL_PROFILES.wood && DOOR_MATERIAL_PROFILES.metal && DOOR_MATERIAL_PROFILES.heavy_iron);

  const texture = new THREE.Texture();
  const textures = new Proxy(
    { createSignTexture: () => texture },
    { get: (t, k) => (k in t ? Reflect.get(t, k) : texture) },
  ) as unknown as BuildingTextures;

  const events: Array<{ material: DoorMaterial; action: DoorAction }> = [];
  const woodDef = BUILDING_DOORS.find((d) => d.material === 'wood')!;
  const doors = createDoorSystem([woodDef], textures, false, (material, action) => {
    events.push({ material, action });
  });
  const interactions = new InteractionSystem();
  const playerPos = new THREE.Vector3(woodDef.x, 1.68, woodDef.z + 1.6);
  let canUnlock = false;
  doors.registerInteractions(interactions, playerPos, () => {}, {
    canUnlock: () => canUnlock,
    onUnlockSuccess: () => {},
    onLockedAttempt: () => {},
  });

  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 240);
  cam.position.copy(playerPos);
  cam.lookAt(woodDef.x, 1.3, woodDef.z);
  cam.updateMatrixWorld();
  doors.group.updateMatrixWorld(true);

  // Open wooden door -> 'open'
  interactions.evaluate(cam);
  interactions.triggerActive();
  for (let i = 0; i < 30; i++) doors.update(0.05);
  // Aim directly at the open leaf from safe distance -> 'close' followed by 'close_slam' on jamb contact
  playerPos.set(woodDef.x + 0.3, 1.68, woodDef.z + 1.8);
  const leafWorld = new THREE.Vector3();
  doors.doors[0].leaf.getWorldPosition(leafWorld);
  cam.position.copy(playerPos);
  cam.lookAt(leafWorld);
  cam.updateMatrixWorld();
  interactions.evaluate(cam);
  interactions.triggerActive();
  for (let i = 0; i < 40; i++) doors.update(0.05);

  const woodActions = events.filter((e) => e.material === 'wood').map((e) => e.action);
  assert.deepEqual(woodActions, ['open', 'close', 'close_slam']);

  // Heavy iron exit gate: locked attempt -> unlock -> open_start -> open_end
  playerPos.set(0, 1.68, -19.2);
  cam.position.copy(playerPos);
  cam.lookAt(0, 1.3, -21.72);
  cam.updateMatrixWorld();
  interactions.evaluate(cam);
  interactions.triggerActive();
  canUnlock = true;
  interactions.evaluate(cam);
  interactions.triggerActive();
  for (let i = 0; i < 82; i++) doors.update(0.05);

  const ironActions = events.filter((e) => e.material === 'heavy_iron').map((e) => e.action);
  assert.deepEqual(ironActions, ['locked', 'unlock', 'open_start', 'open_end']);

  doors.reset();
  doors.dispose();
  texture.dispose();
});

test('Phase 7.2: mastered screamer OGG and WAV audio assets exist and are non-empty', () => {
  const oggPath = path.resolve(process.cwd(), 'public/audio/monster-screamer.ogg');
  const wavPath = path.resolve(process.cwd(), 'public/audio/monster-screamer.wav');
  assert.ok(fs.existsSync(oggPath), 'monster-screamer.ogg exists');
  assert.ok(fs.existsSync(wavPath), 'monster-screamer.wav exists');
  assert.ok(fs.statSync(oggPath).size > 10000, 'monster-screamer.ogg is non-empty mastered audio');
  assert.ok(fs.statSync(wavPath).size > 100000, 'monster-screamer.wav is non-empty mastered audio');
});


