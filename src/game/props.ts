import { floorHeightAt } from './expansion';
import * as THREE from 'three';
import type { BuildingTextures } from './textures';
import type { PropPlacementDef } from './types';

export interface BuiltProps {
  group: THREE.Group;
  dispose: () => void;
}

export function buildBuildingProps(
  placements: readonly PropPlacementDef[],
  textures: BuildingTextures,
  enableShadows: boolean,
): BuiltProps {
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

  // Shared materials (reused across all room props for low draw overhead)
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.woodMap,
      roughness: 0.72,
      metalness: 0.05,
    }),
  );

  const metalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.metalMap,
      roughness: 0.44,
      metalness: 0.74,
    }),
  );

  const darkTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e2226,
      roughness: 0.4,
      metalness: 0.75,
    }),
  );

  const crateMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.crateMap,
      roughness: 0.85,
      metalness: 0.04,
    }),
  );

  const paperMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc5bdb0,
      roughness: 0.92,
      metalness: 0.0,
    }),
  );

  const ceramicMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa4aca8,
      roughness: 0.28,
      metalness: 0.1,
    }),
  );

  const drumMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b484d,
      roughness: 0.52,
      metalness: 0.6,
    }),
  );

  const partitionMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3d4745,
      roughness: 0.65,
      metalness: 0.18,
    }),
  );

  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    }),
  );

  // Shared sub-geometries
  const boxUnit = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const cylUnit = trackGeo(new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(1, 1));

  const makeBox = (
    sx: number,
    sy: number,
    sz: number,
    px: number,
    py: number,
    pz: number,
    mat: THREE.Material,
    cast = false,
  ) => {
    const m = new THREE.Mesh(boxUnit, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(px, py, pz);
    m.castShadow = enableShadows && cast;
    m.receiveShadow = enableShadows;
    return m;
  };

  const addContactShadow = (parent: THREE.Group, sx: number, sz: number) => {
    const disc = new THREE.Mesh(shadowGeo, shadowMat);
    disc.rotation.x = -Math.PI / 2;
    disc.scale.set(sx, sz, 1);
    disc.position.y = 0.015;
    parent.add(disc);
  };

  for (const p of placements) {
    const prop = new THREE.Group();
    prop.position.set(p.x, floorHeightAt(p.x, p.z), p.z);
    if (p.rotationY) prop.rotation.y = p.rotationY;

    switch (p.kind) {
      case 'reception_desk': {
        prop.add(makeBox(1.5, 0.88, 2.3, 0, 0.44, 0, woodMat, true));
        prop.add(makeBox(1.66, 0.08, 2.44, 0, 0.92, 0, darkTrimMat));
        prop.add(makeBox(0.18, 0.06, 2.3, 0.66, 0.99, 0, woodMat));
        const crt = makeBox(0.42, 0.36, 0.44, -0.22, 1.14, -0.58, metalMat);
        crt.rotation.y = 0.3;
        prop.add(crt);
        addContactShadow(prop, 2.2, 2.9);
        break;
      }

      case 'waiting_bench': {
        prop.add(makeBox(2.0, 0.08, 0.56, 0, 0.45, 0, woodMat, true));
        prop.add(makeBox(2.0, 0.42, 0.08, 0, 0.72, -0.24, woodMat));
        prop.add(makeBox(0.1, 0.45, 0.5, -0.82, 0.225, 0, darkTrimMat));
        prop.add(makeBox(0.1, 0.45, 0.5, 0.82, 0.225, 0, darkTrimMat));
        addContactShadow(prop, 2.4, 1.0);
        break;
      }

      case 'meeting_table': {
        prop.add(makeBox(3.8, 0.09, 1.3, 0, 0.76, 0, woodMat, true));
        for (const x of [-1.5, 1.5]) prop.add(makeBox(0.12, 0.72, 1.1, x, 0.36, 0, darkTrimMat));
        prop.add(makeBox(0.35, 0.025, 0.28, -0.4, 0.82, 0, paperMat));
        addContactShadow(prop, 4.2, 1.7);
        break;
      }

      case 'office_desk': {
        prop.add(makeBox(1.9, 0.07, 0.96, 0, 0.76, 0, woodMat, true));
        prop.add(makeBox(0.55, 0.74, 0.88, -0.64, 0.37, 0, darkTrimMat));
        prop.add(makeBox(0.08, 0.74, 0.88, 0.86, 0.37, 0, darkTrimMat));
        // Old typewriter / terminal box
        prop.add(makeBox(0.42, 0.16, 0.36, 0.12, 0.87, -0.1, metalMat));
        addContactShadow(prop, 2.3, 1.3);
        break;
      }

      case 'office_chair': {
        prop.add(makeBox(0.52, 0.08, 0.52, 0, 0.46, 0, darkTrimMat));
        prop.add(makeBox(0.5, 0.52, 0.08, 0, 0.74, 0.22, darkTrimMat));
        prop.add(makeBox(0.1, 0.42, 0.1, 0, 0.21, 0, metalMat));
        prop.add(makeBox(0.56, 0.05, 0.56, 0, 0.03, 0, metalMat));
        addContactShadow(prop, 0.9, 0.9);
        break;
      }

      case 'filing_cabinet': {
        prop.add(makeBox(0.68, 1.56, 0.78, 0, 0.78, 0, metalMat, true));
        for (let i = 0; i < 4; i++) {
          const drawer = makeBox(0.62, 0.32, 0.05, 0, 0.24 + i * 0.36, 0.4, darkTrimMat);
          if (i === 2) drawer.position.z = 0.54; // slightly pulled-out drawer
          prop.add(drawer);
        }
        addContactShadow(prop, 1.1, 1.2);
        break;
      }

      case 'archive_shelf': {
        // 4 uprights + 4 shelves + archive boxes
        const posts: [number, number][] = [
          [-0.36, -1.25],
          [0.36, -1.25],
          [-0.36, 1.25],
          [0.36, 1.25],
        ];
        for (const [lx, lz] of posts) {
          prop.add(makeBox(0.06, 2.25, 0.06, lx, 1.125, lz, darkTrimMat));
        }
        for (let s = 0; s < 4; s++) {
          const sy = 0.15 + s * 0.65;
          prop.add(makeBox(0.76, 0.04, 2.56, 0, sy, 0, metalMat));
          if (s < 3) {
            prop.add(makeBox(0.56, 0.36, 0.64, 0, sy + 0.2, -0.65, paperMat));
            prop.add(makeBox(0.56, 0.36, 0.64, 0, sy + 0.2, 0.55, crateMat));
          }
        }
        addContactShadow(prop, 1.2, 2.9);
        break;
      }

      case 'storage_rack': {
        const posts: [number, number][] = [
          [-0.38, -1.25],
          [0.38, -1.25],
          [-0.38, 1.25],
          [0.38, 1.25],
        ];
        for (const [lx, lz] of posts) {
          prop.add(makeBox(0.07, 2.3, 0.07, lx, 1.15, lz, darkTrimMat));
        }
        for (let s = 0; s < 3; s++) {
          const sy = 0.22 + s * 0.82;
          prop.add(makeBox(0.82, 0.05, 2.58, 0, sy, 0, metalMat));
        }
        prop.add(makeBox(0.65, 0.58, 0.65, 0, 0.54, -0.55, crateMat, true));
        prop.add(makeBox(0.65, 0.58, 0.65, 0, 1.36, 0.45, crateMat, true));
        addContactShadow(prop, 1.3, 2.9);
        break;
      }

      case 'crate_stack': {
        prop.add(makeBox(0.78, 0.72, 0.78, -0.18, 0.36, -0.14, crateMat, true));
        const c2 = makeBox(0.6, 0.56, 0.6, 0.28, 0.28, 0.22, crateMat, true);
        c2.rotation.y = 0.25;
        prop.add(c2);
        const top = makeBox(0.52, 0.48, 0.52, -0.12, 0.96, -0.1, crateMat, true);
        top.rotation.y = -0.35;
        prop.add(top);
        addContactShadow(prop, 1.6, 1.6);
        break;
      }

      case 'drum': {
        const body = new THREE.Mesh(cylUnit, drumMat);
        body.scale.set(0.62, 0.96, 0.62);
        body.position.y = 0.48;
        body.castShadow = enableShadows;
        prop.add(body);
        const rimTop = new THREE.Mesh(cylUnit, darkTrimMat);
        rimTop.scale.set(0.66, 0.05, 0.66);
        rimTop.position.y = 0.95;
        prop.add(rimTop);
        const rimMid = new THREE.Mesh(cylUnit, darkTrimMat);
        rimMid.scale.set(0.65, 0.04, 0.65);
        rimMid.position.y = 0.48;
        prop.add(rimMid);
        addContactShadow(prop, 0.95, 0.95);
        break;
      }

      case 'workbench': {
        prop.add(makeBox(1.95, 0.08, 0.92, 0, 0.84, 0, woodMat, true));
        prop.add(makeBox(1.85, 0.05, 0.82, 0, 0.24, 0, metalMat));
        const legs: [number, number][] = [
          [-0.86, -0.38],
          [0.86, -0.38],
          [-0.86, 0.38],
          [0.86, 0.38],
        ];
        for (const [lx, lz] of legs) {
          prop.add(makeBox(0.08, 0.84, 0.08, lx, 0.42, lz, darkTrimMat));
        }
        // Toolbox & pipe valve
        prop.add(makeBox(0.46, 0.22, 0.24, -0.45, 0.99, -0.1, drumMat));
        prop.add(makeBox(0.32, 0.14, 0.22, 0.45, 0.95, 0.08, metalMat));
        addContactShadow(prop, 2.3, 1.3);
        break;
      }

      case 'breaker_panel': {
        prop.add(makeBox(1.2, 1.45, 0.26, 0, 1.45, 0, metalMat, true));
        prop.add(makeBox(1.06, 1.3, 0.04, 0, 1.45, 0.14, darkTrimMat));
        // Warning indicator strip
        const hazardMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: 0xa16207,
            roughness: 0.5,
            metalness: 0.2,
          }),
        );
        prop.add(makeBox(0.86, 0.09, 0.02, 0, 2.02, 0.165, hazardMat));
        // Conduit pipes running up to ceiling
        prop.add(makeBox(0.06, 1.4, 0.06, -0.32, 2.88, 0, darkTrimMat));
        prop.add(makeBox(0.06, 1.4, 0.06, 0.32, 2.88, 0, darkTrimMat));
        break;
      }

      case 'restroom_sink': {
        prop.add(makeBox(2.1, 0.14, 0.65, 0, 0.82, 0, ceramicMat, true));
        prop.add(makeBox(0.55, 0.18, 0.42, -0.55, 0.89, 0.04, ceramicMat));
        prop.add(makeBox(0.55, 0.18, 0.42, 0.55, 0.89, 0.04, ceramicMat));
        // Mirror frame above sinks
        prop.add(makeBox(1.9, 1.05, 0.05, 0, 1.65, -0.28, darkTrimMat));
        const mirrorMat = trackMat(
          new THREE.MeshStandardMaterial({
            color: 0x3b4446,
            roughness: 0.16,
            metalness: 0.85,
          }),
        );
        prop.add(makeBox(1.78, 0.94, 0.02, 0, 1.65, -0.25, mirrorMat));
        break;
      }

      case 'restroom_stall': {
        // Side dividers + ajar stall door + toilet bowl silhouette
        prop.add(makeBox(1.5, 2.0, 0.06, 0, 1.1, -0.66, partitionMat));
        prop.add(makeBox(1.5, 2.0, 0.06, 0, 1.1, 0.66, partitionMat));
        const stallDoor = makeBox(0.06, 1.85, 1.1, -0.74, 1.08, -0.1, partitionMat);
        stallDoor.rotation.y = 0.32;
        prop.add(stallDoor);
        prop.add(makeBox(0.42, 0.42, 0.46, 0.42, 0.21, 0, ceramicMat));
        prop.add(makeBox(0.24, 0.48, 0.44, 0.58, 0.62, 0, ceramicMat));
        break;
      }
    }

    group.add(prop);
  }

  return {
    group,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
