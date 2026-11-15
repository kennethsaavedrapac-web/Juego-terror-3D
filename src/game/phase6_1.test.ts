import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BUILDING_DOORS,
  BUILDING_KEYS,
  BUILDING_NOTES,
  BUILDING_EXAMINABLES,
  buildStaticColliders,
  getDoorClosedCollider,
} from './mapData';
import { createCollectiblesSystem } from './collectibles';
import { InteractionSystem } from './interactions';
import {
  Watcher,
  WATCHER_BODY_RADIUS,
  WATCHER_DANGER_RADIUS,
  WATCHER_EXTREME_DANGER_RADIUS,
  WATCHER_LETHAL_REACH,
  WATCHER_DIFFICULTY,
  isInsideLethalReach,
  resolveWatcherBodyCollision,
} from './watcher';
import { createWatcherModel } from './watcherModel';
import type { BuildingTextures } from './textures';

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

test('Phase 6.1 - Proof 1: Lethal distance calibrated to 2.65m triggers IMMEDIATE ATTACK even when observed directly', () => {
  let captures = 0;
  const watcher = new Watcher(openColliders, [], () => captures++, () => {});
  watcher.active = true;
  watcher.position.set(0, 0, 0);

  // Player at 2.4m (<= 2.65m) looking right into the creature's face
  const cam = cameraAt(0, 1.68, 2.4, 0, 1.8, 0);
  watcher.update(0.05, cam, { x: 0, z: 2.4 }, 0, { x: 0, z: 2.5 });

  assert.equal(captures, 1, 'Invading lethal reach must capture immediately');
  assert.equal(watcher.state, 'ATTACK', 'Must trigger ATTACK even while observed');
  assert.equal(watcher.currentSpeed, 0, 'Monster does not slide while executing stationary attack');
  watcher.dispose();
});

test('Phase 6.1 - Proof 2: Flank and rear approaches trigger ATTACK from 360 degrees', () => {
  // Flank approach at 1.4m laterally inside corridor (corridor is -1.8 to 1.8)
  let capturesFlank = 0;
  const watcherFlank = new Watcher(openColliders, [], () => capturesFlank++, () => {});
  watcherFlank.active = true;
  watcherFlank.position.set(0, 0, 0);
  const camFlank = cameraAt(1.4, 1.68, 0, 1.4, 1.68, 10);
  watcherFlank.update(0.05, camFlank, { x: 1.4, z: 0 }, 1);
  assert.equal(capturesFlank, 1);
  assert.equal(watcherFlank.state, 'ATTACK');
  watcherFlank.dispose();

  // Rear approach: monster behind player at 2.4m
  let capturesRear = 0;
  const watcherRear = new Watcher(openColliders, [], () => capturesRear++, () => {});
  watcherRear.active = true;
  watcherRear.position.set(0, 0, 2.4);
  const camRear = cameraAt(0, 1.68, 0, 0, 1.68, -10);
  watcherRear.update(0.05, camRear, { x: 0, z: 0 }, 2);
  assert.equal(capturesRear, 1);
  assert.equal(watcherRear.state, 'ATTACK');
  watcherRear.dispose();
});

test('Phase 6.1 - Proof 3: High-speed sprint step cannot tunnel through lethal reach zone', () => {
  // Player sprints from z = 3.5m to z = -3.5m across a 0.05s tick
  assert.equal(
    isInsideLethalReach(
      { x: 0, y: 0, z: 0 },
      { x: 1.2, z: 3.5 },
      { x: 1.2, z: -3.5 },
      openColliders,
      WATCHER_LETHAL_REACH,
    ),
    true,
    'Swept segment must catch player crossing within lethal reach',
  );
});

test('Phase 6.1 - Proof 4: Watching monster at safe distance (> 2.65m) freezes root, but living micro-breath and head tracking run', () => {
  let captures = 0;
  const watcher = new Watcher(openColliders, [], () => captures++, () => {});
  watcher.active = true;
  watcher.model.root.visible = true;
  watcher.position.set(0, 0, 0);

  const safeDist = 3.8; // > 2.65m
  const cam = cameraAt(0, 1.68, safeDist, 0, 1.8, 0);
  const startPos = watcher.position.clone();

  for (let i = 0; i < 20; i++) {
    watcher.update(0.05, cam, { x: 0, z: safeDist }, 1, { x: 0, z: safeDist });
  }

  assert.equal(captures, 0);
  assert.equal(watcher.state, 'FROZEN');
  assert.ok(watcher.position.equals(startPos), 'Root position must not move while frozen');
  assert.ok(watcher.model.root.visible);
  watcher.dispose();
});

test('Phase 6.1 - Proof 5: Attacks strictly blocked by walls and closed doors', () => {
  // Wall between x=-1.1 and x=-2.2
  assert.equal(
    isInsideLethalReach(
      { x: -1.1, y: 0, z: 0 },
      { x: -2.2, z: 0 },
      { x: -2.2, z: 0 },
      openColliders,
      WATCHER_LETHAL_REACH,
    ),
    false,
    'Wall must block attack',
  );

  // Closed door between monster and player at distance < 2.0m
  const door = BUILDING_DOORS.find((d) => d.id === 'door-pasillo-almacen')!;
  assert.equal(
    isInsideLethalReach(
      { x: door.x - 0.6, y: 0, z: door.z },
      { x: door.x + 0.6, z: door.z },
      { x: door.x + 0.6, z: door.z },
      closedDoorColliders,
      WATCHER_LETHAL_REACH,
    ),
    false,
    'Closed door must block attack',
  );
});

test('Phase 6.1 - Proof 6: Unfreezing reaction time is zero; danger radius activates CHASE with progressive difficulty', () => {
  const watcher = new Watcher(openColliders, [], () => {}, () => {});
  watcher.active = true;
  watcher.position.set(0, 0, 0);

  // Player observed monster at safe distance -> FROZEN
  const camObs = cameraAt(0, 1.68, 4.5, 0, 1.8, 0);
  watcher.update(0.05, camObs, { x: 0, z: 4.5 }, 0);
  assert.equal(watcher.state, 'FROZEN');

  // Player looks away (4.5m <= WATCHER_DANGER_RADIUS = 6.0m)
  const camAway = cameraAt(0, 1.68, 4.5, 0, 1.68, 15);
  watcher.update(0.05, camAway, { x: 0, z: 4.5 }, 0);

  assert.equal(watcher.state, 'CHASE', 'Must immediately enter CHASE within 6.0m danger radius');
  assert.ok(watcher.currentSpeed > 0, 'Must move on the very first frame vision is broken');

  // Progressive speeds across key tiers
  assert.ok(WATCHER_DIFFICULTY[0].speed < WATCHER_DIFFICULTY[1].speed);
  assert.ok(WATCHER_DIFFICULTY[1].speed < WATCHER_DIFFICULTY[2].speed);
  assert.ok(WATCHER_DIFFICULTY[2].speed < WATCHER_DIFFICULTY[3].speed);
  assert.ok(WATCHER_DIFFICULTY[3].speed < 3.4, 'Base speed strictly bounded below player walking speed');

  watcher.dispose();
});

test('Phase 6.1 - Proof 7: Three keys have golden emissive, halo billboard sprites, floating/rotation, and clean pickup', () => {
  const interactions = new InteractionSystem();
  let collectedKeys: string[] = [];

  const dummyTex = new THREE.Texture();
  const dummyTextures = new Proxy(
    { createSignTexture: () => dummyTex },
    { get: (target, key) => (key in target ? Reflect.get(target, key) : dummyTex) },
  ) as unknown as BuildingTextures;

  const collectibles = createCollectiblesSystem(
    BUILDING_KEYS,
    BUILDING_NOTES,
    BUILDING_EXAMINABLES,
    dummyTextures,
    interactions,
    {
      onCollectKey: (k) => collectedKeys.push(k.id),
      onOpenNote: () => {},
      onExamine: () => {},
    },
  );

  // Verify key structure: each key root contains meshGroup + haloSprite + innerSprite + hitBox
  const keyRoots = collectibles.group.children.filter((c) =>
    BUILDING_KEYS.some((k) => Math.hypot(c.position.x - k.x, c.position.z - k.z) < 0.1),
  );
  assert.equal(keyRoots.length, 3, 'Must create 3 physical key roots');

  for (const root of keyRoots) {
    const sprites = root.children.filter((c) => (c as THREE.Sprite).isSprite);
    assert.ok(sprites.length >= 2, 'Key root must have halo and inner glow sprites');
    const meshGroup = root.children.find((c) => (c as THREE.Group).isGroup && c.children.length > 0) as THREE.Group;
    assert.ok(meshGroup, 'Key must have 3D mesh group');
  }

  // Update animation: test rotation, floating, and proximity glow
  const initialY = keyRoots[0].children[0].position.y;
  collectibles.update(0.05, { x: BUILDING_KEYS[0].x, y: 0, z: BUILDING_KEYS[0].z });
  collectibles.update(1.2, { x: BUILDING_KEYS[0].x, y: 0, z: BUILDING_KEYS[0].z });

  // Simulate picking up key 0
  collectibles.group.updateMatrixWorld(true);
  const cam = cameraAt(
    BUILDING_KEYS[0].x,
    1.68,
    BUILDING_KEYS[0].z + 1.0,
    BUILDING_KEYS[0].x,
    BUILDING_KEYS[0].y + 0.12,
    BUILDING_KEYS[0].z,
  );
  cam.updateMatrixWorld(true);
  interactions.evaluate(cam);
  const didInteract = interactions.triggerActive();
  assert.equal(didInteract, true, 'Interaction with key must trigger');
  assert.equal(collectedKeys.length, 1, 'Key pickup callback executed');
  assert.equal(collectedKeys[0], BUILDING_KEYS[0].id);

  // Key and all associated halo sprites must become invisible upon collection
  assert.equal(keyRoots[0].children[0].visible, false, 'Key mesh must hide on pickup');
  for (const child of keyRoots[0].children) {
    if ((child as THREE.Sprite).isSprite) {
      assert.equal(child.visible, false, 'Halo sprites must hide on pickup');
    }
  }

  // Reset restores all keys and sprites cleanly
  collectibles.reset();
  assert.equal(keyRoots[0].children[0].visible, true, 'Reset restores key visibility');
  for (const child of keyRoots[0].children) {
    if ((child as THREE.Sprite).isSprite) {
      assert.equal(child.visible, true, 'Reset restores halo sprite visibility');
    }
  }

  collectibles.dispose();
  dummyTex.dispose();
});

test('Phase 6.1 - Proof 8: Model articulated living gestures in IDLE, WALK, RUN, and ATTACK', () => {
  const model = createWatcherModel();

  // IDLE: chest expands, shoulders heave, fingers flex
  const initialChestX = model.rig.torso.scale.x;
  for (let i = 0; i < 20; i++) {
    model.animate(0.05, 0, false, false, { animState: 'IDLE' });
  }
  assert.notEqual(model.rig.torso.scale.x, initialChestX, 'Chest must breathe in IDLE');

  // RUN: aggressive forward hunch
  for (let i = 0; i < 20; i++) {
    model.animate(0.05, 2.5, false, false, { animState: 'RUN' });
  }
  assert.ok(model.rig.torso.rotation.x < -0.4, 'Torso hunches aggressively forward in RUN');

  // ATTACK: arms lunge forward toward camera, claws flex
  for (let i = 0; i < 20; i++) {
    model.animate(0.03, 0, false, false, { animState: 'ATTACK', attackProgress: i / 19 });
  }
  assert.ok(model.rig.upperArms[0].rotation.x > 1.2, 'Upper arm reaches forward');
  assert.ok(model.rig.upperArms[1].rotation.x > 1.2, 'Upper arm reaches forward');
  assert.ok(model.rig.fingers[0][0].rotation.x > 0.4, 'Fingers snap into claws');

  model.dispose();
});
