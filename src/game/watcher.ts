import * as THREE from 'three';
import { floorHeightAt } from './expansion';
import { NavigationGraph, clearSegment, type NavPoint } from './navigation';
import { createWatcherModel } from './watcherModel';
import type { AABBCollider, WatcherAnimState } from './types';

export type WatcherState = 'PATROL' | 'STALK' | 'FROZEN' | 'CHASE' | 'ATTACK';
export const WATCHER_DIFFICULTY = [
  { speed: 0.85, repath: 1.5 },
  { speed: 1.2, repath: 1.1 },
  { speed: 1.65, repath: 0.7 },
  { speed: 2.15, repath: 0.45 },
] as const;

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-lambda * dt));
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
      this.routeTimer = 0.6;
      this.stuckTimer = 0;
      return true;
    }
    return false;
  }

  animateAttack(dt: number, progress: number, playerPos: NavPoint) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const targetYaw = Math.atan2(-dx, -dz);
    this.model.root.rotation.y = dampAngle(this.model.root.rotation.y, targetYaw, 18, dt);
    this.model.animate(dt, 0, false, false, {
      animState: 'ATTACK',
      attackProgress: progress,
      lookYawOffset: 0,
      lookPitchOffset: -0.1,
    });
  }

  update(dt: number, camera: THREE.PerspectiveCamera, player: NavPoint, keys: number) {
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
      });
      return;
    }

    this.timeSinceLastSeen += dt;
    const distance = Math.hypot(this.position.x - player.x, this.position.z - player.z);

    // Observation always wins over proximity, including the most aggressive tier.
    if (
      distance < 0.85 &&
      Math.abs(this.position.y - floorHeightAt(player.x, player.z)) < 0.65 &&
      clearSegment(this.position, player, this.colliders, 0)
    ) {
      this.setState('ATTACK');
      this.currentSpeed = 0;
      this.onCapture();
      return;
    }

    const difficulty = WATCHER_DIFFICULTY[Math.max(0, Math.min(3, keys))];
    const nextState: WatcherState =
      keys >= 2 || (keys > 0 && distance < 9)
        ? 'CHASE'
        : distance < 26 || keys > 0
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

    this.routeTimer -= dt;
    if (this.routeTimer <= 0) {
      this.route = this.graph.findPath(this.position, target);
      this.routeTimer = difficulty.repath;
      if (!this.route.length && this.state === 'PATROL') {
        this.patrolIndex = (this.patrolIndex + 1) % PATROL.length;
      }
    }

    const speed = difficulty.speed * (this.state === 'PATROL' ? 0.7 : 1);
    let budget = speed * Math.min(dt, 0.05);
    let moved = 0;
    let targetYaw = this.model.root.rotation.y;

    while (budget > 0 && this.route.length) {
      const p = this.route[0];
      const dx = p.x - this.position.x;
      const dz = p.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.015) {
        this.route.shift();
        continue;
      }
      const step = Math.min(budget, d, 0.12);
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

    // Progressive turning instead of instant rotation snapping
    const turnRate = this.state === 'CHASE' ? 11 : 7.5;
    this.model.root.rotation.y = dampAngle(this.model.root.rotation.y, targetYaw, turnRate, dt);

    const actualSpeed = dt > 1e-5 ? moved / dt : 0;
    this.currentSpeed = actualSpeed;

    if (actualSpeed < 0.08 && this.route.length > 0) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.0) {
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

    // Head tracks subtly toward the player during chase/stalk
    const toPlayerYaw = Math.atan2(-(player.x - this.position.x), -(player.z - this.position.z));
    const lookYawOffset = Math.atan2(
      Math.sin(toPlayerYaw - this.model.root.rotation.y),
      Math.cos(toPlayerYaw - this.model.root.rotation.y),
    );

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
