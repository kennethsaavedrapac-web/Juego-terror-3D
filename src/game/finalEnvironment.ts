import * as THREE from 'three';
import { FACTORY_Z, FINAL_ENTRY_Z, FINAL_LENGTH, type FinalChasePhase } from './finalSequence';
import type { AABBCollider } from './types';
import type { BuildingTextures } from './textures';

export function finalColliders(): AABBCollider[] {
  return [-1, 1].map((side) => ({
    id: `final-wall-${side}`,
    minX: side < 0 ? -3.5 : 3,
    maxX: side < 0 ? -3 : 3.5,
    minZ: FACTORY_Z - 2,
    maxZ: FINAL_ENTRY_Z,
    kind: 'wall',
  }));
}

function createEmergencySignTexture(kind: 'exit' | 'hazard' | 'chevron'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = kind === 'chevron' ? 256 : 512;
  canvas.height = kind === 'chevron' ? 256 : 192;
  const ctx = canvas.getContext('2d')!;

  if (kind === 'exit') {
    ctx.fillStyle = '#09110d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#38d37b';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = '#133524';
    ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40);

    ctx.fillStyle = '#a8ffd0';
    ctx.font = 'bold 76px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SALIDA', 44, 82);

    ctx.fillStyle = '#5ee89c';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('EVACUACIÓN · SECTOR NORTE', 46, 140);

    // Bold exit arrow on the right
    ctx.fillStyle = '#8efac0';
    ctx.beginPath();
    ctx.moveTo(395, 58);
    ctx.lineTo(465, 96);
    ctx.lineTo(395, 134);
    ctx.lineTo(395, 110);
    ctx.lineTo(345, 110);
    ctx.lineTo(345, 82);
    ctx.lineTo(395, 82);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'hazard') {
    ctx.fillStyle = '#181410';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Diagonal caution stripes top & bottom
    ctx.fillStyle = '#d99616';
    for (let x = -40; x < canvas.width + 40; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 24, 0);
      ctx.lineTo(x + 4, 28);
      ctx.lineTo(x - 20, 28);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x, canvas.height - 28);
      ctx.lineTo(x + 24, canvas.height - 28);
      ctx.lineTo(x + 4, canvas.height);
      ctx.lineTo(x - 20, canvas.height);
      ctx.closePath();
      ctx.fill();
    }

    // Warning triangle
    ctx.fillStyle = '#e09f1f';
    ctx.beginPath();
    ctx.moveTo(86, 50);
    ctx.lineTo(132, 134);
    ctx.lineTo(40, 134);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#14110e';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 86, 105);

    ctx.fillStyle = '#f2d388';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PELIGRO', 158, 82);
    ctx.fillStyle = '#d45a3a';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('PRESIÓN · EMERGENCIA', 160, 124);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 115, 75, 0.88)';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const offsetY of [88, 178]) {
      ctx.beginPath();
      ctx.moveTo(46, offsetY + 46);
      ctx.lineTo(128, offsetY - 26);
      ctx.lineTo(210, offsetY + 46);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255, 90, 60, 0.92)');
  grad.addColorStop(0.32, 'rgba(255, 34, 22, 0.42)');
  grad.addColorStop(0.72, 'rgba(255, 18, 12, 0.10)');
  grad.addColorStop(1, 'rgba(255, 12, 8, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  // Soft horizontal falloff so side seams disappear
  ctx.globalCompositeOperation = 'destination-in';
  const sideGrad = ctx.createLinearGradient(0, 0, 128, 0);
  sideGrad.addColorStop(0, 'rgba(0,0,0,0)');
  sideGrad.addColorStop(0.25, 'rgba(0,0,0,1)');
  sideGrad.addColorStop(0.75, 'rgba(0,0,0,1)');
  sideGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideGrad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Shared geometry and material batches keep the monumental emergency set inexpensive. */
export function buildFinalEnvironment(textures: BuildingTextures) {
  const group = new THREE.Group();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const beaconConeGeo = new THREE.ConeGeometry(0.95, 2.5, 10, 1, true);
  beaconConeGeo.translate(0, -1.25, 0);
  beaconConeGeo.rotateX(Math.PI / 2);

  const steel = new THREE.MeshStandardMaterial({
    color: 0x6c808b,
    metalness: 0.72,
    roughness: 0.36,
    map: textures.metalMap,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: 0x626b6b,
    metalness: 0.05,
    roughness: 0.94,
    map: textures.wallMap,
  });
  const rust = new THREE.MeshStandardMaterial({
    color: 0x6f4b36,
    metalness: 0.45,
    roughness: 0.72,
    map: textures.metalMap,
  });
  const darkCable = new THREE.MeshStandardMaterial({
    color: 0x161a1e,
    metalness: 0.15,
    roughness: 0.85,
  });
  const cold = new THREE.MeshBasicMaterial({ color: 0x8ec9da });
  const redStripMat = new THREE.MeshStandardMaterial({
    color: 0x3b0706,
    emissive: 0xff2214,
    emissiveIntensity: 0.35,
    roughness: 0.32,
    metalness: 0.2,
  });
  const beaconMatA = new THREE.MeshStandardMaterial({
    color: 0x4a0505,
    emissive: 0xff190f,
    emissiveIntensity: 0.5,
    roughness: 0.2,
    metalness: 0.15,
  });
  const beaconMatB = new THREE.MeshStandardMaterial({
    color: 0x4a0505,
    emissive: 0xff190f,
    emissiveIntensity: 0.5,
    roughness: 0.2,
    metalness: 0.15,
  });
  const beamTex = createBeamTexture();
  const beaconBeamMatA = new THREE.MeshBasicMaterial({
    color: 0xff2a1a,
    map: beamTex,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beaconBeamMatB = beaconBeamMatA.clone();

  const exitSignTex = createEmergencySignTexture('exit');
  const hazardSignTex = createEmergencySignTexture('hazard');
  const chevronTex = createEmergencySignTexture('chevron');

  const exitSignMat = new THREE.MeshStandardMaterial({
    map: exitSignTex,
    emissiveMap: exitSignTex,
    emissive: 0x7effb2,
    emissiveIntensity: 0.95,
    roughness: 0.35,
  });
  const hazardSignMat = new THREE.MeshStandardMaterial({
    map: hazardSignTex,
    roughness: 0.6,
    metalness: 0.15,
  });
  const chevronMat = new THREE.MeshBasicMaterial({
    map: chevronTex,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });

  const batches = new Map<THREE.Material, THREE.Matrix4[]>();
  const pipes: THREE.Matrix4[] = [];
  const cables: THREE.Matrix4[] = [];
  const beaconsA: THREE.Matrix4[] = [];
  const beaconsB: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  function box(
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    const batch = batches.get(mat) ?? [];
    batch.push(dummy.matrix.clone());
    batches.set(mat, batch);
  }

  function pipe(x: number, y: number, z: number, r: number, length: number, horizontal = true) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(horizontal ? Math.PI / 2 : 0, 0, 0);
    dummy.scale.set(r, length, r);
    dummy.updateMatrix();
    pipes.push(dummy.matrix.clone());
  }

  function cableRun(x: number, y: number, z: number, r: number, length: number, rz = 0) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(Math.PI / 2, 0, rz);
    dummy.scale.set(r, length, r);
    dummy.updateMatrix();
    cables.push(dummy.matrix.clone());
  }

  const mid = FINAL_ENTRY_Z - FINAL_LENGTH / 2;
  // Continuous unobstructed 6m wide x 4.5m tall concrete tunnel
  box(concrete, 0, -0.15, mid, 6.6, 0.3, FINAL_LENGTH + 1);
  box(concrete, 0, 4.5, mid, 6.6, 0.35, FINAL_LENGTH);
  for (const s of [-1, 1]) {
    box(concrete, s * 3.25, 2.2, mid, 0.5, 4.5, FINAL_LENGTH);
    // Double heavy side conduits & steel rails along the walls
    pipe(s * 2.74, 3.45, mid, 0.16, FINAL_LENGTH);
    pipe(s * 2.52, 3.92, mid, 0.09, FINAL_LENGTH);
    pipe(s * 2.86, 2.05, mid, 0.055, FINAL_LENGTH);
    box(steel, s * 2.94, 0.16, mid, 0.12, 0.24, FINAL_LENGTH);
  }
  // Overhead central cable trays & conduits kept cleanly above y=3.65m
  cableRun(-0.9, 4.18, mid, 0.04, FINAL_LENGTH);
  cableRun(-0.72, 4.14, mid, 0.035, FINAL_LENGTH);
  cableRun(1.35, 4.15, mid, 0.045, FINAL_LENGTH);

  const stationZs: number[] = [];
  const beamPivots: { group: THREE.Group; phase: number; speed: number }[] = [];

  for (let z = -25; z > FACTORY_Z; z -= 7) {
    const idx = Math.round((-25 - z) / 7);
    const isBeaconStation = idx % 2 === 0;
    const isPhaseA = (idx >> 1) % 2 === 0;

    for (const s of [-1, 1]) {
      box(steel, s * 2.93, 2.2, z, 0.16, 4.4, 0.24);
      box(redStripMat, s * 2.88, 0.85, z, 0.06, 0.1, 2.4);
      box(rust, s * 2.91, 1.55, z - 2.1, 0.12, 1.05, 0.55);
      // Wall-mounted red emergency bulkheads at alternating stations
      if (isBeaconStation) {
        box(rust, s * 2.89, 2.82, z - 0.5, 0.14, 0.28, 0.28);
        dummy.position.set(s * 2.8, 2.82, z - 0.5);
        dummy.rotation.set(0, 0, Math.PI / 2);
        dummy.scale.set(0.11, 0.14, 0.11);
        dummy.updateMatrix();
        (isPhaseA ? beaconsA : beaconsB).push(dummy.matrix.clone());
      }
    }

    // Vent grills, damp seams, offset service duct & overhead cables
    for (let j = 0; j < 6; j++) box(steel, 2.97, 2 + j * 0.09, z - 3, 0.06, 0.035, 1.2);
    box(rust, -2.99, 1.9, z - 1, 0.025, 2.4, 0.35);
    box(steel, 1.15, 4.12, z, 0.92, 0.38, 6.8);
    box(steel, 0, 4.2, z, 6, 0.18, 0.22);
    box(steel, 0, 0.015, z, 4.6, 0.025, 0.22);
    // Hanging loops/conduits strictly >= 3.35m high
    box(darkCable, -1.65, 3.82, z - 1.5, 0.04, 0.72, 0.04, 0, 0, 0.14);
    box(darkCable, 1.4, 3.72, z, 0.04, 0.85, 0.04, 0, 0, -0.1);

    if (isBeaconStation) {
      stationZs.push(z);
      // Ceiling emergency beacon housing centered cleanly below crossbeam + soft volumetric beams
      box(steel, 0, 4.06, z, 0.42, 0.14, 0.42);
      dummy.position.set(0, 3.9, z);
      dummy.rotation.set(Math.PI, 0, 0);
      dummy.scale.set(0.15, 0.2, 0.15);
      dummy.updateMatrix();
      (isPhaseA ? beaconsA : beaconsB).push(dummy.matrix.clone());

      const pivot = new THREE.Group();
      pivot.position.set(0, 3.88, z);
      pivot.rotation.y = idx * 1.1;
      const coneMat = isPhaseA ? beaconBeamMatA : beaconBeamMatB;
      const cone1 = new THREE.Mesh(beaconConeGeo, coneMat);
      cone1.rotation.x = 0.28;
      const cone2 = new THREE.Mesh(beaconConeGeo, coneMat);
      cone2.rotation.y = Math.PI;
      cone2.rotation.x = 0.28;
      pivot.add(cone1, cone2);
      group.add(pivot);
      beamPivots.push({ group: pivot, phase: isPhaseA ? 0 : Math.PI, speed: isPhaseA ? 3.2 : -2.8 });
    }
  }

  // Exit signs, hazard placards, and floor evacuation stencils (zero collision)
  const signGeo = new THREE.PlaneGeometry(1.18, 0.44);
  const overheadSignGeo = new THREE.PlaneGeometry(1.42, 0.52);
  const chevronGeo = new THREE.PlaneGeometry(1.3, 1.3);

  for (const sz of [-34, -56, -78, -100, -122]) {
    // Wall mounted SALIDA signs facing oncoming runner (+Z) and slightly inward
    for (const s of [-1, 1]) {
      const sign = new THREE.Mesh(signGeo, exitSignMat);
      sign.position.set(s * 2.86, 2.55, sz);
      sign.rotation.y = s < 0 ? Math.PI * 0.42 : -Math.PI * 0.42;
      group.add(sign);
    }
    const overhead = new THREE.Mesh(overheadSignGeo, exitSignMat);
    overhead.position.set(0, 3.68, sz);
    group.add(overhead);
    box(steel, 0, 3.98, sz, 0.06, 0.46, 0.06);
  }

  for (const hz of [-41, -69, -97, -125]) {
    const s = hz === -69 || hz === -125 ? -1 : 1;
    const hazard = new THREE.Mesh(signGeo, hazardSignMat);
    hazard.position.set(s * 2.94, 1.92, hz);
    hazard.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(hazard);
  }

  for (const cz of [-30, -48, -66, -84, -102, -120]) {
    const chev = new THREE.Mesh(chevronGeo, chevronMat);
    chev.position.set(0, 0.032, cz);
    chev.rotation.x = -Math.PI / 2;
    group.add(chev);
  }

  // 110 m wide / 62 m tall factory hall; platforms, trusses, gantry and reactor silhouettes.
  box(concrete, 0, -0.3, FACTORY_Z - 65, 120, 0.6, 132);
  box(concrete, 0, 62, FACTORY_Z - 65, 120, 0.8, 132);
  box(concrete, 0, 30, FACTORY_Z - 130, 120, 62, 1);
  for (const x of [-44, -16, 16, 44]) {
    for (let i = 0; i < 6; i++) {
      const z = FACTORY_Z - 12 - i * 20;
      box(steel, x, 30, z, 1.7, 60, 1.7);
      box(rust, x, 2, z, 3, 4, 3);
      box(cold, x, 44, z, 1, 0.3, 1);
      box(steel, 0, 59, z, 100, 1.4, 1.1);
      for (const y of [12, 27, 43]) {
        box(steel, x, y, z, 13, 0.5, 18);
        box(rust, x - 6, y + 1, z, 0.13, 2, 18);
        box(rust, x + 6, y + 1, z, 0.13, 2, 18);
        box(cold, x, y - 0.4, z, 8, 0.08, 0.2);
      }
    }
  }
  for (const z of [FACTORY_Z - 28, FACTORY_Z - 68, FACTORY_Z - 108]) {
    box(steel, 0, 28, z, 90, 0.7, 4);
    for (const side of [-1, 1]) box(rust, 0, 29, z + side * 2, 90, 1.7, 0.12);
    pipe(-17, 46, z, 2.4, 38);
    pipe(17, 51, z, 1.8, 38);
    for (const x of [-36, 36]) {
      pipe(x, 9, z, 6, 18, false);
      box(rust, x, 19, z, 9, 2, 9);
      box(redStripMat, x, 11, z + 6, 0.6, 7, 0.12);
    }
  }
  box(rust, 0, 50, FACTORY_Z - 52, 72, 3, 3);
  box(steel, 4, 40, FACTORY_Z - 52, 0.18, 18, 0.18);
  box(rust, 4, 31, FACTORY_Z - 52, 3, 1, 1);
  // Frame the arrival with a tall industrial portal against the cold hall.
  for (const x of [-4, 4]) box(rust, x, 4, FACTORY_Z, 1, 8, 1);
  box(cold, 0, 7.7, FACTORY_Z, 9, 0.25, 0.3);

  for (const [mat, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(cube, mat, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  const tubes = new THREE.InstancedMesh(cylinder, steel, pipes.length);
  pipes.forEach((matrix, i) => tubes.setMatrixAt(i, matrix));
  tubes.computeBoundingSphere();
  group.add(tubes);

  const cableMesh = new THREE.InstancedMesh(cylinder, darkCable, cables.length);
  cables.forEach((matrix, i) => cableMesh.setMatrixAt(i, matrix));
  cableMesh.computeBoundingSphere();
  group.add(cableMesh);

  const beaconMeshA = new THREE.InstancedMesh(cylinder, beaconMatA, beaconsA.length);
  beaconsA.forEach((matrix, i) => beaconMeshA.setMatrixAt(i, matrix));
  beaconMeshA.computeBoundingSphere();
  group.add(beaconMeshA);

  const beaconMeshB = new THREE.InstancedMesh(cylinder, beaconMatB, beaconsB.length);
  beaconsB.forEach((matrix, i) => beaconMeshB.setMatrixAt(i, matrix));
  beaconMeshB.computeBoundingSphere();
  group.add(beaconMeshB);

  const fill = new THREE.HemisphereLight(0x9dbfd4, 0x30261f, 2.6);
  fill.position.z = FACTORY_Z - 40;
  fill.visible = false;
  group.add(fill);

  // Bounded pool of 3 emergency red PointLights + 1 exit portal beacon + 1 factory hall light
  const redLights = [
    new THREE.PointLight(0xff1e14, 0, 19, 1.8),
    new THREE.PointLight(0xff1e14, 0, 19, 1.8),
    new THREE.PointLight(0xff1e14, 0, 19, 1.8),
  ];
  const exitBeaconLight = new THREE.PointLight(0x7fe2f7, 7, 28, 1.5);
  exitBeaconLight.position.set(0, 4.2, FACTORY_Z - 1.5);
  const hallLight = new THREE.PointLight(0xaadfff, 90, 95, 1.5);
  hallLight.position.set(0, 22, FACTORY_Z - 40);
  group.add(...redLights, exitBeaconLight, hallLight);

  // Soft vapor texture shared by factory steam & tunnel venting jets
  const vaporCanvas = document.createElement('canvas');
  vaporCanvas.width = vaporCanvas.height = 64;
  const vaporCtx = vaporCanvas.getContext('2d')!;
  const gradient = vaporCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(205,220,228,.55)');
  gradient.addColorStop(1, 'rgba(205,220,228,0)');
  vaporCtx.fillStyle = gradient;
  vaporCtx.fillRect(0, 0, 64, 64);
  const vaporMap = new THREE.CanvasTexture(vaporCanvas);

  const steamGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(80 * 3);
  for (let i = 0; i < 80; i++) {
    positions[i * 3] = Math.sin(i * 31) * 45;
    positions[i * 3 + 1] = 3 + (i % 13) * 3;
    positions[i * 3 + 2] = FACTORY_Z - 10 - (i % 17) * 7;
  }
  steamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const steamMat = new THREE.PointsMaterial({
    map: vaporMap,
    color: 0xacc4ca,
    size: 5,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  const steam = new THREE.Points(steamGeo, steamMat);
  group.add(steam);

  // Tunnel pipe steam jets at manifolds (-40, -64, -88, -112)
  const tunnelVentCount = 44;
  const ventGeo = new THREE.BufferGeometry();
  const ventBase = new Float32Array(tunnelVentCount * 3);
  const ventPos = new Float32Array(tunnelVentCount * 3);
  const ventOrigins = [-40, -64, -88, -112];
  for (let i = 0; i < tunnelVentCount; i++) {
    const vz = ventOrigins[i % ventOrigins.length];
    const side = i % 2 === 0 ? -1 : 1;
    ventBase[i * 3] = side * 2.45;
    ventBase[i * 3 + 1] = 3.25;
    ventBase[i * 3 + 2] = vz + ((i % 5) - 2) * 0.25;
    ventPos[i * 3] = ventBase[i * 3];
    ventPos[i * 3 + 1] = ventBase[i * 3 + 1];
    ventPos[i * 3 + 2] = ventBase[i * 3 + 2];
  }
  ventGeo.setAttribute('position', new THREE.BufferAttribute(ventPos, 3));
  const ventMat = new THREE.PointsMaterial({
    map: vaporMap,
    color: 0xd0a29e,
    size: 1.55,
    transparent: true,
    opacity: 0.19,
    depthWrite: false,
  });
  const tunnelVents = new THREE.Points(ventGeo, ventMat);
  group.add(tunnelVents);

  // Occasional small electrical spark bursts near junction cabinets
  const sparkCount = 24;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkBase = [
    { x: -2.75, y: 1.75, z: -49 },
    { x: 2.75, y: 1.85, z: -77 },
    { x: -2.75, y: 1.65, z: -105 },
  ];
  const sparkPos = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) {
    const origin = sparkBase[i % sparkBase.length];
    sparkPos[i * 3] = origin.x;
    sparkPos[i * 3 + 1] = origin.y;
    sparkPos[i * 3 + 2] = origin.z;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffb35c,
    size: 0.085,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  group.add(sparks);

  return {
    group,
    update(
      z: number,
      time: number,
      reveal: boolean,
      disableFlashes: boolean,
      emergencyActive = false,
      chasePhase: FinalChasePhase = 'PANIC_START',
    ) {
      fill.visible = reveal;
      steam.position.y = Math.sin(time * 0.18) * 1.5;

      // Update venting tunnel steam jets
      const ventAttr = ventGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < tunnelVentCount; i++) {
        const cycle = (time * 1.15 + i * 0.19) % 1;
        const side = i % 2 === 0 ? -1 : 1;
        ventPos[i * 3] = ventBase[i * 3] - side * cycle * 1.1;
        ventPos[i * 3 + 1] = ventBase[i * 3 + 1] - cycle * 1.55;
        ventPos[i * 3 + 2] = ventBase[i * 3 + 2] + Math.sin(time * 2 + i) * 0.14;
      }
      ventAttr.needsUpdate = true;

      // Smooth industrial emergency alarm waves (never rapid painful strobes)
      const pulseA = disableFlashes ? 0.85 : 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(time * 3.1));
      const pulseB = disableFlashes ? 0.85 : 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(time * 3.1 + Math.PI));
      const emergencyGain = emergencyActive ? (chasePhase === 'FINAL_METERS' ? 1.25 : 1.0) : 0.35;

      beaconMatA.emissiveIntensity = (emergencyActive ? 2.4 : 0.55) * pulseA * emergencyGain;
      beaconMatB.emissiveIntensity = (emergencyActive ? 2.4 : 0.55) * pulseB * emergencyGain;
      redStripMat.emissiveIntensity = (emergencyActive ? 1.35 : 0.3) * (0.72 + 0.28 * pulseA);

      const showBeams = emergencyActive && !disableFlashes;
      beaconBeamMatA.opacity = showBeams ? 0.34 * pulseA : 0;
      beaconBeamMatB.opacity = showBeams ? 0.34 * pulseB : 0;
      for (let i = 0; i < beamPivots.length; i++) {
        const b = beamPivots[i];
        b.group.visible = showBeams && Math.abs(b.group.position.z - z) < 38;
        if (b.group.visible) {
          b.group.rotation.y = b.phase + time * b.speed;
        }
      }

      // Snap the 3 pooled red PointLights to the nearest emergency stations around the player
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < stationZs.length; i++) {
        const d = Math.abs(stationZs[i] - z);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }

      const indices = [
        Math.max(0, nearestIdx - 1),
        nearestIdx,
        Math.min(stationZs.length - 1, nearestIdx + 1),
      ];

      for (let i = 0; i < 3; i++) {
        const stIdx = indices[i];
        const stZ = stationZs[stIdx];
        const isA = stIdx % 2 === 0;
        const p = isA ? pulseA : pulseB;
        redLights[i].position.set(0, 3.35, stZ);
        redLights[i].intensity = emergencyActive
          ? (disableFlashes ? 13.5 : 8.5 + 10.5 * p) * emergencyGain
          : 4.5;
      }

      exitBeaconLight.intensity = reveal ? 12 : chasePhase === 'FINAL_METERS' ? 15 : 7;

      // Occasional subtle electrical sparks (completely off if disableFlashes)
      if (!disableFlashes && emergencyActive) {
        const sparkGate = Math.sin(time * 2.3) * Math.sin(time * 5.7);
        const burst = sparkGate > 0.78 ? (sparkGate - 0.78) / 0.22 : 0;
        sparks.visible = burst > 0.01;
        sparkMat.opacity = burst * 0.85;
        if (sparks.visible) {
          const sAttr = sparkGeo.getAttribute('position') as THREE.BufferAttribute;
          const dropPhase = (time * 6) % 1;
          for (let i = 0; i < sparkCount; i++) {
            const origin = sparkBase[i % sparkBase.length];
            const dir = origin.x < 0 ? 1 : -1;
            sparkPos[i * 3] = origin.x + dir * (0.08 + ((i * 7) % 11) * 0.04 * dropPhase);
            sparkPos[i * 3 + 1] = origin.y - dropPhase * (0.5 + (i % 4) * 0.22);
            sparkPos[i * 3 + 2] = origin.z + Math.sin(i * 13 + time * 12) * 0.22 * dropPhase;
          }
          sAttr.needsUpdate = true;
        }
      } else {
        sparks.visible = false;
      }
    },
    dispose() {
      cube.dispose();
      cylinder.dispose();
      beaconConeGeo.dispose();
      signGeo.dispose();
      overheadSignGeo.dispose();
      chevronGeo.dispose();
      steamGeo.dispose();
      ventGeo.dispose();
      sparkGeo.dispose();
      steamMat.dispose();
      ventMat.dispose();
      sparkMat.dispose();
      vaporMap.dispose();
      beamTex.dispose();
      exitSignTex.dispose();
      hazardSignTex.dispose();
      chevronTex.dispose();
      [
        steel,
        concrete,
        rust,
        darkCable,
        cold,
        redStripMat,
        beaconMatA,
        beaconMatB,
        beaconBeamMatA,
        beaconBeamMatB,
        exitSignMat,
        hazardSignMat,
        chevronMat,
      ].forEach((m) => m.dispose());
    },
  };
}
