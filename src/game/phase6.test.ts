import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUILDING_DOORS, buildStaticColliders, getDoorClosedCollider } from './mapData';
import { SpatialAudioEngine } from './spatialAudio';
import {
  Watcher,
  WATCHER_BODY_RADIUS,
  WATCHER_DANGER_RADIUS,
  WATCHER_LETHAL_REACH,
  isInsideLethalReach,
  resolveWatcherBodyCollision,
} from './watcher';

const openColliders = [
  ...buildStaticColliders(),
  ...BUILDING_DOORS.map((d) => ({ ...getDoorClosedCollider(d), active: false })),
];

const closedDoorColliders = [
  ...buildStaticColliders(),
  ...BUILDING_DOORS.map((d) => getDoorClosedCollider(d)),
];

const cameraAt = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 80);
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
  camera.updateMatrixWorld(true);
  return camera;
};

test('Proof 1: approaching the monster while directly looking at it triggers ATTACK inside lethal reach', () => {
  let captures = 0;
  const watcher = new Watcher(openColliders, [], () => captures++, () => {});
  watcher.active = true;
  watcher.position.set(0, 0, 0);

  const cam = cameraAt(0, 1.68, 1.4, 0, 1.8, 0);
  watcher.update(0.05, cam, { x: 0, z: 1.4 }, 0, { x: 0, z: 1.8 });

  assert.equal(watcher.state, 'ATTACK');
  assert.equal(captures, 1);
  watcher.dispose();
});

test('Proof 2 & 7: passing quickly on the monster flank or tunneling in a fast sprint step still triggers ATTACK', () => {
  // Flank pass at ~1.1m laterally while facing forward
  let captures = 0;
  const watcher = new Watcher(openColliders, [], () => captures++, () => {});
  watcher.active = true;
  watcher.position.set(0, 0, 0);

  const cam = cameraAt(1.1, 1.68, 0, 1.1, 1.68, -10);
  watcher.update(0.05, cam, { x: 1.1, z: -0.2 }, 0, { x: 1.1, z: 0.4 });
  assert.equal(watcher.state, 'ATTACK');
  assert.equal(captures, 1);

  // Swept-segment anti-tunneling: large step jumps across the lethal zone in 1 tick
  assert.equal(
    isInsideLethalReach(
      { x: 0, y: 0, z: 0 },
      { x: 0.8, z: 3.0 },
      { x: 0.8, z: -3.0 },
      openColliders,
    ),
    true,
  );
  watcher.dispose();
});

test('Proof 3: monster catching up from behind triggers ATTACK from 360 degrees', () => {
  let captures = 0;
  const watcher = new Watcher(openColliders, [], () => captures++, () => {});
  watcher.active = true;
  watcher.position.set(0, 0, 2.2);

  // Player looking forward (-Z), monster approaches from behind (+Z)
  const cam = cameraAt(0, 1.68, 0, 0, 1.68, -10);
  for (let i = 0; i < 60 && captures === 0; i++) {
    watcher.update(0.05, cam, { x: 0, z: 0 }, 2, { x: 0, z: 0 });
  }
  assert.equal(captures, 1);
  assert.equal(watcher.state, 'ATTACK');
  assert.ok(watcher.position.distanceTo(new THREE.Vector3(0, 0, 0)) <= WATCHER_LETHAL_REACH + 0.05);
  watcher.dispose();
});

test('Proof 4: watching the monster at a safe distance (> lethal reach) freezes it without lunging', () => {
  let captures = 0;
  const watcher = new Watcher(openColliders, [], () => captures++, () => {});
  watcher.active = true;
  watcher.position.set(0, 0, 0);

  const safeDist = WATCHER_LETHAL_REACH + 1.8; // ~3.45 m
  const cam = cameraAt(0, 1.68, safeDist, 0, 1.8, 0);
  const startPos = watcher.position.clone();

  for (let i = 0; i < 40; i++) {
    watcher.update(0.05, cam, { x: 0, z: safeDist }, 3, { x: 0, z: safeDist });
  }

  assert.equal(captures, 0);
  assert.equal(watcher.state, 'FROZEN');
  assert.ok(watcher.position.equals(startPos));
  watcher.dispose();
});

test('Proof 5: walls and closed doors strictly block lethal reach attacks', () => {
  // Corridor wall sits between x=0 and x=-3 (west corridor wall around x=-1.6)
  assert.equal(
    isInsideLethalReach(
      { x: -1.1, y: 0, z: 0 },
      { x: -2.2, z: 0 },
      { x: -2.2, z: 0 },
      openColliders,
    ),
    false,
    'Solid wall must block attack across 1.1m distance',
  );

  // Closed door at Almacen (x=13, z=0, axis='z'): player on one side, monster on the other
  const almacenDoor = BUILDING_DOORS.find((d) => d.id === 'door-pasillo-almacen')!;
  assert.equal(
    isInsideLethalReach(
      { x: almacenDoor.x - 0.5, y: 0, z: almacenDoor.z },
      { x: almacenDoor.x + 0.5, z: almacenDoor.z },
      { x: almacenDoor.x + 0.5, z: almacenDoor.z },
      closedDoorColliders,
    ),
    false,
    'Closed door must block attack across 1.0m distance',
  );
});

test('Proof 6: physical body separation prevents ghosting through monster when open-air', () => {
  const pushed = resolveWatcherBodyCollision(
    { x: 0, z: 0.2 },
    { x: 0, y: 0, z: 0 },
    true,
    openColliders,
  );
  assert.ok(
    Math.hypot(pushed.x, pushed.z) >= WATCHER_BODY_RADIUS - 1e-4,
    'Player must be separated outside monster physical body radius',
  );

  // Behind a wall, separation must NOT push player across wall
  const acrossWall = resolveWatcherBodyCollision(
    { x: -2.0, z: 0 },
    { x: -1.2, y: 0, z: 0 },
    true,
    openColliders,
  );
  assert.deepEqual(acrossWall, { x: -2.0, z: 0 });
});

test('Proof 8 & 10: capture triggers once, consecutive resets restore clean patrol/audio state, and danger radius activates CHASE', () => {
  let captures = 0;
  const watcher = new Watcher(openColliders, [], () => captures++, () => {});
  const camAway = cameraAt(0, 1.68, 4.0, 0, 1.68, 12);

  // Within danger radius (4.0m <= WATCHER_DANGER_RADIUS=5.0m) with 0 keys -> immediate CHASE
  watcher.active = true;
  watcher.position.set(0, 0, 0);
  watcher.update(0.05, camAway, { x: 0, z: 4.0 }, 0);
  assert.equal(watcher.state, 'CHASE');

  // Two consecutive capture -> reset cycles
  for (let cycle = 1; cycle <= 2; cycle++) {
    watcher.active = true;
    watcher.position.set(0, 0, 3.0);
    watcher.update(0.05, camAway, { x: 0, z: 4.0 }, 0);
    watcher.update(0.05, camAway, { x: 0, z: 4.0 }, 0);
    assert.equal(captures, cycle, 'Each life must capture at most once');
    assert.equal(watcher.state, 'ATTACK');

    watcher.reset();
    assert.equal(watcher.active, false);
    assert.equal(watcher.state, 'PATROL');
    assert.equal(watcher.model.root.visible, false);
  }

  // Audio death sequence & ambience cleanup safely no-ops in headless Node
  const audio = new SpatialAudioEngine();
  assert.doesNotThrow(() => {
    audio.playDeathSequenceAudio(false);
    audio.startDeathAmbience();
    audio.stopDeathAmbience();
    audio.dispose();
  });
  watcher.dispose();
});

test('Proof 9: 3D articulated ATTACK animation lunges torso, extends arms, and snaps clawed fingers', () => {
  const watcher = new Watcher(openColliders, [], () => {}, () => {});
  for (let i = 0; i <= 24; i++) {
    watcher.animateAttack(0.05, i / 24, { x: 0, z: 1.5 });
  }
  assert.ok(watcher.model.rig.torso.rotation.x < -0.5, 'Torso lunges aggressively forward');
  assert.ok(watcher.model.rig.hips.position.z < -0.2, 'Hips lunge forward during attack');
  assert.ok(watcher.model.rig.upperArms[0].rotation.x > 1.2, 'Left arm reaches toward camera');
  assert.ok(watcher.model.rig.upperArms[1].rotation.x > 1.2, 'Right arm reaches toward camera');
  assert.ok(watcher.model.rig.fingers[0][0].rotation.x > 0.45, 'Claws snap closed during grab');
  watcher.dispose();
});
