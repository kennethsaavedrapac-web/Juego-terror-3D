import * as THREE from 'three';
import { playDoorSound, playExitUnlockSound } from './audio';
import type { InteractionSystem } from './interactions';
import { DOOR_HEIGHT, WALL_HEIGHT, WALL_THICKNESS, getDoorClosedCollider } from './mapData';
import { canDoorCloseSafely } from './physics';
import type { BuildingTextures } from './textures';
import type { AABBCollider, DoorDef } from './types';

export interface DoorRuntime {
  def: DoorDef;
  pivot: THREE.Group;
  leaf: THREE.Mesh;
  collider: AABBCollider;
  leafCollider: AABBCollider;
  isOpen: boolean;
  currentAngle: number;
  targetAngle: number;
}

export interface ExitDoorHooks {
  canUnlock: () => boolean;
  onUnlockSuccess: () => void;
  onLockedAttempt: () => void;
}

export interface DoorSystem {
  group: THREE.Group;
  doors: DoorRuntime[];
  colliders: AABBCollider[];
  registerInteractions: (
    interactions: InteractionSystem,
    playerPosition: THREE.Vector3,
    onFeedback: (msg: string, tone?: 'neutral' | 'alert') => void,
    exitHooks: ExitDoorHooks,
  ) => void;
  update: (dt: number, occupants?: readonly THREE.Vector3[]) => void;
  reset: () => void;
  dispose: () => void;
}

const DOOR_INTERACT_DISTANCE = 2.65;

export function createDoorSystem(
  doorDefs: readonly DoorDef[],
  textures: BuildingTextures,
  enableShadows: boolean,
): DoorSystem {
  const group = new THREE.Group();
  const doors: DoorRuntime[] = [];
  const colliders: AABBCollider[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22262b,
      roughness: 0.55,
      metalness: 0.45,
    }),
  );

  const plasterLintelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.wallMap,
      roughness: 0.88,
      metalness: 0.04,
    }),
  );

  const woodDoorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.woodDoorMap,
      roughness: 0.68,
      metalness: 0.06,
    }),
  );

  const metalDoorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.metalDoorMap,
      roughness: 0.42,
      metalness: 0.72,
    }),
  );

  const rustedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.metalMap,
      roughness: 0.42,
      metalness: 0.72,
    }),
  );

  const darkTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x202428,
      roughness: 0.35,
      metalness: 0.78,
    }),
  );

  const handleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9b8252,
      roughness: 0.3,
      metalness: 0.88,
    }),
  );

  // 1. Interior Hinged Doors
  const jambH = DOOR_HEIGHT;
  const jambGeo = trackGeo(new THREE.BoxGeometry(0.11, jambH, WALL_THICKNESS + 0.04));
  const lintelHeight = WALL_HEIGHT - DOOR_HEIGHT;
  const handleGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.04, 0.16));

  for (const def of doorDefs) {
    const doorwayGroup = new THREE.Group();
    doorwayGroup.position.set(def.x, 0, def.z);
    if (def.axis === 'z') {
      doorwayGroup.rotation.y = Math.PI / 2;
    }

    const halfW = def.width * 0.5;
    const leafW = def.width - 0.14;
    const leafThick = 0.08;

    const jambL = new THREE.Mesh(jambGeo, frameMat);
    jambL.position.set(-halfW + 0.055, jambH * 0.5, 0);
    doorwayGroup.add(jambL);

    const jambR = new THREE.Mesh(jambGeo, frameMat);
    jambR.position.set(halfW - 0.055, jambH * 0.5, 0);
    doorwayGroup.add(jambR);

    const wallHeaderGeo = trackGeo(
      new THREE.BoxGeometry(def.width, lintelHeight, WALL_THICKNESS),
    );
    const wallHeader = new THREE.Mesh(wallHeaderGeo, plasterLintelMat);
    wallHeader.position.set(0, DOOR_HEIGHT + lintelHeight * 0.5, 0);
    doorwayGroup.add(wallHeader);

    const frameTopGeo = trackGeo(
      new THREE.BoxGeometry(def.width, 0.1, WALL_THICKNESS + 0.05),
    );
    const frameTop = new THREE.Mesh(frameTopGeo, frameMat);
    frameTop.position.set(0, DOOR_HEIGHT - 0.05, 0);
    doorwayGroup.add(frameTop);

    const plaqueTex = textures.createSignTexture(def.label.toUpperCase());
    const plaqueMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: plaqueTex,
        roughness: 0.55,
        metalness: 0.2,
      }),
    );
    const plaqueGeo = trackGeo(new THREE.PlaneGeometry(0.68, 0.24));
    const plaqueFront = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaqueFront.position.set(0, DOOR_HEIGHT + 0.22, WALL_THICKNESS * 0.5 + 0.015);
    doorwayGroup.add(plaqueFront);

    const plaqueBack = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaqueBack.position.set(0, DOOR_HEIGHT + 0.22, -(WALL_THICKNESS * 0.5 + 0.015));
    plaqueBack.rotation.y = Math.PI;
    doorwayGroup.add(plaqueBack);

    const pivot = new THREE.Group();
    const hingeLocalX = def.hingeSide * (leafW * 0.5);
    pivot.position.set(hingeLocalX, 0, 0);

    const leafGeo = trackGeo(new THREE.BoxGeometry(leafW, DOOR_HEIGHT - 0.08, leafThick));
    const leaf = new THREE.Mesh(
      leafGeo,
      def.material === 'metal' ? metalDoorMat : woodDoorMat,
    );
    leaf.position.set(-def.hingeSide * (leafW * 0.5), (DOOR_HEIGHT - 0.08) * 0.5, 0);
    leaf.castShadow = enableShadows;
    leaf.receiveShadow = enableShadows;
    pivot.add(leaf);

    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(-def.hingeSide * (leafW - 0.16), 1.05, 0);
    pivot.add(handle);

    doorwayGroup.add(pivot);
    group.add(doorwayGroup);

    const collider = getDoorClosedCollider(def);
    const leafCollider: AABBCollider = { ...collider, id: `${def.id}-leaf` };
    colliders.push(collider, leafCollider);

    doors.push({
      def,
      pivot,
      leaf,
      collider,
      leafCollider,
      isOpen: false,
      currentAngle: 0,
      targetAngle: 0,
    });
  }

  // 2. Heavy North Exit Double Door (x = 0, z = -21.72) with animated leaves & locks
  const exitDoor = new THREE.Group();
  exitDoor.position.set(0, 0, -21.72);

  const exitFrameTop = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.8, 0.18, 0.24)),
    darkTrimMat,
  );
  exitFrameTop.position.set(0, 2.55, 0);
  exitDoor.add(exitFrameTop);

  const exitFrameSideGeo = trackGeo(new THREE.BoxGeometry(0.18, 2.55, 0.24));
  const exitFrameL = new THREE.Mesh(exitFrameSideGeo, darkTrimMat);
  exitFrameL.position.set(-1.31, 1.275, 0);
  exitDoor.add(exitFrameL);

  const exitFrameR = new THREE.Mesh(exitFrameSideGeo, darkTrimMat);
  exitFrameR.position.set(1.31, 1.275, 0);
  exitDoor.add(exitFrameR);

  const exitLeafGeo = trackGeo(new THREE.BoxGeometry(1.18, 2.45, 0.12));

  const exitPivotL = new THREE.Group();
  exitPivotL.position.set(-1.2, 0, 0.02);
  const exitLeafL = new THREE.Mesh(exitLeafGeo, rustedSteelMat);
  exitLeafL.position.set(0.59, 1.225, 0);
  exitPivotL.add(exitLeafL);
  exitDoor.add(exitPivotL);

  const exitPivotR = new THREE.Group();
  exitPivotR.position.set(1.2, 0, 0.02);
  const exitLeafR = new THREE.Mesh(exitLeafGeo, rustedSteelMat);
  exitLeafR.position.set(-0.59, 1.225, 0);
  exitPivotR.add(exitLeafR);
  exitDoor.add(exitPivotR);

  const crossbar = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.75, 0.09, 0.08)),
    darkTrimMat,
  );
  crossbar.position.set(0, 1.15, 0.12);
  exitDoor.add(crossbar);

  const lockMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9b7638,
      roughness: 0.35,
      metalness: 0.85,
    }),
  );
  const lockGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.18, 0.09));
  const padlocks: THREE.Mesh[] = [];
  for (let i = -1; i <= 1; i++) {
    const lock = new THREE.Mesh(lockGeo, lockMat);
    lock.position.set(i * 0.42, 1.1, 0.16);
    exitDoor.add(lock);
    padlocks.push(lock);
  }

  const signBox = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(1.05, 0.36, 0.12)),
    darkTrimMat,
  );
  signBox.position.set(0, 2.95, 0.06);
  exitDoor.add(signBox);

  const signFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.exitSignMap,
      emissive: new THREE.Color(0xef4444),
      emissiveMap: textures.exitSignMap,
      emissiveIntensity: 2.6,
      roughness: 0.3,
    }),
  );
  const signFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.96, 0.3)), signFaceMat);
  signFace.position.set(0, 2.95, 0.125);
  exitDoor.add(signFace);

  // Interactive hit area covering the exit double door frame
  const exitHitProxy = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(2.45, 2.5, 0.36)),
    trackMat(
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    ),
  );
  exitHitProxy.position.set(0, 1.25, 0.04);
  exitDoor.add(exitHitProxy);

  group.add(exitDoor);

  const exitCollider: AABBCollider = {
    id: 'exit-door',
    minX: -1.45,
    maxX: 1.45,
    minZ: -21.95,
    maxZ: -21.5,
    kind: 'door',
    active: true,
  };
  colliders.push(exitCollider);

  let exitUnlocked = false;
  let exitCurrentAngle = 0;
  let exitTargetAngle = 0;

  const registerInteractions = (
    interactions: InteractionSystem,
    playerPosition: THREE.Vector3,
    onFeedback: (msg: string, tone?: 'neutral' | 'alert') => void,
    exitHooks: ExitDoorHooks,
  ) => {
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i];
      interactions.registerInteractable({
        id: d.def.id,
        kind: 'door',
        object: d.leaf,
        maxDistance: DOOR_INTERACT_DISTANCE,
        enabled: () => true,
        getPrompt: () => {
          if (d.def.locked) {
            return {
              visible: true,
              keyLabel: 'E',
              text: d.def.lockedMessage || 'Puerta cerrada con llave',
              locked: true,
            };
          }
          return {
            visible: true,
            keyLabel: 'E',
            text: d.isOpen
              ? `Presiona E para cerrar (${d.def.label})`
              : `Presiona E para abrir (${d.def.label})`,
            locked: false,
          };
        },
        onInteract: () => {
          if (d.def.locked) {
            playDoorSound(d.def.material, 'locked');
            onFeedback(d.def.lockedMessage || 'Puerta bloqueada', 'alert');
            return;
          }
          if (d.isOpen) {
            if (!canDoorCloseSafely(playerPosition.x, playerPosition.z, d.collider)) {
              playDoorSound(d.def.material, 'locked');
              onFeedback('Aléjate del marco para cerrar la puerta', 'alert');
              return;
            }
            d.isOpen = false;
            d.targetAngle = 0;
            playDoorSound(d.def.material, 'close');
          } else {
            d.isOpen = true;
            d.targetAngle = d.def.openAngle;
            playDoorSound(d.def.material, 'open');
          }
        },
      });
    }

    interactions.registerInteractable({
      id: 'exit-door',
      kind: 'exit',
      object: exitHitProxy,
      maxDistance: 2.95,
      enabled: () => !exitUnlocked,
      getPrompt: () => {
        if (exitHooks.canUnlock()) {
          return {
            visible: true,
            keyLabel: 'E',
            text: 'Presiona E para desbloquear la salida',
            locked: false,
          };
        }
        return {
          visible: true,
          keyLabel: 'E',
          text: 'Puerta cerrada · Necesitas encontrar las tres llaves',
          locked: true,
        };
      },
      onInteract: () => {
        if (exitUnlocked) return;
        if (!exitHooks.canUnlock()) {
          playDoorSound('metal', 'locked');
          exitHooks.onLockedAttempt();
          return;
        }
        exitUnlocked = true;
        exitTargetAngle = Math.PI * 0.44;
        crossbar.visible = false;
        for (const lock of padlocks) {
          lock.visible = false;
        }
        playExitUnlockSound();
        exitHooks.onUnlockSuccess();
      },
    });
  };

  const bounds = new THREE.Box3();
  const update = (dt: number, occupants: readonly THREE.Vector3[] = []) => {
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i];
      const previousAngle = d.currentAngle;
      const diff = d.targetAngle - d.currentAngle;
      if (Math.abs(diff) > 0.002) {
        d.currentAngle = THREE.MathUtils.damp(d.currentAngle, d.targetAngle, 9.5, dt);
        d.pivot.rotation.y = d.currentAngle;
      } else if (d.currentAngle !== d.targetAngle) {
        d.currentAngle = d.targetAngle;
        d.pivot.rotation.y = d.currentAngle;
      }
      d.leaf.updateWorldMatrix(true, false);
      bounds.setFromObject(d.leaf);
      const proposed = { ...d.leafCollider, minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z, active: true };
      const closingGate = Math.abs(d.currentAngle) < 1.25 && Math.abs(previousAngle) >= 1.25;
      if (occupants.some(p => !canDoorCloseSafely(p.x,p.z,proposed,.46) || (closingGate && !canDoorCloseSafely(p.x,p.z,d.collider,.46)))) {
        d.currentAngle = previousAngle; d.pivot.rotation.y = previousAngle;
        d.leaf.updateWorldMatrix(true, false); bounds.setFromObject(d.leaf);
      }
      Object.assign(d.leafCollider,{ minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z, active: true });
      d.collider.active = Math.abs(d.currentAngle) < 1.25;
    }

    const exitDiff = exitTargetAngle - exitCurrentAngle;
    if (Math.abs(exitDiff) > 0.002) {
      exitCurrentAngle = THREE.MathUtils.damp(exitCurrentAngle, exitTargetAngle, 6.5, dt);
      exitPivotL.rotation.y = exitCurrentAngle;
      exitPivotR.rotation.y = -exitCurrentAngle;
    } else if (exitCurrentAngle !== exitTargetAngle) {
      exitCurrentAngle = exitTargetAngle;
      exitPivotL.rotation.y = exitCurrentAngle;
      exitPivotR.rotation.y = -exitCurrentAngle;
    }
    exitCollider.active = Math.abs(exitCurrentAngle) < 0.38;
  };

  const reset = () => {
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i];
      d.isOpen = false;
      d.currentAngle = 0;
      d.targetAngle = 0;
      d.pivot.rotation.y = 0;
      d.collider.active = true;
      Object.assign(d.leafCollider, getDoorClosedCollider(d.def), { id: `${d.def.id}-leaf` });
    }
    exitUnlocked = false;
    exitCurrentAngle = 0;
    exitTargetAngle = 0;
    exitPivotL.rotation.y = 0;
    exitPivotR.rotation.y = 0;
    exitCollider.active = true;
    crossbar.visible = true;
    for (const lock of padlocks) {
      lock.visible = true;
    }
  };

  return {
    group,
    doors,
    colliders,
    registerInteractions,
    update,
    reset,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
