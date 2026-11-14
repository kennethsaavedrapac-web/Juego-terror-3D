import * as THREE from 'three';
import {
  createCollectiblesSystem,
  type CollectibleCallbacks,
  type CollectiblesSystem,
} from './collectibles';
import { createDoorSystem, type DoorSystem } from './doors';
import type { InteractionSystem } from './interactions';
import {
  BUILDING_DOORS,
  BUILDING_EXAMINABLES,
  BUILDING_KEYS,
  BUILDING_NOTES,
  BUILDING_PILLARS,
  BUILDING_PROPS,
  BUILDING_WALLS,
  SPAWN_POINT,
  WALL_HEIGHT,
  buildStaticColliders,
} from './mapData';
import { buildBuildingProps } from './props';
import type { BuildingTextures } from './textures';
import type { AABBCollider } from './types';

export interface FlickerFixture {
  light: THREE.PointLight;
  bulbMat: THREE.MeshStandardMaterial;
  baseIntensity: number;
  phase: number;
  flickerSpeed: number;
}

export interface BuiltLevel {
  group: THREE.Group;
  colliders: AABBCollider[];
  doorSystem: DoorSystem;
  collectibles: CollectiblesSystem;
  occlusionMeshes: THREE.Object3D[];
  flickerFixtures: FlickerFixture[];
  spawnPosition: THREE.Vector3;
  spawnYaw: number;
  dispose: () => void;
}

export function buildAbandonedBuilding(
  textures: BuildingTextures,
  enableShadows: boolean,
  interactions: InteractionSystem,
  collectibleCallbacks: CollectibleCallbacks,
): BuiltLevel {
  const group = new THREE.Group();
  const flickerFixtures: FlickerFixture[] = [];
  const occlusionMeshes: THREE.Object3D[] = [];
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

  // Shared PBR materials
  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.floorMap,
      bumpMap: textures.floorBump,
      bumpScale: 0.025,
      roughness: 0.85,
      metalness: 0.04,
    }),
  );

  const tileFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.tileFloorMap,
      roughness: 0.62,
      metalness: 0.06,
    }),
  );

  const wallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.wallMap,
      bumpMap: textures.wallBump,
      bumpScale: 0.02,
      roughness: 0.88,
      metalness: 0.04,
    }),
  );

  const tileWallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.tileWallMap,
      roughness: 0.56,
      metalness: 0.06,
    }),
  );

  const ceilingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.ceilingMap,
      roughness: 0.94,
      metalness: 0.02,
    }),
  );

  const baseboardMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b1d20,
      roughness: 0.72,
      metalness: 0.15,
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

  // 1. Main Building Floor & Ceiling
  const floorGeo = trackGeo(new THREE.PlaneGeometry(30, 44));
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, -2.0);
  floorMesh.receiveShadow = enableShadows;
  group.add(floorMesh);

  // Restrooms tiled sub-floor offset +0.02 on Y to prevent Z-fighting
  const bathFloorGeo = trackGeo(new THREE.PlaneGeometry(11.2, 8.0));
  const bathFloor = new THREE.Mesh(bathFloorGeo, tileFloorMat);
  bathFloor.rotation.x = -Math.PI / 2;
  bathFloor.position.set(7.4, 0.02, -10.0);
  bathFloor.receiveShadow = enableShadows;
  group.add(bathFloor);

  const ceilMesh = new THREE.Mesh(floorGeo, ceilingMat);
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.position.set(0, WALL_HEIGHT, -2.0);
  group.add(ceilMesh);

  // Scale BoxGeometry UVs proportionally to world meters
  const scaleBoxUVs = (
    geo: THREE.BoxGeometry,
    w: number,
    h: number,
    d: number,
    tileSize = 3.6,
  ) => {
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const norm = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(norm.getX(i));
      const ny = Math.abs(norm.getY(i));
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (nx > 0.5) {
        uv.setXY(i, u * (d / tileSize), v * (h / tileSize));
      } else if (ny > 0.5) {
        uv.setXY(i, u * (w / tileSize), v * (d / tileSize));
      } else {
        uv.setXY(i, u * (w / tileSize), v * (h / tileSize));
      }
    }
    uv.needsUpdate = true;
    return geo;
  };

  // 2. Build all walls from mapData.ts
  for (const wDef of BUILDING_WALLS) {
    const minX = Math.min(wDef.x1, wDef.x2);
    const maxX = Math.max(wDef.x1, wDef.x2);
    const minZ = Math.min(wDef.z1, wDef.z2);
    const maxZ = Math.max(wDef.z1, wDef.z2);
    const w = maxX - minX;
    const d = maxZ - minZ;
    const h = wDef.height ?? WALL_HEIGHT;
    const yCenter = (wDef.yOffset ?? 0) + h * 0.5;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;

    const mat = wDef.material === 'tile' ? tileWallMat : wallMat;
    const wallGeo = trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(w, h, d), w, h, d, 3.6),
    );
    const mesh = new THREE.Mesh(wallGeo, mat);
    mesh.position.set(cx, yCenter, cz);
    mesh.castShadow = enableShadows;
    mesh.receiveShadow = enableShadows;
    group.add(mesh);
    if (wDef.collides !== false) {
      occlusionMeshes.push(mesh);
    }

    if (!wDef.yOffset) {
      const baseGeo = trackGeo(new THREE.BoxGeometry(w + 0.03, 0.14, d + 0.03));
      const base = new THREE.Mesh(baseGeo, baseboardMat);
      base.position.set(cx, 0.07, cz);
      group.add(base);
    }
  }

  // Corridor overhead concrete beams & conduit pipe for atmospheric rhythm
  const beamGeo = trackGeo(new THREE.BoxGeometry(3.6, 0.22, 0.28));
  for (const bz of [4.0, -2.0, -8.0, -14.0]) {
    const beam = new THREE.Mesh(beamGeo, baseboardMat);
    beam.position.set(0, WALL_HEIGHT - 0.11, bz);
    group.add(beam);
  }
  const pipeGeo = trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 25, 8));
  const pipe = new THREE.Mesh(pipeGeo, darkTrimMat);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(-1.42, WALL_HEIGHT - 0.26, -3.5);
  group.add(pipe);

  // 3. Structural Pillars
  const plinthGeo = trackGeo(new THREE.BoxGeometry(0.76, 0.24, 0.76));
  const capGeo = trackGeo(new THREE.BoxGeometry(0.78, 0.2, 0.78));
  const guardGeo = trackGeo(new THREE.BoxGeometry(0.64, 0.08, 0.64));
  const shaftH = WALL_HEIGHT - 0.44;
  const shaftGeo = trackGeo(
    scaleBoxUVs(new THREE.BoxGeometry(0.6, shaftH, 0.6), 0.6, shaftH, 0.6, 3.6),
  );

  for (const p of BUILDING_PILLARS) {
    const pGroup = new THREE.Group();
    pGroup.position.set(p.x, 0, p.z);

    const plinth = new THREE.Mesh(plinthGeo, baseboardMat);
    plinth.position.y = 0.12;
    pGroup.add(plinth);

    const shaft = new THREE.Mesh(shaftGeo, wallMat);
    shaft.position.y = 0.24 + shaftH * 0.5;
    shaft.castShadow = enableShadows;
    shaft.receiveShadow = enableShadows;
    pGroup.add(shaft);

    const capital = new THREE.Mesh(capGeo, baseboardMat);
    capital.position.y = WALL_HEIGHT - 0.1;
    pGroup.add(capital);

    const guard = new THREE.Mesh(guardGeo, rustedSteelMat);
    guard.position.y = 1.05;
    pGroup.add(guard);

    group.add(pGroup);
    occlusionMeshes.push(shaft);
  }

  // 4. Interactive Doors System (interior doors + animated north exit double door)
  const doorSystem = createDoorSystem(BUILDING_DOORS, textures, enableShadows);
  group.add(doorSystem.group);

  // 5. Room Furniture & Abandoned Props
  const builtProps = buildBuildingProps(BUILDING_PROPS, textures, enableShadows);
  group.add(builtProps.group);
  builtProps.group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      occlusionMeshes.push(child);
    }
  });

  // 6. Keys, Notes, and Examinables
  const collectibles = createCollectiblesSystem(
    BUILDING_KEYS,
    BUILDING_NOTES,
    BUILDING_EXAMINABLES,
    textures,
    interactions,
    collectibleCallbacks,
  );
  group.add(collectibles.group);

  // Reception Directory Plaque
  {
    const dirTex = textures.createSignTexture('ALA SUR', 'OFICINA · ARCHIVOS · ALMACÉN');
    const dirMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: dirTex,
        roughness: 0.55,
      }),
    );
    const dirSign = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(1.4, 0.5)), dirMat);
    dirSign.position.set(3.2, 2.05, 9.22);
    group.add(dirSign);
  }

  // 7. Ceiling Fixtures & 6 Strategic PointLights (optimized light budget)
  const housingGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.08, 1.25));
  const tubeGeo = trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 1.12, 8));

  const addCeilingFixture = (
    x: number,
    z: number,
    colorHex: number,
    intensity: number,
    distance: number,
    flickerSpeed: number,
    phase: number,
  ) => {
    const fixture = new THREE.Group();
    fixture.position.set(x, WALL_HEIGHT, z);

    const housing = new THREE.Mesh(housingGeo, darkTrimMat);
    housing.position.y = -0.04;
    fixture.add(housing);

    const bulbMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: new THREE.Color(colorHex),
        emissiveIntensity: intensity > 0 ? 1.45 : 0.08,
        roughness: 0.25,
      }),
    );
    const tube = new THREE.Mesh(tubeGeo, bulbMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.y = -0.09;
    fixture.add(tube);

    group.add(fixture);

    if (intensity > 0) {
      const light = new THREE.PointLight(colorHex, intensity, distance, 1.55);
      light.position.set(x, WALL_HEIGHT - 0.25, z);
      group.add(light);
      flickerFixtures.push({
        light,
        bulbMat,
        baseIntensity: intensity,
        phase,
        flickerSpeed,
      });
    }
  };

  // 1. Recepción warm tungsten light
  addCeilingFixture(-0.6, 13.6, 0xffc68a, 3.3, 14, 2.1, 0.4);
  // 2. Pasillo principal flickering fluorescent
  addCeilingFixture(0, 1.5, 0xb2cbd4, 2.9, 14, 11.2, 1.7);
  // 3. Oficina / Archivos west wing warm-amber bulb
  addCeilingFixture(-7.4, 2.8, 0xd8a876, 2.8, 14, 3.6, 2.9);
  // 4. Almacén / Mantenimiento east wing industrial cold lamp
  addCeilingFixture(7.8, 1.6, 0x9cbdb8, 2.8, 14, 6.2, 1.1);
  // 5. Baños / North hallway sickly teal fluorescent
  addCeilingFixture(5.4, -10.2, 0x8cc2b0, 2.8, 14, 9.8, 4.3);
  // 6. North Exit crimson emergency beacon
  const exitLight = new THREE.PointLight(0xdc2626, 4.4, 14, 1.5);
  exitLight.position.set(0, 2.85, -20.6);
  group.add(exitLight);
  flickerFixtures.push({
    light: exitLight,
    bulbMat: trackMat(new THREE.MeshStandardMaterial({ color: 0xdc2626 })),
    baseIntensity: 4.4,
    phase: 0.2,
    flickerSpeed: 3.8,
  });

  // Unlit dead ceiling tubes in darker alcoves (zero GPU light cost)
  addCeilingFixture(-7.6, -6.5, 0x4b5563, 0, 0, 0, 0);
  addCeilingFixture(8.4, -3.5, 0x4b5563, 0, 0, 0, 0);
  addCeilingFixture(0, -10.5, 0x4b5563, 0, 0, 0, 0);

  // Merge static colliders (excluding static exit placeholder) + dynamic door/exit colliders
  const colliders = [
    ...buildStaticColliders().filter((c) => c.id !== 'exit-door'),
    ...doorSystem.colliders,
  ];

  return {
    group,
    colliders,
    doorSystem,
    collectibles,
    occlusionMeshes,
    flickerFixtures,
    spawnPosition: new THREE.Vector3(SPAWN_POINT.x, 0, SPAWN_POINT.z),
    spawnYaw: SPAWN_POINT.yaw,
    dispose: () => {
      doorSystem.dispose();
      collectibles.dispose();
      builtProps.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
