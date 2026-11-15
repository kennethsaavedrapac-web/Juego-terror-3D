import * as THREE from 'three';
import { mapWatcherGeometry, createWatcherSurface } from './watcherSurface';
import type { WatcherSurface } from './watcherAtlas';
import type { WatcherAnimState } from './types';

export interface WatcherAnimateOptions {
  animState?: WatcherAnimState;
  lookYawOffset?: number;
  lookPitchOffset?: number;
  attackProgress?: number; // 0..1
  allowFrozenMicroBreath?: boolean;
  onFootstep?: (intensity: number, isRunning: boolean) => void;
}

export interface WatcherJointRig {
  hips: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulders: [THREE.Group, THREE.Group];
  upperArms: [THREE.Group, THREE.Group];
  elbows: [THREE.Group, THREE.Group];
  hands: [THREE.Group, THREE.Group];
  fingers: [THREE.Group[], THREE.Group[]];
  hipsLegs: [THREE.Group, THREE.Group];
  knees: [THREE.Group, THREE.Group];
  feet: [THREE.Group, THREE.Group];
}

export function createWatcherModel() {
  const root = new THREE.Group();
  root.name = 'THE WATCHER';

  const surface = createWatcherSurface();
  const sphere = new THREE.SphereGeometry(1, 10, 7);
  const geometries = new Map<WatcherSurface, THREE.SphereGeometry>();

  const part = (
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    region: WatcherSurface = 'torso',
  ) => {
    let geometry = geometries.get(region);
    if (!geometry) {
      geometry = mapWatcherGeometry(sphere, region);
      geometries.set(region, geometry);
    }
    const mesh = new THREE.Mesh(geometry, surface.material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  };

  // Subtle radial contact shadow disc at ground level for crisp figure-ground grounding
  const shadowCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let contactShadowTex: THREE.CanvasTexture | null = null;
  let contactShadowGeo: THREE.CircleGeometry | null = null;
  let contactShadowMat: THREE.MeshBasicMaterial | null = null;
  if (shadowCanvas) {
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext('2d');
    if (sctx) {
      const grad = sctx.createRadialGradient(64, 64, 8, 64, 64, 62);
      grad.addColorStop(0, 'rgba(0,0,0,0.62)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 128, 128);
    }
    contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
    contactShadowGeo = new THREE.CircleGeometry(0.62, 16);
    contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    const contactShadow = new THREE.Mesh(contactShadowGeo, contactShadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.015, 0.02);
    root.add(contactShadow);
  }

  // Root articulated pelvis / hips
  const HIPS_BASE_Y = 1.46;
  const hips = new THREE.Group();
  hips.name = 'watcher-hips';
  hips.position.set(0, HIPS_BASE_Y, 0.06);
  root.add(hips);
  part(hips, 0, 0, 0, 0.185, 0.21, 0.135, 'pelvis');

  // Torso / upper body pivoted above pelvis
  const torso = new THREE.Group();
  torso.name = 'watcher-torso';
  torso.position.set(0, 0.05, -0.02);
  hips.add(torso);

  const chestMesh = part(torso, 0, 0.4, -0.04, 0.24, 0.54, 0.15, 'torso');
  chestMesh.rotation.x = -0.16;
  part(torso, 0, 0.75, 0.07, 0.29, 0.18, 0.19, 'torso'); // hunched shoulder blades
  for (let i = 0; i < 6; i++) {
    part(torso, 0, 0.2 + i * 0.09, 0.11, 0.038, 0.033, 0.035, 'spine');
  }

  // Neck & Head hierarchy
  const neck = new THREE.Group();
  neck.name = 'watcher-neck';
  neck.position.set(0, 0.84, -0.09);
  torso.add(neck);
  part(neck, 0, 0.07, 0.01, 0.075, 0.2, 0.08, 'neck');

  const head = new THREE.Group();
  head.name = 'watcher-head';
  head.position.set(0, 0.2, -0.02);
  neck.add(head);
  part(head, 0, 0.07, 0, 0.17, 0.27, 0.145, 'head');

  // Limbs with shoulder -> upperArm -> elbow -> hand -> fingers and hip -> knee -> foot
  const shoulders: THREE.Group[] = [];
  const upperArms: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  const hands: THREE.Group[] = [];
  const fingers: [THREE.Group[], THREE.Group[]] = [[], []];
  const hipsLegs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const feet: THREE.Group[] = [];

  for (let idx = 0; idx < 2; idx++) {
    const side = idx === 0 ? -1 : 1;

    // Shoulder -> Upper Arm -> Elbow -> Hand -> Fingers
    const shoulder = new THREE.Group();
    shoulder.name = `watcher-shoulder-${side < 0 ? 'L' : 'R'}`;
    shoulder.position.set(side * 0.29, 0.74, 0.02);
    torso.add(shoulder);
    shoulders.push(shoulder);

    const upperArm = new THREE.Group();
    upperArm.name = `watcher-upperArm-${side < 0 ? 'L' : 'R'}`;
    shoulder.add(upperArm);
    upperArms.push(upperArm);

    part(upperArm, side * 0.035, -0.44, 0, 0.065, 0.47, 0.07, 'upperArm').rotation.z =
      side * 0.08;
    part(upperArm, side * 0.075, -0.9, -0.02, 0.073, 0.085, 0.07, 'upperArm');

    const elbow = new THREE.Group();
    elbow.name = `watcher-elbow-${side < 0 ? 'L' : 'R'}`;
    elbow.position.set(side * 0.075, -0.9, -0.02);
    upperArm.add(elbow);
    elbows.push(elbow);

    part(elbow, side * 0.015, -0.4, -0.025, 0.045, 0.42, 0.05, 'forearm').rotation.x =
      -0.09;

    const hand = new THREE.Group();
    hand.name = `watcher-hand-${side < 0 ? 'L' : 'R'}`;
    hand.position.set(side * 0.025, -0.79, -0.06);
    elbow.add(hand);
    hands.push(hand);

    part(hand, 0, 0, 0, 0.078, 0.145, 0.038, 'palm');

    for (let f = 0; f < 4; f++) {
      const fingerPivot = new THREE.Group();
      fingerPivot.position.set((f - 1.5) * 0.036, -0.1, -0.01);
      fingerPivot.rotation.z = (f - 1.5) * 0.09;
      hand.add(fingerPivot);
      part(
        fingerPivot,
        0,
        -0.085 - Math.sin(f) * 0.02,
        -0.004,
        0.014,
        0.155,
        0.016,
        'finger',
      );
      fingers[idx].push(fingerPivot);
    }

    // Hip -> Knee -> Foot
    const hipLeg = new THREE.Group();
    hipLeg.name = `watcher-hipLeg-${side < 0 ? 'L' : 'R'}`;
    hipLeg.position.set(side * 0.13, -0.02, -0.02);
    hips.add(hipLeg);
    hipsLegs.push(hipLeg);

    part(hipLeg, side * 0.025, -0.34, 0.04, 0.085, 0.39, 0.09, 'thigh').rotation.x = -0.14;
    part(hipLeg, side * 0.035, -0.75, 0.09, 0.065, 0.08, 0.07, 'thigh');

    const knee = new THREE.Group();
    knee.name = `watcher-knee-${side < 0 ? 'L' : 'R'}`;
    knee.position.set(side * 0.035, -0.75, 0.09);
    hipLeg.add(knee);
    knees.push(knee);

    part(knee, -side * 0.01, -0.32, -0.08, 0.045, 0.35, 0.055, 'shin').rotation.x = 0.15;

    const foot = new THREE.Group();
    foot.name = `watcher-foot-${side < 0 ? 'L' : 'R'}`;
    foot.position.set(-side * 0.01, -0.66, -0.17);
    knee.add(foot);
    feet.push(foot);

    part(foot, 0, 0, 0, 0.065, 0.05, 0.16, 'foot');
  }

  const rig: WatcherJointRig = {
    hips,
    torso,
    neck,
    head,
    shoulders: shoulders as [THREE.Group, THREE.Group],
    upperArms: upperArms as [THREE.Group, THREE.Group],
    elbows: elbows as [THREE.Group, THREE.Group],
    hands: hands as [THREE.Group, THREE.Group],
    fingers,
    hipsLegs: hipsLegs as [THREE.Group, THREE.Group],
    knees: knees as [THREE.Group, THREE.Group],
    feet: feet as [THREE.Group, THREE.Group],
  };

  let gaitPhase = 0;
  let breathTime = 0;
  let idleTwitchTime = 0;
  let prevSinPhase = 0;

  // Smoothed state blend weights
  let walkBlend = 0;
  let runBlend = 0;
  let attackBlend = 0;
  let crouchBlend = 0;

  const damp = THREE.MathUtils.damp;

  const resetPoseState = () => {
    gaitPhase = 0;
    breathTime = 0;
    idleTwitchTime = 0;
    prevSinPhase = 0;
    walkBlend = 0;
    runBlend = 0;
    attackBlend = 0;
    crouchBlend = 0;
    hips.position.set(0, HIPS_BASE_Y, 0.06);
    hips.rotation.set(0, 0, 0);
    hips.scale.set(1, 1, 1);
    torso.rotation.set(0, 0, 0);
    torso.scale.set(1, 1, 1);
    neck.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    for (let i = 0; i < 2; i++) {
      shoulders[i].rotation.set(0, 0, 0);
      upperArms[i].rotation.set(0, 0, 0);
      elbows[i].rotation.set(0, 0, 0);
      hands[i].rotation.set(0, 0, 0);
      hipsLegs[i].rotation.set(0, 0, 0);
      knees[i].rotation.set(0, 0, 0);
      feet[i].rotation.set(0, 0, 0);
      for (let f = 0; f < 4; f++) {
        fingers[i][f].rotation.x = 0;
      }
    }
  };

  let frozenBlend = 0;

  const animate = (
    dt: number,
    speed: number,
    frozen: boolean,
    crouch: boolean,
    options?: WatcherAnimateOptions,
  ) => {
    const safeDt = Math.min(Math.max(dt, 0), 0.1);

    if (frozen) {
      if (!options || !options.allowFrozenMicroBreath) {
        // Pure freeze with no micro-movement options keeps all joint rotations and scales completely locked
        return;
      }
      // Living frozen state: root & feet stay strictly locked, but body breathes, shoulders heave,
      // head tilts eerily toward player, and fingers subtly tense and twitch.
      breathTime += safeDt * 1.35;
      idleTwitchTime += safeDt;
      const breath = Math.sin(breathTime);
      const heaveX = 1 + breath * 0.026;
      const heaveZ = 1 + breath * 0.038;
      const heaveY = 1 + breath * 0.012;
      torso.scale.set(heaveX, heaveY, heaveZ);

      // Shoulders subtly rise and fall with deep breath
      shoulders[0].position.y = 0.74 + breath * 0.014;
      shoulders[1].position.y = 0.74 + breath * 0.014;

      // Unnerving broken-angle head tilt and subtle tracking toward player
      const lookYaw = THREE.MathUtils.clamp(options.lookYawOffset ?? 0, -0.6, 0.6);
      const twitch = Math.sin(idleTwitchTime * 0.7) * 0.04;
      head.rotation.y = damp(head.rotation.y, lookYaw * 0.45 + twitch, 8, safeDt);
      head.rotation.z = damp(head.rotation.z, 0.22 + Math.sin(breathTime * 0.5) * 0.04, 8, safeDt);
      head.rotation.x = damp(head.rotation.x, -0.05 + breath * 0.02, 8, safeDt);
      neck.rotation.y = damp(neck.rotation.y, lookYaw * 0.25, 8, safeDt);
      neck.rotation.z = damp(neck.rotation.z, 0.12, 8, safeDt);

      // Hands and fingers subtly tense and curl like ready to strike
      for (let i = 0; i < 2; i++) {
        hands[i].rotation.x = damp(hands[i].rotation.x, 0.18 + breath * 0.04, 10, safeDt);
        for (let f = 0; f < 4; f++) {
          const fingerWave = Math.sin(breathTime * (1.4 + f * 0.4) + i * 1.8 + f);
          const targetCurl = 0.28 + fingerWave * 0.12;
          fingers[i][f].rotation.x = damp(fingers[i][f].rotation.x, targetCurl, 12, safeDt);
        }
      }
      return;
    }

    const animState: WatcherAnimState =
      options?.animState ?? (speed > 1.35 ? 'RUN' : speed > 0.08 ? 'WALK' : 'IDLE');

    const targetAttack = animState === 'ATTACK' ? 1 : 0;
    const targetRun = animState === 'RUN' ? 1 : 0;
    const targetWalk = animState === 'WALK' ? 1 : 0;
    const targetIdle = Math.max(0, 1 - targetAttack - targetRun - targetWalk);

    walkBlend = damp(walkBlend, targetWalk, 9, safeDt);
    runBlend = damp(runBlend, targetRun, 10, safeDt);
    attackBlend =
      targetAttack === 1
        ? Math.max(0.42, damp(attackBlend, 1, 24, safeDt))
        : damp(attackBlend, 0, 18, safeDt);
    crouchBlend = damp(crouchBlend, crouch ? 1 : 0, 11, safeDt);

    const moveBlend = Math.min(1, walkBlend + runBlend);
    const isRunning = runBlend > 0.45;

    // Organic breath frequency scaling: fast aggressive panting in RUN, steady in WALK, deep in IDLE
    const breathSpeed = 1.6 * targetIdle + 2.5 * walkBlend + 4.6 * runBlend + 5.2 * attackBlend;
    breathTime += safeDt * breathSpeed;
    idleTwitchTime += safeDt;

    // Step cadence synchronized to movement speed so feet never skate
    const strideFreq =
      speed > 0.05
        ? (isRunning ? 5.8 : 3.4) *
          Math.max(0.65, Math.min(1.65, speed / (isRunning ? 1.85 : 1.0)))
        : 0;
    if (strideFreq > 0 && attackBlend < 0.5) {
      const nextPhase = gaitPhase + safeDt * strideFreq;
      if (Math.floor(nextPhase / Math.PI) > Math.floor(gaitPhase / Math.PI)) {
        if (moveBlend > 0.25) {
          options?.onFootstep?.(Math.min(1, 0.48 + speed * 0.35), isRunning);
        }
      }
      prevSinPhase = Math.sin(nextPhase);
      gaitPhase = nextPhase;
    }

    const breath = Math.sin(breathTime);
    const twitchPulse = Math.pow(Math.max(0, Math.sin(idleTwitchTime * 0.75 + Math.sin(idleTwitchTime * 1.9))), 6);
    const idleWeight = Math.max(0, 1 - moveBlend - attackBlend);

    const atkP = THREE.MathUtils.clamp(options?.attackProgress ?? 0, 0, 1);
    const atkEase = 1 - Math.pow(1 - atkP, 2.2);
    const atkGrab = atkP > 0.42 ? Math.sin(((atkP - 0.42) / 0.58) * Math.PI * 0.5) : 0;

    // 1. Torso & Organic Breathing & Hunch
    const chestScaleX = 1 + breath * (0.024 * idleWeight + 0.045 * runBlend + 0.022 * walkBlend) + 0.04 * attackBlend;
    const chestScaleZ = 1 + breath * (0.035 * idleWeight + 0.065 * runBlend + 0.030 * walkBlend) + 0.05 * attackBlend;
    const chestScaleY = 1 + breath * (0.012 * idleWeight + 0.025 * runBlend);
    torso.scale.set(chestScaleX, chestScaleY, chestScaleZ);

    // Subtle shoulder rise and fall with breathing
    const shoulderHeave = breath * (0.012 * idleWeight + 0.024 * runBlend + 0.015 * walkBlend);
    shoulders[0].position.y = 0.74 + shoulderHeave;
    shoulders[1].position.y = 0.74 + shoulderHeave;

    const targetTorsoPitch =
      (-0.12 - breath * 0.025) * targetIdle +
      (-0.28 - Math.sin(gaitPhase * 2) * 0.03) * walkBlend +
      (-0.52 - Math.sin(gaitPhase * 2) * 0.05) * runBlend +
      (-0.42 - atkEase * 0.38) * attackBlend -
      crouchBlend * 0.22;

    const targetTorsoYaw =
      Math.sin(breathTime * 0.45) * 0.04 * targetIdle +
      Math.sin(gaitPhase) * 0.11 * walkBlend +
      Math.sin(gaitPhase) * 0.18 * runBlend +
      Math.sin(atkP * Math.PI * 4) * 0.06 * attackBlend;

    const targetTorsoRoll =
      Math.sin(breathTime * 0.32) * 0.035 * targetIdle +
      Math.cos(gaitPhase) * 0.06 * walkBlend +
      Math.cos(gaitPhase) * 0.09 * runBlend +
      Math.cos(atkP * Math.PI * 3) * 0.05 * attackBlend;

    torso.rotation.x = damp(torso.rotation.x, targetTorsoPitch, 13, safeDt);
    torso.rotation.y = damp(torso.rotation.y, targetTorsoYaw, 13, safeDt);
    torso.rotation.z = damp(torso.rotation.z, targetTorsoRoll, 13, safeDt);

    // 2. Neck & Head (unnatural tilt + predatory player gaze tracking)
    const lookYaw = THREE.MathUtils.clamp(options?.lookYawOffset ?? 0, -0.60, 0.60);
    const lookPitch = THREE.MathUtils.clamp(options?.lookPitchOffset ?? 0, -0.35, 0.35);

    const targetNeckPitch =
      (0.08 + breath * 0.02) * targetIdle +
      0.18 * walkBlend +
      0.34 * runBlend +
      (0.30 + atkEase * 0.18) * attackBlend +
      crouchBlend * 0.15;
    const targetNeckYaw = Math.sin(breathTime * 0.6) * 0.08 * targetIdle + lookYaw * 0.35;
    const targetNeckRoll =
      (0.12 + twitchPulse * 0.16) * targetIdle -
      Math.sin(gaitPhase) * 0.04 * moveBlend +
      Math.sin(atkP * 28) * 0.05 * attackBlend;

    neck.rotation.x = damp(neck.rotation.x, targetNeckPitch, 12, safeDt);
    neck.rotation.y = damp(neck.rotation.y, targetNeckYaw, 12, safeDt);
    neck.rotation.z = damp(neck.rotation.z, targetNeckRoll, 12, safeDt);

    const targetHeadPitch =
      (0.05 + lookPitch * 0.65) * (1 - attackBlend) +
      (0.18 + Math.sin(atkP * Math.PI) * 0.2) * attackBlend;
    const targetHeadYaw =
      (Math.sin(breathTime * 0.42) * 0.12 + twitchPulse * 0.18) * targetIdle +
      lookYaw * 0.70 * (runBlend + walkBlend * 0.6 + attackBlend) +
      Math.sin(atkP * 36) * 0.07 * attackBlend;
    const targetHeadRoll =
      (0.22 + Math.sin(breathTime * 0.7) * 0.05 + twitchPulse * 0.22) * targetIdle +
      (0.14 + Math.cos(gaitPhase) * 0.05) * walkBlend +
      (0.09 + Math.cos(gaitPhase) * 0.07) * runBlend -
      (0.18 + Math.sin(atkP * 14) * 0.09) * attackBlend;

    head.rotation.x = damp(head.rotation.x, targetHeadPitch, 14, safeDt);
    head.rotation.y = damp(head.rotation.y, targetHeadYaw, 14, safeDt);
    head.rotation.z = damp(head.rotation.z, targetHeadRoll, 14, safeDt);

    // 3. Legs (hip + knee + foot) & Grounding
    let lowestFootDrop = 0;
    const thighLen = 0.75;
    const shinLen = 0.66;

    for (let i = 0; i < 2; i++) {
      const phaseOffset = i * Math.PI;
      const stride = Math.sin(gaitPhase + phaseOffset);
      const lift = Math.max(0, Math.cos(gaitPhase + phaseOffset));

      // Asymmetric eerie gait: slightly uneven stride amplitude
      const asym = i === 0 ? 1.0 : 0.92;

      const hipPitch =
        0.04 * targetIdle +
        stride * 0.36 * asym * walkBlend +
        (stride * 0.62 * asym + 0.16) * runBlend +
        (i === 0 ? 0.24 : -0.18) * attackBlend +
        crouchBlend * 0.32;

      // Knee flexes backward (negative X) during swing and crouched run
      const kneePitch =
        -0.1 * targetIdle +
        (-0.20 - lift * 0.52) * walkBlend +
        (-0.30 - lift * 0.84) * runBlend -
        0.22 * attackBlend -
        crouchBlend * 0.64;

      // Foot compensates so sole stays near level with floor during stance
      const footPitch =
        0.06 * targetIdle +
        (-hipPitch * 0.35 + lift * 0.25) * moveBlend;

      hipsLegs[i].rotation.x = damp(hipsLegs[i].rotation.x, hipPitch, 14, safeDt);
      hipsLegs[i].rotation.z = damp(
        hipsLegs[i].rotation.z,
        (i === 0 ? -0.025 : 0.025) * (1 + runBlend * 0.6),
        12,
        safeDt,
      );
      knees[i].rotation.x = damp(knees[i].rotation.x, kneePitch, 14, safeDt);
      feet[i].rotation.x = damp(feet[i].rotation.x, footPitch, 14, safeDt);

      // Analytical vertical reach of this leg to keep feet planted on the ground plane
      const effHip = hipsLegs[i].rotation.x;
      const effShin = effHip + knees[i].rotation.x;
      const reach = thighLen * Math.cos(effHip) + shinLen * Math.cos(effShin);
      const drop = thighLen + shinLen - reach;
      if (drop > lowestFootDrop) lowestFootDrop = drop;
    }

    // Hips sway & height compensation for knee flexion / crouch
    const hipSwayYaw =
      -Math.sin(gaitPhase) * 0.08 * walkBlend - Math.sin(gaitPhase) * 0.16 * runBlend;
    const hipSwayRoll =
      Math.cos(gaitPhase) * 0.05 * walkBlend + Math.cos(gaitPhase) * 0.08 * runBlend;
    const strideBounce = Math.abs(Math.sin(gaitPhase)) * (0.045 * walkBlend + 0.095 * runBlend);
    const attackLungeZ = -atkEase * 0.44 * attackBlend;

    hips.rotation.y = damp(hips.rotation.y, hipSwayYaw, 12, safeDt);
    hips.rotation.z = damp(hips.rotation.z, hipSwayRoll, 12, safeDt);
    hips.position.y = damp(
      hips.position.y,
      HIPS_BASE_Y - lowestFootDrop * 0.85 + strideBounce - crouchBlend * 0.16 - atkEase * 0.08 * attackBlend,
      14,
      safeDt,
    );
    hips.position.z = damp(hips.position.z, 0.06 + attackLungeZ, 18, safeDt);

    // 4. Arms (shoulder -> upperArm -> elbow -> hand -> fingers)
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const phaseOffset = i * Math.PI + 0.35;
      const swing = Math.sin(gaitPhase + phaseOffset);
      const asymArm = i === 0 ? 1.05 : 0.82;

      const shoulderRoll =
        side * (0.04 + breath * 0.015) * targetIdle +
        side * (0.06 + Math.cos(gaitPhase + phaseOffset) * 0.05) * walkBlend +
        side * (0.16 + Math.cos(gaitPhase + phaseOffset) * 0.09) * runBlend +
        side * (0.28 - atkGrab * 0.12) * attackBlend;

      const upperArmPitch =
        (0.08 + Math.sin(breathTime * 1.1 + i * 1.7) * 0.035) * targetIdle +
        (0.14 - swing * 0.28 * asymArm) * walkBlend +
        (0.52 - swing * 0.62 * asymArm) * runBlend +
        (2.10 + atkEase * 0.25) * attackBlend;

      const upperArmRoll =
        side * 0.05 * targetIdle +
        side * 0.08 * walkBlend +
        side * 0.16 * runBlend -
        side * (0.34 - atkGrab * 0.32) * attackBlend;

      // Forearms extend aggressively toward camera, then hook inward as claws close
      const elbowPitch =
        (0.18 + Math.sin(breathTime * 1.3 + i) * 0.04) * targetIdle +
        (0.35 + Math.max(0, -swing) * 0.24) * walkBlend +
        (0.72 + Math.max(0, -swing) * 0.44) * runBlend +
        (0.38 - atkEase * 0.24 + atkGrab * 0.32) * attackBlend;

      const handPitch =
        (0.12 + twitchPulse * 0.18) * targetIdle +
        0.16 * walkBlend +
        0.26 * runBlend +
        (-0.34 + atkGrab * 0.48) * attackBlend;

      const handRoll =
        side * 0.08 * targetIdle +
        side * 0.16 * runBlend +
        side * (0.32 - atkGrab * 0.28) * attackBlend;

      shoulders[i].rotation.z = damp(shoulders[i].rotation.z, shoulderRoll, 14, safeDt);
      upperArms[i].rotation.x = damp(upperArms[i].rotation.x, upperArmPitch, 16, safeDt);
      upperArms[i].rotation.z = damp(upperArms[i].rotation.z, upperArmRoll, 16, safeDt);
      elbows[i].rotation.x = damp(elbows[i].rotation.x, elbowPitch, 16, safeDt);
      hands[i].rotation.x = damp(hands[i].rotation.x, handPitch, 16, safeDt);
      hands[i].rotation.z = damp(hands[i].rotation.z, handRoll, 16, safeDt);

      // Articulated finger curl / creepy idle twitching / attack splay-then-claw
      for (let f = 0; f < 4; f++) {
        const fingerWave = Math.sin(breathTime * (1.8 + f * 0.45) + i * 2.1 + f);
        const targetFingerCurl =
          (0.20 + fingerWave * 0.14) * targetIdle +
          (0.28 + fingerWave * 0.08) * walkBlend +
          0.54 * runBlend +
          (-0.20 + atkGrab * 1.10) * attackBlend;
        fingers[i][f].rotation.x = damp(fingers[i][f].rotation.x, targetFingerCurl, 18, safeDt);
      }
    }
  };

  return {
    root,
    rig,
    animate,
    resetPoseState,
    dispose() {
      sphere.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      contactShadowGeo?.dispose();
      contactShadowMat?.dispose();
      contactShadowTex?.dispose();
      surface.dispose();
    },
  };
}
