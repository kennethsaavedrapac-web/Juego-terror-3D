import * as THREE from 'three';
import { playExamineSound, playKeyPickupSound, playNoteSound } from './audio';
import type { InteractionSystem } from './interactions';
import type { BuildingTextures } from './textures';
import type { ActiveNoteData, ExaminableDef, KeyItemDef, NoteDef } from './types';

export interface CollectibleCallbacks {
  onCollectKey: (key: KeyItemDef) => void;
  onOpenNote: (note: ActiveNoteData) => void;
  onExamine: (item: ExaminableDef) => void;
}

export interface CollectiblesSystem {
  group: THREE.Group;
  update: (elapsed: number) => void;
  reset: () => void;
  dispose: () => void;
}

interface KeyRuntime {
  def: KeyItemDef;
  meshGroup: THREE.Group;
  hitBox: THREE.Mesh;
  collected: boolean;
  baseY: number;
}

export function createCollectiblesSystem(
  keys: readonly KeyItemDef[],
  notes: readonly NoteDef[],
  examinables: readonly ExaminableDef[],
  textures: BuildingTextures,
  interactions: InteractionSystem,
  callbacks: CollectibleCallbacks,
): CollectiblesSystem {
  const group = new THREE.Group();
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

  // Invisible raycast proxy material (zero visual overdraw, raycastable)
  const hitProxyMat = trackMat(
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    }),
  );

  // Brass material with subtle warm glint so keys remain readable in dark rooms
  const keyBrassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9ad4a,
      emissive: new THREE.Color(0x5a4212),
      emissiveIntensity: 0.55,
      roughness: 0.28,
      metalness: 0.88,
    }),
  );

  const noteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.notePaperMap,
      roughness: 0.9,
      metalness: 0.02,
    }),
  );

  const darkBakeliteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b1e23,
      roughness: 0.42,
      metalness: 0.25,
    }),
  );

  const clockBodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b4232,
      roughness: 0.45,
      metalness: 0.65,
    }),
  );

  const clockFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.clockFaceMap,
      roughness: 0.35,
      metalness: 0.05,
    }),
  );

  const frameWoodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b2a1d,
      roughness: 0.72,
      metalness: 0.08,
    }),
  );

  const photoMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.photoMap,
      roughness: 0.65,
      metalness: 0.02,
    }),
  );

  // Shared key sub-geometries (low-poly recognizable key)
  const keyRingGeo = trackGeo(new THREE.TorusGeometry(0.042, 0.011, 8, 16));
  const keyShaftGeo = trackGeo(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 8));
  const keyCollarGeo = trackGeo(new THREE.CylinderGeometry(0.015, 0.015, 0.016, 8));
  const keyToothGeo = trackGeo(new THREE.BoxGeometry(0.024, 0.01, 0.016));
  const keyHitGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.24, 0.38));

  const keyRuntimes: KeyRuntime[] = [];

  for (const k of keys) {
    const root = new THREE.Group();
    root.position.set(k.x, k.y, k.z);
    if (k.rotationY) root.rotation.y = k.rotationY;

    const meshGroup = new THREE.Group();
    meshGroup.position.y = 0.018;

    const ring = new THREE.Mesh(keyRingGeo, keyBrassMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, -0.06);
    meshGroup.add(ring);

    const shaft = new THREE.Mesh(keyShaftGeo, keyBrassMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 0, 0.04);
    meshGroup.add(shaft);

    const collar = new THREE.Mesh(keyCollarGeo, keyBrassMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0, -0.015);
    meshGroup.add(collar);

    const tooth1 = new THREE.Mesh(keyToothGeo, keyBrassMat);
    tooth1.position.set(0.015, 0, 0.085);
    meshGroup.add(tooth1);

    const tooth2 = new THREE.Mesh(keyToothGeo, keyBrassMat);
    tooth2.scale.set(0.75, 1, 0.8);
    tooth2.position.set(0.012, 0, 0.058);
    meshGroup.add(tooth2);

    root.add(meshGroup);

    const hitBox = new THREE.Mesh(keyHitGeo, hitProxyMat);
    hitBox.position.set(0, 0.12, 0);
    root.add(hitBox);

    group.add(root);

    const runtime: KeyRuntime = {
      def: k,
      meshGroup,
      hitBox,
      collected: false,
      baseY: 0.018,
    };
    keyRuntimes.push(runtime);

    interactions.registerInteractable({
      id: k.id,
      kind: 'key',
      object: hitBox,
      maxDistance: 2.6,
      enabled: () => !runtime.collected,
      getPrompt: () => ({
        visible: true,
        keyLabel: 'E',
        text: `Presiona E para recoger ${k.name}`,
      }),
      onInteract: () => {
        if (runtime.collected) return;
        runtime.collected = true;
        meshGroup.visible = false;
        hitBox.visible = false;
        playKeyPickupSound();
        callbacks.onCollectKey(k);
      },
    });
  }

  // Build 3 physical paper Notes
  const noteMeshGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.012, 0.31));
  const noteHitGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.18, 0.42));

  for (const n of notes) {
    const noteRoot = new THREE.Group();
    noteRoot.position.set(n.x, n.y, n.z);
    if (n.rotationY) noteRoot.rotation.y = n.rotationY;

    const sheet = new THREE.Mesh(noteMeshGeo, noteMat);
    sheet.position.y = 0.008;
    noteRoot.add(sheet);

    const hitBox = new THREE.Mesh(noteHitGeo, hitProxyMat);
    hitBox.position.y = 0.09;
    noteRoot.add(hitBox);

    group.add(noteRoot);

    interactions.registerInteractable({
      id: n.id,
      kind: 'note',
      object: hitBox,
      maxDistance: 2.6,
      enabled: () => true,
      getPrompt: () => ({
        visible: true,
        keyLabel: 'E',
        text: `Presiona E para leer ${n.title}`,
      }),
      onInteract: () => {
        playNoteSound();
        callbacks.onOpenNote({
          id: n.id,
          title: n.title,
          roomLabel: n.roomLabel,
          text: n.text,
        });
      },
    });
  }

  // Build 3 Examinable Secondary Objects
  const examHitGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.34, 0.42));

  for (const ex of examinables) {
    const exRoot = new THREE.Group();
    exRoot.position.set(ex.x, ex.y, ex.z);
    if (ex.rotationY) exRoot.rotation.y = ex.rotationY;

    if (ex.kind === 'phone') {
      const base = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.22, 0.09, 0.24)),
        darkBakeliteMat,
      );
      base.position.y = 0.045;
      exRoot.add(base);

      const dial = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12)),
        clockFaceMat,
      );
      dial.position.set(0, 0.095, 0.05);
      dial.rotation.x = 0.35;
      exRoot.add(dial);

      const handset = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.26, 0.045, 0.065)),
        darkBakeliteMat,
      );
      handset.position.set(0, 0.125, -0.05);
      handset.rotation.y = 0.08;
      exRoot.add(handset);
    } else if (ex.kind === 'clock') {
      const body = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.11, 0.12, 0.09, 14)),
        clockBodyMat,
      );
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.12;
      exRoot.add(body);

      const face = new THREE.Mesh(
        trackGeo(new THREE.CircleGeometry(0.095, 16)),
        clockFaceMat,
      );
      face.position.set(0, 0.12, 0.047);
      exRoot.add(face);

      const footL = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.03, 0.03, 0.06)),
        clockBodyMat,
      );
      footL.position.set(-0.06, 0.015, 0);
      exRoot.add(footL);

      const footR = footL.clone();
      footR.position.x = 0.06;
      exRoot.add(footR);
    } else if (ex.kind === 'photo') {
      const frame = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.28, 0.02, 0.22)),
        frameWoodMat,
      );
      frame.position.y = 0.01;
      exRoot.add(frame);

      const picture = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(0.23, 0.17)),
        photoMat,
      );
      picture.rotation.x = -Math.PI / 2;
      picture.position.y = 0.022;
      exRoot.add(picture);
    }

    const hitBox = new THREE.Mesh(examHitGeo, hitProxyMat);
    hitBox.position.y = 0.15;
    exRoot.add(hitBox);

    group.add(exRoot);

    interactions.registerInteractable({
      id: ex.id,
      kind: 'examinable',
      object: hitBox,
      maxDistance: 2.6,
      enabled: () => true,
      getPrompt: () => ({
        visible: true,
        keyLabel: 'E',
        text: `Presiona E para examinar ${ex.label}`,
      }),
      onInteract: () => {
        playExamineSound();
        callbacks.onExamine(ex);
      },
    });
  }

  return {
    group,
    update: (elapsed: number) => {
      // Subtle brass shimmer & gentle hover pulse on uncollected keys
      keyBrassMat.emissiveIntensity = 0.45 + Math.sin(elapsed * 3.2) * 0.22;
      for (let i = 0; i < keyRuntimes.length; i++) {
        const kr = keyRuntimes[i];
        if (!kr.collected) {
          kr.meshGroup.position.y = kr.baseY + Math.sin(elapsed * 2.4 + i) * 0.004;
        }
      }
    },
    reset: () => {
      for (let i = 0; i < keyRuntimes.length; i++) {
        const kr = keyRuntimes[i];
        kr.collected = false;
        kr.meshGroup.visible = true;
        kr.hitBox.visible = true;
      }
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
