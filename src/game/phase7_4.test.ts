import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCollectiblesSystem } from './collectibles';
import { createDoorSystem } from './doors';
import { InteractionSystem } from './interactions';
import { InventoryManager } from './inventory';
import {
  BUILDING_DOORS,
  BUILDING_EXAMINABLES,
  BUILDING_KEYS,
  BUILDING_NOTES,
} from './mapData';
import { FirstPersonController, shouldTriggerLeftClickInteract } from './player';
import type { BuildingTextures } from './textures';

function makeDummyTextures(): { textures: BuildingTextures; dispose: () => void } {
  const dummyTex = new THREE.Texture();
  const textures = new Proxy(
    { createSignTexture: () => dummyTex },
    { get: (t, k) => (k in t ? Reflect.get(t, k) : dummyTex) },
  ) as unknown as BuildingTextures;
  return { textures, dispose: () => dummyTex.dispose() };
}

test('Phase 7.4: shouldTriggerLeftClickInteract enforces pointerLock, primary button, active, unlocked controls, and canvas target', () => {
  assert.equal(
    shouldTriggerLeftClickInteract({
      active: true,
      controlsLocked: false,
      pointerLocked: false,
      button: 0,
      isCanvasTarget: true,
    }),
    false,
    'Initial click without Pointer Lock must NOT trigger world interaction',
  );

  assert.equal(
    shouldTriggerLeftClickInteract({
      active: true,
      controlsLocked: false,
      pointerLocked: true,
      button: 0,
      isCanvasTarget: true,
    }),
    true,
    'Left click with Pointer Lock active triggers interaction',
  );

  assert.equal(
    shouldTriggerLeftClickInteract({
      active: true,
      controlsLocked: false,
      pointerLocked: true,
      button: 2,
      isCanvasTarget: true,
    }),
    false,
    'Right click must NOT trigger interaction',
  );

  assert.equal(
    shouldTriggerLeftClickInteract({
      active: true,
      controlsLocked: true,
      pointerLocked: true,
      button: 0,
      isCanvasTarget: true,
    }),
    false,
    'Cinematics / locked controls must block left-click interaction',
  );

  assert.equal(
    shouldTriggerLeftClickInteract({
      active: false,
      controlsLocked: false,
      pointerLocked: true,
      button: 0,
      isCanvasTarget: true,
    }),
    false,
    'Inactive controller (paused/reading/title/gameover) must block interaction',
  );

  assert.equal(
    shouldTriggerLeftClickInteract({
      active: true,
      controlsLocked: false,
      pointerLocked: true,
      button: 0,
      isCanvasTarget: false,
    }),
    false,
    'Clicks on HUD or modals (non-canvas target) must NOT trigger world interaction',
  );
});

test('Phase 7.4: FirstPersonController handles Pointer Lock acquisition vs left-click interact and retires KeyE', () => {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const addTo = (map: Map<string, Set<(e: unknown) => void>>, type: string, fn: (e: unknown) => void) => {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type)!.add(fn);
  };
  const removeFrom = (map: Map<string, Set<(e: unknown) => void>>, type: string, fn: (e: unknown) => void) => {
    map.get(type)?.delete(fn);
  };
  const emitTo = (map: Map<string, Set<(e: unknown) => void>>, type: string, event: unknown) => {
    for (const fn of map.get(type) ?? []) fn(event);
  };

  const docListeners = new Map<string, Set<(e: unknown) => void>>();
  const canvasListeners = new Map<string, Set<(e: unknown) => void>>();

  let lockRequests = 0;
  const fakeCanvas = {
    addEventListener: (t: string, fn: (e: unknown) => void) => addTo(canvasListeners, t, fn),
    removeEventListener: (t: string, fn: (e: unknown) => void) => removeFrom(canvasListeners, t, fn),
    requestPointerLock: () => {
      lockRequests += 1;
    },
  };

  const fakeDoc = {
    hidden: false,
    pointerLockElement: null as unknown,
    addEventListener: (t: string, fn: (e: unknown) => void) => addTo(docListeners, t, fn),
    removeEventListener: (t: string, fn: (e: unknown) => void) => removeFrom(docListeners, t, fn),
    exitPointerLock: () => {
      fakeDoc.pointerLockElement = null;
      emitTo(docListeners, 'pointerlockchange', {});
    },
  };

  const fakeWindow = {
    addEventListener: (t: string, fn: (e: unknown) => void) => addTo(listeners, t, fn),
    removeEventListener: (t: string, fn: (e: unknown) => void) => removeFrom(listeners, t, fn),
  };

  const prevWin = (globalThis as Record<string, unknown>).window;
  const prevDoc = (globalThis as Record<string, unknown>).document;
  (globalThis as Record<string, unknown>).window = fakeWindow;
  (globalThis as Record<string, unknown>).document = fakeDoc;

  try {
    const ctrl = new FirstPersonController(fakeCanvas as unknown as HTMLCanvasElement);
    ctrl.setActive(true);

    // 1. KeyE must no longer queue interaction
    emitTo(listeners, 'keydown', { code: 'KeyE', repeat: false, preventDefault: () => {} });
    assert.equal(ctrl.consumeInteractPressed(), false, 'KeyE must not trigger interactions');

    // 2. First canvas left click when Pointer Lock is off ONLY requests lock
    emitTo(canvasListeners, 'mousedown', { button: 0, target: fakeCanvas, clientX: 100, clientY: 100 });
    assert.equal(lockRequests, 1, 'Unlocked canvas click requests Pointer Lock');
    assert.equal(ctrl.consumeInteractPressed(), false, 'Unlocked click must not interact with world');

    // 3. Simulate browser granting Pointer Lock
    fakeDoc.pointerLockElement = fakeCanvas;
    emitTo(docListeners, 'pointerlockchange', {});
    assert.equal(ctrl.pointerLocked, true);

    // 4. Left click with Pointer Lock active triggers once
    emitTo(canvasListeners, 'mousedown', { button: 0, target: fakeCanvas, clientX: 100, clientY: 100 });
    assert.equal(ctrl.consumeInteractPressed(), true, 'Locked left click queues interaction');
    assert.equal(ctrl.consumeInteractPressed(), false, 'Queued interaction consumes cleanly once');

    // 5. Right click with Pointer Lock active does not trigger
    emitTo(canvasListeners, 'mousedown', { button: 2, target: fakeCanvas, clientX: 100, clientY: 100 });
    assert.equal(ctrl.consumeInteractPressed(), false, 'Right click does not interact');

    // 6. Controls locked (intro cinematic) ignores left click
    ctrl.setControlsLocked(true);
    emitTo(canvasListeners, 'mousedown', { button: 0, target: fakeCanvas, clientX: 100, clientY: 100 });
    assert.equal(ctrl.consumeInteractPressed(), false, 'Controls locked prevents interaction');

    ctrl.dispose();
  } finally {
    if (prevWin === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = prevWin;
    if (prevDoc === undefined) delete (globalThis as Record<string, unknown>).document;
    else (globalThis as Record<string, unknown>).document = prevDoc;
  }
});

test('Phase 7.4: Doors & exit gate show CLIC IZQUIERDO prompts, detect handle & leaf, block through walls, and avoid double triggers', () => {
  const { textures, dispose: disposeTex } = makeDummyTextures();
  const woodDoorDef = BUILDING_DOORS.find((d) => !d.locked && d.material === 'wood')!;
  const lockedDoorDef = {
    ...woodDoorDef,
    id: 'door-locked-test',
    label: 'Archivo Sellado',
    x: woodDoorDef.x + 12,
    locked: true,
    lockedMessage: 'Puerta cerrada con llave',
  };

  const doors = createDoorSystem([woodDoorDef, lockedDoorDef], textures, false);
  const interactions = new InteractionSystem();
  const inv = new InventoryManager();
  const playerPos = new THREE.Vector3(woodDoorDef.x, 1.68, woodDoorDef.z + 1.5);
  let feedbackMsgs: string[] = [];
  let unlockedExit = 0;

  doors.registerInteractions(
    interactions,
    playerPos,
    (msg) => feedbackMsgs.push(msg),
    {
      canUnlock: () => inv.canUnlockExit(),
      onLockedAttempt: () => feedbackMsgs.push('locked-exit'),
      onUnlockSuccess: () => {
        inv.unlockExit();
        unlockedExit += 1;
      },
    },
  );

  doors.group.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 100);

  // Aim at door handle specifically
  const handleMesh = doors.doors[0].pivot.children.find((c) => c !== doors.doors[0].leaf)!;
  const handleWorld = new THREE.Vector3();
  handleMesh.getWorldPosition(handleWorld);
  cam.position.set(handleWorld.x, 1.68, handleWorld.z + 1.4);
  cam.lookAt(handleWorld);
  cam.updateMatrixWorld(true);

  const closedPrompt = interactions.evaluate(cam);
  assert.equal(closedPrompt.visible, true);
  assert.equal(closedPrompt.keyLabel, 'CLIC IZQUIERDO');
  assert.ok(closedPrompt.text.startsWith('Abrir'), `Expected Abrir prompt, got "${closedPrompt.text}"`);
  assert.equal(closedPrompt.locked, false);

  // Single click opens
  assert.equal(interactions.triggerActive(), true);
  assert.equal(doors.doors[0].isOpen, true);
  for (let i = 0; i < 30; i++) doors.update(0.05);
  doors.group.updateMatrixWorld(true);

  // Aim at opened leaf from safe distance -> prompt becomes Cerrar
  const openLeafWorld = new THREE.Vector3();
  doors.doors[0].leaf.getWorldPosition(openLeafWorld);
  playerPos.set(openLeafWorld.x + 0.5, 1.68, openLeafWorld.z + 1.6);
  cam.position.copy(playerPos);
  cam.lookAt(openLeafWorld);
  cam.updateMatrixWorld(true);

  const openPrompt = interactions.evaluate(cam);
  assert.equal(openPrompt.visible, true);
  assert.equal(openPrompt.keyLabel, 'CLIC IZQUIERDO');
  assert.ok(openPrompt.text.startsWith('Cerrar'), `Expected Cerrar prompt, got "${openPrompt.text}"`);

  // Click closes door
  assert.equal(interactions.triggerActive(), true);
  assert.equal(doors.doors[0].isOpen, false);

  // Distance limit: > 2.65m clears prompt
  cam.position.set(woodDoorDef.x, 1.68, woodDoorDef.z + 3.4);
  cam.lookAt(woodDoorDef.x, 1.3, woodDoorDef.z);
  cam.updateMatrixWorld(true);
  assert.equal(interactions.evaluate(cam).visible, false, 'Out of range door hides prompt');

  // Wall occlusion blocks targeting
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.3), new THREE.MeshBasicMaterial());
  wall.position.set(woodDoorDef.x, 1.5, woodDoorDef.z + 0.8);
  wall.updateMatrixWorld(true);
  interactions.addOcclusionMeshes([wall]);
  cam.position.set(woodDoorDef.x, 1.68, woodDoorDef.z + 1.6);
  cam.lookAt(woodDoorDef.x, 1.3, woodDoorDef.z);
  cam.updateMatrixWorld(true);
  assert.equal(interactions.evaluate(cam).visible, false, 'Wall occluder blocks interaction');

  // Locked interior door prompt
  cam.position.set(lockedDoorDef.x, 1.68, lockedDoorDef.z + 1.4);
  cam.lookAt(lockedDoorDef.x, 1.3, lockedDoorDef.z);
  cam.updateMatrixWorld(true);
  const lockedPrompt = interactions.evaluate(cam);
  assert.equal(lockedPrompt.visible, true);
  assert.equal(lockedPrompt.keyLabel, 'CLIC IZQUIERDO');
  assert.equal(lockedPrompt.locked, true);

  // Exit gate < 3 keys vs === 3 keys
  cam.position.set(0, 1.68, -19.5);
  cam.lookAt(0, 1.3, -21.72);
  cam.updateMatrixWorld(true);
  const exitLockedPrompt = interactions.evaluate(cam);
  assert.equal(exitLockedPrompt.visible, true);
  assert.equal(exitLockedPrompt.keyLabel, 'CLIC IZQUIERDO');
  assert.equal(exitLockedPrompt.text, 'NECESITAS LAS 3 LLAVES');
  assert.equal(exitLockedPrompt.locked, true);
  interactions.triggerActive();
  assert.equal(unlockedExit, 0);

  for (const id of ['key-recepcion', 'key-oficina', 'key-almacen']) inv.collectKey(id);
  const exitReadyPrompt = interactions.evaluate(cam);
  assert.equal(exitReadyPrompt.visible, true);
  assert.equal(exitReadyPrompt.keyLabel, 'CLIC IZQUIERDO');
  assert.equal(exitReadyPrompt.text, 'DESBLOQUEAR SALIDA');
  assert.equal(exitReadyPrompt.locked, false);

  assert.equal(interactions.triggerActive(), true);
  assert.equal(unlockedExit, 1);
  // Rapid second click cannot double-trigger unlock
  assert.equal(interactions.evaluate(cam).visible, false);
  assert.equal(interactions.triggerActive(), false);
  assert.equal(unlockedExit, 1);

  wall.geometry.dispose();
  (wall.material as THREE.Material).dispose();
  doors.dispose();
  disposeTex();
});

test('Phase 7.4: Keys, Notes, and Examinables use CLIC IZQUIERDO prompts and execute cleanly without duplicates', () => {
  const { textures, dispose: disposeTex } = makeDummyTextures();
  const interactions = new InteractionSystem();
  const collected: string[] = [];
  const openedNotes: string[] = [];
  const examined: string[] = [];

  const collectibles = createCollectiblesSystem(
    BUILDING_KEYS,
    BUILDING_NOTES,
    BUILDING_EXAMINABLES,
    textures,
    interactions,
    {
      onCollectKey: (k) => collected.push(k.id),
      onOpenNote: (n) => openedNotes.push(n.id),
      onExamine: (ex) => examined.push(ex.id),
    },
  );
  collectibles.group.updateMatrixWorld(true);

  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 100);

  // 1. Key pickup prompt & single-collect
  const key0 = BUILDING_KEYS[0];
  cam.position.set(key0.x, 1.68, key0.z + 1.0);
  cam.lookAt(key0.x, key0.y + 0.12, key0.z);
  cam.updateMatrixWorld(true);

  const keyPrompt = interactions.evaluate(cam);
  assert.equal(keyPrompt.visible, true);
  assert.equal(keyPrompt.keyLabel, 'CLIC IZQUIERDO');
  assert.ok(keyPrompt.text.startsWith('Recoger llave'));

  assert.equal(interactions.triggerActive(), true);
  assert.deepEqual(collected, [key0.id]);
  assert.equal(interactions.evaluate(cam).visible, false);
  assert.equal(interactions.triggerActive(), false);
  assert.deepEqual(collected, [key0.id]);

  // 2. Note prompt & callback
  const note0 = BUILDING_NOTES[0];
  cam.position.set(note0.x, 1.68, note0.z + 1.0);
  cam.lookAt(note0.x, note0.y + 0.08, note0.z);
  cam.updateMatrixWorld(true);

  const notePrompt = interactions.evaluate(cam);
  assert.equal(notePrompt.visible, true);
  assert.equal(notePrompt.keyLabel, 'CLIC IZQUIERDO');
  assert.ok(notePrompt.text.startsWith('Leer nota'));
  assert.equal(interactions.triggerActive(), true);
  assert.deepEqual(openedNotes, [note0.id]);

  // 3. Examinable prompt & callback
  const ex0 = BUILDING_EXAMINABLES[0];
  cam.position.set(ex0.x, 1.68, ex0.z + 1.0);
  cam.lookAt(ex0.x, ex0.y + 0.12, ex0.z);
  cam.updateMatrixWorld(true);

  const exPrompt = interactions.evaluate(cam);
  assert.equal(exPrompt.visible, true);
  assert.equal(exPrompt.keyLabel, 'CLIC IZQUIERDO');
  assert.ok(exPrompt.text.startsWith('Examinar'));
  assert.equal(interactions.triggerActive(), true);
  assert.deepEqual(examined, [ex0.id]);

  collectibles.dispose();
  disposeTex();
});
