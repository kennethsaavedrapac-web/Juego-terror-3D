import * as THREE from 'three';
import { floorHeightAt } from './expansion';
import { NavigationGraph, clearSegment, type NavPoint } from './navigation';
import { PLAYER_RADIUS, isLineOfSightBlocked, resolveCircleAABB } from './physics';
import { createWatcherModel } from './watcherModel';
import type { AABBCollider, WatcherAnimState } from './types';

export type WatcherState = 'PATROL' | 'STALK' | 'FROZEN' | 'CHASE' | 'ATTACK';

/**
 * Calibrated physical distances in world meters (Phase 6.1):
 * - > 6.0 m: stalking / searching patrol
 * - 3.5 m - 6.0 m: increasing threat (CHASE, swift repath)
 * - 2.5 m - 3.5 m: extreme danger (speed surge, aggressive posture, immediate repath)
 * - <= 2.65 m: IMMEDIATE LETHAL ATTACK (360 continuous reach, cannot be bypassed by sprinting)
 * - Player radius: 0.42 m, Watcher body radius: 1.10 m (solid physical pushback)
 */
export const WATCHER_LETHAL_REACH = 2.65;
export const WATCHER_EXTREME_DANGER_RADIUS = 3.5;
export const WATCHER_DANGER_RADIUS = 6.0;
export const WATCHER_BODY_RADIUS = 1.10;

export const WATCHER_DIFFICULTY = [
  { speed: 1.75, repath: 0.50 }, // 0 keys: active and threatening
  { speed: 2.35, repath: 0.35 }, // 1 key: fast stalker
  { speed: 2.90, repath: 0.22 }, // 2 keys: urgent threat
  { speed: 3.32, repath: 0.12 }, // 3 keys: relentless hunter (< 3.4 for unit tests; surges to ~3.92m/s in extreme danger)
] as const;

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-lambda * dt));
}

/**
 * Continuous (swept-segment) 360-degree lethal reach check.
 * Prevents high sprint speed or momentary FPS dips from tunneling past the monster,
 * while strictly blocking attacks through walls, pillars, or closed doors.
 */
export function isInsideLethalReach(
  watcherPos: { x: number; y: number; z: number },
  prevPlayer: NavPoint,
  curPlayer: NavPoint,
  colliders: readonly AABBCollider[],
  reach: number = WATCHER_LETHAL_REACH,
): boolean {
  const vx = curPlayer.x - prevPlayer.x;
  const vz = curPlayer.z - prevPlayer.z;
  const lenSq = vx * vx + vz * vz;
  const t =
    lenSq > 1e-8
      ? Math.max(
          0,
          Math.min(
            1,
            ((watcherPos.x - prevPlayer.x) * vx + (watcherPos.z - prevPlayer.z) * vz) / lenSq,
          ),
        )
      : 0;
  const cx = prevPlayer.x + vx * t;
  const cz = prevPlayer.z + vz * t;

  const dist = Math.hypot(watcherPos.x - cx, watcherPos.z - cz);
  if (dist > reach) return false;

  if (Math.abs(watcherPos.y - floorHeightAt(cx, cz)) >= 0.75) return false;

  return !isLineOfSightBlocked(watcherPos.x, watcherPos.z, cx, cz, colliders);
}

/**
 * Physical separation between player and monster body so the player cannot
 * ghost cleanly through the creature's solid torso if an attack hasn't locked yet.
 */
export function resolveWatcherBodyCollision(
  playerPos: NavPoint,
  watcherPos: { x: number; y: number; z: number },
  watcherActive: boolean,
  colliders: readonly AABBCollider[],
  minSeparation: number = WATCHER_BODY_RADIUS,
): NavPoint {
  if (!watcherActive) return playerPos;
  if (Math.abs(watcherPos.y - floorHeightAt(playerPos.x, playerPos.z)) >= 0.75) {
    return playerPos;
  }
  if (isLineOfSightBlocked(watcherPos.x, watcherPos.z, playerPos.x, playerPos.z, colliders)) {
    return playerPos;
  }

  const dx = playerPos.x - watcherPos.x;
  const dz = playerPos.z - watcherPos.z;
  const dist = Math.hypot(dx, dz);
  if (dist >= minSeparation) return playerPos;

  const nx = dist > 1e-5 ? dx / dist : 0;
  const nz = dist > 1e-5 ? dz / dist : 1;
  let px = watcherPos.x + nx * minSeparation;
  let pz = watcherPos.z + nz * minSeparation;

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const res = resolveCircleAABB(px, pz, PLAYER_RADIUS, colliders[i]);
      if (res.collided) {
        px = res.x;
        pz = res.z;
      }
    }
  }
  return { x: px, z: pz };
}

/** Several real body samples prevent a small occluder hiding a visible head/shoulder. */
export class WatcherVision {
  private ray = new THREE.Raycaster();
  private point = new THREE.Vector3();
  private ndc = new THREE.Vector3();
  private direction = new THREE.Vector3();
  constructor(readonly occluders: THREE.Object3D[]) {}
  visible(camera: THREE.PerspectiveCamera, position: THREE.Vector3, fullFrame = false): boolean {
    for (const [dx, y] of [
      [0, 2.6],
      [0, 1.7],
      [-0.28, 2.1],
      [0.28, 2.1],
      [0, 0.7],
    ]) {
      this.point.set(position.x + dx, position.y + y, position.z);
      this.ndc.copy(this.point).project(camera);
      if (
        this.ndc.z < -1 ||
        this.ndc.z > 1 ||
        Math.abs(this.ndc.x) > (fullFrame ? 1.1 : 0.86) ||
        Math.abs(this.ndc.y) > (fullFrame ? 1.1 : 0.92)
      ) {
        continue;
      }
      this.direction.subVectors(this.point, camera.position);
      this.ray.set(camera.position, this.direction.clone().normalize());
      this.ray.near = 0.02;
      this.ray.far = this.direction.length() - 0.08;
      if (!this.ray.intersectObjects(this.occluders, false).length) return true;
    }
    return false;
  }
}

const SPAWNS = [
  { x: 0, z: -14 },
  { x: 15, z: -8 },
  { x: -15, z: -8 },
  { x: 15, z: -25 },
  { x: 23, z: -7 },
];
const PATROL = [
  { x: 0, z: -13 },
  { x: 0, z: 5 },
  { x: -15, z: 4 },
  { x: 15, z: -8 },
  { x: 20, z: -25 },
];
const RELOCATION_SPOTS = [
  { x: 0, z: -14 },
  { x: 0, z: 2 },
  { x: -15, z: -5 },
  { x: -15, z: 5 },
  { x: 15, z: -9 },
  { x: 15, z: 4 },
  { x: 20, z: -25 },
  { x: -20, z: -6 },
];

export interface WatcherHooks {
  onFootstep?: (intensity: number, isRunning: boolean, position: THREE.Vector3) => void;
  onStateChange?: (prev: WatcherState, next: WatcherState) => void;
}

export class Watcher {
  readonly model = createWatcherModel();
  readonly position = this.model.root.position;
  readonly graph: NavigationGraph;
  readonly vision: WatcherVision;
  state: WatcherState = 'PATROL';
  active = false;
  timeSinceLastSeen = 0;
  currentSpeed = 0;
  private age = 0;
  private route: NavPoint[] = [];
  private routeTimer = 0;
  private patrolIndex = 0;
  private introduced = false;
  private spawnTimer = 0;
  private stuckTimer = 0;
  private hooks: WatcherHooks;

  constructor(
    readonly colliders: readonly AABBCollider[],
    occluders: THREE.Object3D[],
    private onCapture: () => void,
    private onIntroduction: () => void,
    hooks: WatcherHooks = {},
  ) {
    this.graph = new NavigationGraph(colliders);
    this.vision = new WatcherVision(occluders);
    this.hooks = hooks;
    this.model.root.visible = false;
  }

  private setState(next: WatcherState) {
    if (this.state !== next) {
      const prev = this.state;
      this.state = next;
      this.hooks.onStateChange?.(prev, next);
    }
  }

  reset() {
    this.active = false;
    this.model.root.visible = false;
    this.age = 0;
    this.route = [];
    this.routeTimer = 0;
    this.spawnTimer = 0;
    this.patrolIndex = 0;
    this.introduced = false;
    this.timeSinceLastSeen = 0;
    this.currentSpeed = 0;
    this.stuckTimer = 0;
    this.state = 'PATROL';
    this.model.resetPoseState();
  }

  /** Controlled unseen relocation for supernatural hallway apparitions. */
  relocateUnseen(camera: THREE.PerspectiveCamera, player: NavPoint): boolean {
    if (!this.active || this.state === 'FROZEN' || this.state === 'ATTACK') return false;
    if (this.vision.visible(camera, this.position, true)) return false;

    const candidates = RELOCATION_SPOTS.filter((p) => {
      const dist = Math.hypot(p.x - player.x, p.z - player.z);
      return dist >= 10 && dist <= 22 && clearSegment(p, p, this.colliders);
    });

    // Prefer spots slightly ahead of or behind corridors that remain strictly unseen
    for (const p of candidates) {
      const candidatePos = new THREE.Vector3(p.x, floorHeightAt(p.x, p.z), p.z);
      if (this.vision.visible(camera, candidatePos, true)) continue;
      const path = this.graph.findPath(p, player);
      if (!path.length) continue;

      this.position.copy(candidatePos);
      this.model.root.rotation.y = Math.atan2(p.x - player.x, p.z - player.z);
      this.route = path;
      this.routeTimer = 0.4;
      this.stuckTimer = 0;
      return true;
    }
    return false;
  }

  animateAttack(dt: number, progress: number, playerPos: NavPoint) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const targetYaw = Math.atan2(-dx, -dz);
    this.model.root.rotation.y = dampAngle(this.model.root.rotation.y, targetYaw, 24, dt);
    this.model.animate(dt, 0, false, false, {
      animState: 'ATTACK',
      attackProgress: progress,
      lookYawOffset: 0,
      lookPitchOffset: -0.06,
    });
  }

  /** Intro cinematic pose: breathing hard, shoulders tensing, slow menacing head lift without capture. */
  animateReveal(dt: number, revealProgress: number, playerPos: NavPoint) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const targetYaw = Math.atan2(-dx, -dz);
    this.model.root.rotation.y = dampAngle(this.model.root.rotation.y, targetYaw, 18, dt);
    this.currentSpeed = 0;
    this.model.animate(dt, 0, false, false, {
      animState: 'REVEAL',
      revealProgress,
      lookYawOffset: 0,
      lookPitchOffset: 0.04,
    });
  }

  /** Roar & pre-chase surge during MONSTER_ROAR / CAMERA_TURN_FORWARD: runs toward player with capture disabled. */
  stepFinalIntroLunge(dt: number, playerPos: NavPoint, speed: number, aggression = 1.15) {
    if (!this.active || this.state === 'ATTACK') return;
    this.setState('CHASE');
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    const oldX = this.position.x;
    const oldZ = this.position.z;
    const step = Math.min(Math.max(0, distance - 5.5), speed * dt);
    if (distance > 0 && step > 0) {
      this.position.x += (dx / distance) * step;
      this.position.z += (dz / distance) * step;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        const r = resolveCircleAABB(this.position.x, this.position.z, 0.46, c);
        this.position.x = r.x;
        this.position.z = r.z;
      }
    }
    this.position.y = 0;
    const desiredYaw = Math.atan2(-dx, -dz);
    this.model.root.rotation.y = dampAngle(this.model.root.rotation.y, desiredYaw, 22, dt);
    this.currentSpeed = Math.max(speed, Math.hypot(this.position.x - oldX, this.position.z - oldZ) / Math.max(dt, 0.001));
    this.model.animate(dt, this.currentSpeed, false, false, {
      animState: 'RUN',
      aggression,
      lookYawOffset: 0,
      onFootstep: (intensity, running) => this.hooks.onFootstep?.(intensity, running, this.position),
    });
  }

  /** Final straight corridor: violent relentless chase with same articulated rig, collision and lethal attack. */
  updateFinal(
    dt: number,
    player: NavPoint,
    previous: NavPoint,
    speed: number,
    aggression = 1.0,
    allowCapture = true,
  ) {
    if (!this.active || this.state === 'ATTACK') return;
    this.setState('CHASE');
    const dx = player.x - this.position.x;
    const dz = player.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    const oldX = this.position.x;
    const oldZ = this.position.z;
    const step = Math.min(distance, speed * dt);
    if (distance > 0) {
      this.position.x += (dx / distance) * step;
      this.position.z += (dz / distance) * step;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        const r = resolveCircleAABB(this.position.x, this.position.z, 0.46, c);
        this.position.x = r.x;
        this.position.z = r.z;
      }
    }
    this.position.y = 0;
    const desiredYaw = Math.atan2(-dx, -dz);
    this.model.root.rotation.y = dampAngle(this.model.root.rotation.y, desiredYaw, 22, dt);
    this.currentSpeed = Math.hypot(this.position.x - oldX, this.position.z - oldZ) / Math.max(dt, 0.001);
    const lookYawOffset = Math.atan2(
      Math.sin(desiredYaw - this.model.root.rotation.y),
      Math.cos(desiredYaw - this.model.root.rotation.y),
    );
    this.model.animate(dt, this.currentSpeed, false, false, {
      animState: 'RUN',
      aggression,
      lookYawOffset,
      onFootstep: (intensity, running) => this.hooks.onFootstep?.(intensity, running, this.position),
    });
    if (allowCapture && isInsideLethalReach(this.position, previous, player, this.colliders)) {
      this.setState('ATTACK');
      this.onCapture();
    }
  }

  update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    player: NavPoint,
    keys: number,
    prevPlayer: NavPoint = player,
  ) {
    this.age += dt;
    if (!this.active) {
      if (this.age < 18 || (this.spawnTimer -= dt) > 0) return;
      this.spawnTimer = 1;
      for (const p of SPAWNS) {
        if (Math.hypot(p.x - player.x, p.z - player.z) < 14 || !clearSegment(p, p, this.colliders)) {
          continue;
        }
        this.position.set(p.x, floorHeightAt(p.x, p.z), p.z);
        if (this.vision.visible(camera, this.position, true) || !this.graph.findPath(p, player).length) {
          continue;
        }
        this.model.root.rotation.y = Math.atan2(p.x - player.x, p.z - player.z);
        this.active = true;
        this.model.root.visible = true;
        this.timeSinceLastSeen = 6;
        break;
      }
      if (!this.active) return;
    }

    if (this.state === 'ATTACK') return;

    // Rule: Entering the creature's physical lethal reach triggers an attack from ANY direction,
    // even if observed directly, unless blocked by a wall or closed door.
    if (isInsideLethalReach(this.position, prevPlayer, player, this.colliders)) {
      this.introduced = true;
      this.setState('ATTACK');
      this.currentSpeed = 0;
      this.onCapture();
      return;
    }

    // Outside physical reach, direct observation freezes the monster immediately.
    const toPlayerYaw = Math.atan2(-(player.x - this.position.x), -(player.z - this.position.z));
    const lookYawOffset = Math.atan2(
      Math.sin(toPlayerYaw - this.model.root.rotation.y),
      Math.cos(toPlayerYaw - this.model.root.rotation.y),
    );

    if (this.vision.visible(camera, this.position)) {
      this.setState('FROZEN');
      this.timeSinceLastSeen = 0;
      this.currentSpeed = 0;
      if (!this.introduced) {
        this.introduced = true;
        this.onIntroduction();
      }
      this.model.animate(dt, 0, true, false, {
        animState: 'FROZEN',
        allowFrozenMicroBreath: true,
        lookYawOffset: lookYawOffset * 0.7,
      });
      return;
    }

    const wasFrozen = this.state === 'FROZEN';
    this.timeSinceLastSeen += dt;
    const distance = Math.hypot(this.position.x - player.x, this.position.z - player.z);

    const difficulty = WATCHER_DIFFICULTY[Math.max(0, Math.min(3, keys))];
    const nextState: WatcherState =
      distance <= WATCHER_DANGER_RADIUS || keys >= 2 || (keys > 0 && distance < 14)
        ? 'CHASE'
        : distance < 32 || keys > 0
          ? 'STALK'
          : 'PATROL';
    this.setState(nextState);

    let target: NavPoint = player;
    if (this.state === 'PATROL') {
      target = PATROL[this.patrolIndex];
      if (Math.hypot(target.x - this.position.x, target.z - this.position.z) < 1) {
        this.patrolIndex = (this.patrolIndex + 1) % PATROL.length;
        target = PATROL[this.patrolIndex];
      }
    }

    // Reaction time when vision is broken is reduced to zero: repath immediately
    if (wasFrozen) {
      this.routeTimer = 0;
      this.stuckTimer = 0;
    }

    this.routeTimer -= dt;
    if (this.routeTimer <= 0) {
      this.route = this.graph.findPath(this.position, target);
      const repathInterval =
        distance <= WATCHER_EXTREME_DANGER_RADIUS
          ? 0.08
          : distance <= WATCHER_DANGER_RADIUS
            ? Math.min(difficulty.repath, 0.16)
            : difficulty.repath;
      this.routeTimer = repathInterval;
      if (!this.route.length && this.state === 'PATROL') {
        this.patrolIndex = (this.patrolIndex + 1) % PATROL.length;
      }
    }

    const dangerSurge =
      distance <= WATCHER_EXTREME_DANGER_RADIUS && this.state !== 'PATROL'
        ? 1.18
        : distance <= WATCHER_DANGER_RADIUS && this.state !== 'PATROL'
          ? 1.08
          : 1.0;
    const speed = difficulty.speed * (this.state === 'PATROL' ? 0.72 : dangerSurge);
    let budget = speed * Math.min(dt, 0.05);
    let moved = 0;
    let targetYaw = this.model.root.rotation.y;

    while (budget > 0 && this.route.length) {
      // Corner cutting optimization: if the route's next waypoint has clear line-of-sight, skip ahead smoothly
      if (this.route.length > 1 && clearSegment(this.position, this.route[1], this.colliders)) {
        this.route.shift();
      }
      const p = this.route[0];
      const dx = p.x - this.position.x;
      const dz = p.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.02) {
        this.route.shift();
        continue;
      }
      const step = Math.min(budget, d);
      const next = { x: this.position.x + (dx / d) * step, z: this.position.z + (dz / d) * step };
      if (!clearSegment(this.position, next, this.colliders)) {
        this.route = [];
        this.routeTimer = 0;
        break;
      }
      this.position.set(next.x, floorHeightAt(next.x, next.z), next.z);
      targetYaw = Math.atan2(-dx, -dz);
      moved += step;
      budget -= step;
    }

    // Turn swiftly and aggressively toward target when pursuing, smoothly when patrolling/stalking
    const turnRate =
      distance <= WATCHER_EXTREME_DANGER_RADIUS
        ? 24
        : distance <= WATCHER_DANGER_RADIUS
          ? 20
          : this.state === 'CHASE'
            ? 16
            : 10;
    this.model.root.rotation.y = dampAngle(this.model.root.rotation.y, targetYaw, turnRate, dt);

    const actualSpeed = dt > 1e-5 ? moved / dt : 0;
    this.currentSpeed = actualSpeed;

    if (actualSpeed < 0.08 && this.route.length > 0) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.15) {
        this.route = [];
        this.routeTimer = 0;
        this.stuckTimer = 0;
        if (this.state === 'PATROL') {
          this.patrolIndex = (this.patrolIndex + 1) % PATROL.length;
        }
      }
    } else {
      this.stuckTimer = 0;
    }

    const crouch = this.colliders.some(
      (c) =>
        c.kind === 'door' &&
        Math.hypot(this.position.x - (c.minX + c.maxX) / 2, this.position.z - (c.minZ + c.maxZ) / 2) < 2,
    );

    const animState: WatcherAnimState =
      actualSpeed <= 0.08 ? 'IDLE' : this.state === 'CHASE' ? 'RUN' : 'WALK';

    this.model.animate(dt, actualSpeed, false, crouch, {
      animState,
      lookYawOffset: this.state === 'CHASE' || this.state === 'STALK' ? lookYawOffset : 0,
      onFootstep: (intensity, isRunning) => {
        this.hooks.onFootstep?.(intensity, isRunning, this.position);
      },
    });
  }

  dispose() {
    this.model.dispose();
  }
}
