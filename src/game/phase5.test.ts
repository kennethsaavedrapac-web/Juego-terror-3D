import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { canTriggerRandomJumpscare } from './jumpscares';
import { BUILDING_DOORS, buildStaticColliders, getDoorClosedCollider } from './mapData';
import { computeWallAttenuation, SpatialAudioEngine } from './spatialAudio';
import { pickSafeDoorToSlam } from './supernatural';
import { TensionSystem } from './tension';
import { Watcher } from './watcher';
import { createWatcherModel } from './watcherModel';
import type { DoorRuntime } from './doors';

const openColliders = [
  ...buildStaticColliders(),
  ...BUILDING_DOORS.map((d) => ({ ...getDoorClosedCollider(d), active: false })),
];

const cameraAt = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 80);
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
  camera.updateMatrixWorld(true);
  return camera;
};

test('watcher model exposes full articulated joint hierarchy and distinct IDLE, WALK, RUN, FROZEN, ATTACK poses', () => {
  const model = createWatcherModel();
  assert.ok(model.rig.hips);
  assert.ok(model.rig.torso);
  assert.ok(model.rig.neck);
  assert.ok(model.rig.head);
  assert.equal(model.rig.shoulders.length, 2);
  assert.equal(model.rig.upperArms.length, 2);
  assert.equal(model.rig.elbows.length, 2);
  assert.equal(model.rig.hands.length, 2);
  assert.equal(model.rig.fingers[0].length, 4);
  assert.equal(model.rig.fingers[1].length, 4);
  assert.equal(model.rig.hipsLegs.length, 2);
  assert.equal(model.rig.knees.length, 2);
  assert.equal(model.rig.feet.length, 2);

  // IDLE: chest breathes, fingers/head move subtly, zero footsteps triggered
  let steps = 0;
  for (let i = 0; i < 30; i++) {
    model.animate(0.05, 0, false, false, {
      animState: 'IDLE',
      onFootstep: () => steps++,
    });
  }
  assert.equal(steps, 0, 'IDLE must not emit footsteps');
  assert.notEqual(model.rig.head.rotation.z, 0);

  // WALK: knees flex, hips/arms swing, footsteps sync to stride
  for (let i = 0; i < 40; i++) {
    model.animate(0.05, 1.0, false, false, {
      animState: 'WALK',
      onFootstep: () => steps++,
    });
  }
  assert.ok(steps >= 2, `WALK should emit synchronized footsteps (got ${steps})`);
  const walkTorsoPitch = model.rig.torso.rotation.x;

  // RUN: deeper forward torso lean & faster stride cadence
  let runSteps = 0;
  for (let i = 0; i < 40; i++) {
    model.animate(0.05, 2.1, false, false, {
      animState: 'RUN',
      onFootstep: () => runSteps++,
    });
  }
  assert.ok(runSteps > steps, `RUN cadence (${runSteps}) must exceed WALK (${steps})`);
  assert.ok(model.rig.torso.rotation.x < walkTorsoPitch, 'RUN leans torso further forward');

  // FROZEN: stops footsteps and freezes limb rotations immediately
  const beforeFrozenKnee = model.rig.knees[0].rotation.x;
  let frozenSteps = 0;
  model.animate(0.1, 2.0, true, false, {
    animState: 'FROZEN',
    allowFrozenMicroBreath: true,
    onFootstep: () => frozenSteps++,
  });
  assert.equal(frozenSteps, 0);
  assert.equal(model.rig.knees[0].rotation.x, beforeFrozenKnee);

  // ATTACK: extends both arms forward toward camera
  for (let i = 0; i < 20; i++) {
    model.animate(0.03, 0, false, false, {
      animState: 'ATTACK',
      attackProgress: i / 19,
    });
  }
  assert.ok(model.rig.upperArms[0].rotation.x > 0.85, 'ATTACK reaches arms forward');
  assert.ok(model.rig.upperArms[1].rotation.x > 0.85);

  model.dispose();
});

test('animations stay consistent across 30 FPS and 120 FPS delta steps', () => {
  const m30 = createWatcherModel();
  const m120 = createWatcherModel();
  let steps30 = 0;
  let steps120 = 0;

  for (let i = 0; i < 30; i++) {
    m30.animate(1 / 30, 1.6, false, false, { animState: 'RUN', onFootstep: () => steps30++ });
  }
  for (let i = 0; i < 120; i++) {
    m120.animate(1 / 120, 1.6, false, false, { animState: 'RUN', onFootstep: () => steps120++ });
  }

  assert.equal(steps30, steps120, 'Footstep count over 1s should match across 30Hz and 120Hz');
  assert.ok(Math.abs(m30.rig.torso.rotation.x - m120.rig.torso.rotation.x) < 0.08);
  m30.dispose();
  m120.dispose();
});

test('watcher turns progressively and relocates only out of player view to valid walkable positions', () => {
  const watcher = new Watcher(openColliders, [], () => {}, () => {});
  watcher.active = true;
  watcher.position.set(0, 0, -6);
  watcher.model.root.rotation.y = 0;

  // Looking directly at the monster prevents unseen relocation
  const lookingAt = cameraAt(0, 1.68, 5, 0, 1.8, -6);
  assert.equal(watcher.relocateUnseen(lookingAt, { x: 0, z: 5 }), false);

  // Looking away allows controlled relocation to a valid distant unseen spot
  const lookingAway = cameraAt(0, 1.68, 15, 0, 1.68, 25);
  const moved = watcher.relocateUnseen(lookingAway, { x: 0, z: 15 });
  assert.equal(moved, true);
  assert.ok(watcher.vision.visible(lookingAway, watcher.position, true) === false);

  // Progressive turn damps instead of snapping 180 degrees in a single 16ms frame
  watcher.state = 'STALK';
  watcher.model.root.rotation.y = 0;
  watcher.update(0.016, lookingAway, { x: 0, z: 15 }, 0);
  assert.ok(Math.abs(watcher.model.root.rotation.y) < Math.PI * 0.9, 'Rotation should damp smoothly');
  watcher.dispose();
});

test('wall attenuation reduces cutoff and gain across walls and closed doors; spatial audio handles missing AudioContext', () => {
  const clear = computeWallAttenuation({ x: 0, z: 6 }, { x: 0, z: -2 }, openColliders);
  assert.equal(clear.wallCount, 0);
  assert.equal(clear.gainMultiplier, 1.0);

  // Across west corridor wall from x=0 to x=-6
  const behindWall = computeWallAttenuation({ x: 0, z: 0 }, { x: -6, z: 0 }, openColliders);
  assert.ok(behindWall.wallCount >= 1);
  assert.ok(behindWall.cutoffHz < 1000);
  assert.ok(behindWall.gainMultiplier < 0.7);

  // Graceful no-op in Node (no window.AudioContext)
  const audio = new SpatialAudioEngine();
  assert.doesNotThrow(() => {
    audio.playMonsterFootstep(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 5), openColliders, 0.8, false);
    audio.playMonsterGrowl(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 5), openColliders, true);
    audio.playMonsterAttack();
    audio.dispose();
  });
});

test('tension system transitions smoothly across levels 1..4 based on distance, keys, unseen time, and chase', () => {
  const tension = new TensionSystem();
  let snap = tension.update({
    dt: 0.5,
    watcherActive: false,
    watcherDistance: 30,
    watcherState: 'PATROL',
    timeSinceLastSeen: 0,
    keysCollected: 0,
    isSprinting: false,
  });
  assert.equal(snap.level, 1);

  for (let i = 0; i < 30; i++) {
    snap = tension.update({
      dt: 0.1,
      watcherActive: true,
      watcherDistance: 12,
      watcherState: 'STALK',
      timeSinceLastSeen: 14,
      keysCollected: 1,
      isSprinting: false,
    });
  }
  assert.ok(snap.level >= 2 && snap.level <= 3);

  for (let i = 0; i < 20; i++) {
    snap = tension.update({
      dt: 0.1,
      watcherActive: true,
      watcherDistance: 4,
      watcherState: 'CHASE',
      timeSinceLastSeen: 2,
      keysCollected: 3,
      isSprinting: true,
    });
  }
  assert.equal(snap.level, 4);
  assert.equal(snap.chaseActive, true);
});

test('supernatural door slam respects player and monster positions; jumpscares respect cooldowns and note reading', () => {
  const def = BUILDING_DOORS[0];
  const collider = getDoorClosedCollider(def);
  const doorRuntime: DoorRuntime = {
    def,
    pivot: new THREE.Group(),
    leaf: new THREE.Mesh(),
    collider,
    leafCollider: { ...collider },
    isOpen: true,
    currentAngle: def.openAngle,
    targetAngle: def.openAngle,
  };

  // Player standing inside doorway -> unsafe to slam
  assert.equal(pickSafeDoorToSlam([doorRuntime], { x: def.x, z: def.z }, null), null);
  // Monster standing inside doorway -> unsafe to slam
  assert.equal(
    pickSafeDoorToSlam([doorRuntime], { x: def.x + 4, z: def.z }, { x: def.x, z: def.z }),
    null,
  );
  // Both clear at safe distance -> eligible
  assert.equal(
    pickSafeDoorToSlam([doorRuntime], { x: def.x + 5, z: def.z }, { x: def.x - 5, z: def.z }),
    doorRuntime,
  );

  assert.equal(
    canTriggerRandomJumpscare({
      status: 'reading',
      runElapsed: 60,
      cooldownRemaining: 0,
      tensionLevel: 3,
      watcherState: 'STALK',
    }),
    false,
    'Never jumpscare while reading notes',
  );
  assert.equal(
    canTriggerRandomJumpscare({
      status: 'playing',
      runElapsed: 10,
      cooldownRemaining: 0,
      tensionLevel: 3,
      watcherState: 'STALK',
    }),
    false,
    'Respect initial grace period',
  );
  assert.equal(
    canTriggerRandomJumpscare({
      status: 'playing',
      runElapsed: 50,
      cooldownRemaining: 0,
      tensionLevel: 3,
      watcherState: 'STALK',
    }),
    true,
  );
});
