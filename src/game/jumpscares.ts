import * as THREE from 'three';
import { floorHeightAt } from './expansion';
import { clearSegment } from './navigation';
import { canDoorCloseSafely } from './physics';
import type { DoorRuntime } from './doors';
import type { SpatialAudioEngine } from './spatialAudio';
import type { AABBCollider, GameStatus, TensionLevel } from './types';

export type JumpscareType = 'environmental' | 'silhouette' | 'monster_attack';

export function canTriggerRandomJumpscare(params: {
  status: GameStatus;
  runElapsed: number;
  cooldownRemaining: number;
  tensionLevel: TensionLevel;
  watcherState: string;
}): boolean {
  if (params.status !== 'playing') return false;
  if (params.runElapsed < 25) return false;
  if (params.cooldownRemaining > 0) return false;
  if (params.watcherState === 'ATTACK' || params.watcherState === 'FROZEN') return false;
  return params.tensionLevel >= 2;
}

/** Multi-part 3D shadow apparition (never a flat 2D sprite) that vanishes when unseen. */
function createShadowApparitionMesh(): {
  group: THREE.Group;
  dispose: () => void;
} {
  const group = new THREE.Group();
  group.name = 'shadow-apparition';
  group.visible = false;

  const sphereGeo = new THREE.SphereGeometry(1, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x050608,
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    opacity: 0.88,
  });

  const addPart = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const m = new THREE.Mesh(sphereGeo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    group.add(m);
  };

  // Elongated humanoid silhouette (6 distinct parts)
  addPart(0, 1.55, 0, 0.22, 0.62, 0.14); // torso
  addPart(0, 2.24, -0.05, 0.27, 0.14, 0.16); // shoulders
  addPart(0, 2.58, -0.08, 0.15, 0.23, 0.14); // head
  addPart(-0.26, 1.65, 0, 0.06, 0.58, 0.06); // left arm
  addPart(0.26, 1.65, 0, 0.06, 0.58, 0.06); // right arm
  addPart(0, 0.72, 0.02, 0.16, 0.72, 0.14); // lower shadow legs

  return {
    group,
    dispose() {
      sphereGeo.dispose();
      mat.dispose();
    },
  };
}

export class JumpscareSystem {
  private apparition = createShadowApparitionMesh();
  private cooldown = 32;
  private runElapsed = 0;
  private activeSilhouetteTimer = 0;
  private silhouetteSeen = false;
  private cameraFlinch = 0;

  private readonly ndc = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();

  get group(): THREE.Group {
    return this.apparition.group;
  }

  reset() {
    this.cooldown = 32;
    this.runElapsed = 0;
    this.activeSilhouetteTimer = 0;
    this.silhouetteSeen = false;
    this.cameraFlinch = 0;
    this.apparition.group.visible = false;
  }

  consumeCameraFlinch(): number {
    const v = this.cameraFlinch;
    this.cameraFlinch = 0;
    return v;
  }

  update(params: {
    dt: number;
    status: GameStatus;
    camera: THREE.PerspectiveCamera;
    playerPos: THREE.Vector3;
    playerYaw: number;
    doors: readonly DoorRuntime[];
    colliders: readonly AABBCollider[];
    audio: SpatialAudioEngine;
    tensionLevel: TensionLevel;
    watcherState: string;
    onTensionSpike: (amount: number) => void;
  }): JumpscareType | null {
    const dt = Math.min(Math.max(params.dt, 0), 0.1);

    // Hide immediately if player opens a note or pauses
    if (params.status !== 'playing') {
      if (this.apparition.group.visible) {
        this.apparition.group.visible = false;
        this.activeSilhouetteTimer = 0;
      }
      return null;
    }

    this.runElapsed += dt;
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }

    // Update active silhouette apparition: vanishes if player looks away, gets close, or timer expires
    if (this.apparition.group.visible) {
      this.activeSilhouetteTimer -= dt;
      this.probe.copy(this.apparition.group.position).add(new THREE.Vector3(0, 1.9, 0));
      this.ndc.copy(this.probe).project(params.camera);
      const inView =
        this.ndc.z >= -1 &&
        this.ndc.z <= 1 &&
        Math.abs(this.ndc.x) < 0.92 &&
        Math.abs(this.ndc.y) < 0.95;

      if (inView) {
        this.silhouetteSeen = true;
      }

      const dist = params.playerPos.distanceTo(this.apparition.group.position);
      if (
        this.activeSilhouetteTimer <= 0 ||
        dist < 4.2 ||
        (this.silhouetteSeen && !inView)
      ) {
        this.apparition.group.visible = false;
        this.activeSilhouetteTimer = 0;
      }
      return null;
    }

    if (
      !canTriggerRandomJumpscare({
        status: params.status,
        runElapsed: this.runElapsed,
        cooldownRemaining: this.cooldown,
        tensionLevel: params.tensionLevel,
        watcherState: params.watcherState,
      })
    ) {
      return null;
    }

    // Controlled low probability per second (~2.5% - 4.5% per second when off cooldown)
    const chancePerSec = params.tensionLevel >= 3 ? 0.045 : 0.025;
    if (Math.random() > chancePerSec * dt) return null;

    // Try visual silhouette ahead along an unobstructed corridor lane
    const forwardX = -Math.sin(params.playerYaw);
    const forwardZ = -Math.cos(params.playerYaw);
    const candidateDist = 9.5 + Math.random() * 4.5;
    const candX = params.playerPos.x + forwardX * candidateDist;
    const candZ = params.playerPos.z + forwardZ * candidateDist;

    if (
      Math.random() < 0.45 &&
      clearSegment(
        { x: params.playerPos.x, z: params.playerPos.z },
        { x: candX, z: candZ },
        params.colliders,
        0.35,
      )
    ) {
      const y = floorHeightAt(candX, candZ);
      this.apparition.group.position.set(candX, y, candZ);
      this.apparition.group.rotation.y = Math.atan2(
        candX - params.playerPos.x,
        candZ - params.playerPos.z,
      );
      this.apparition.group.visible = true;
      this.activeSilhouetteTimer = 1.8;
      this.silhouetteSeen = false;
      this.cameraFlinch = 0.24;
      params.audio.playScareSting('silhouette');
      params.onTensionSpike(0.24);
      this.cooldown = 44 + Math.random() * 18;
      return 'silhouette';
    }

    // Otherwise environmental scare: violent slam of a safe nearby door or sharp metallic clatter
    const nearbyDoor = params.doors.find(
      (d) =>
        d.isOpen &&
        !d.def.locked &&
        Math.hypot(d.def.x - params.playerPos.x, d.def.z - params.playerPos.z) > 2.5 &&
        Math.hypot(d.def.x - params.playerPos.x, d.def.z - params.playerPos.z) < 9.5 &&
        canDoorCloseSafely(params.playerPos.x, params.playerPos.z, d.collider, 0.72),
    );

    if (nearbyDoor) {
      nearbyDoor.isOpen = false;
      nearbyDoor.targetAngle = 0;
      params.audio.playSpatialDoorSlam(
        { x: nearbyDoor.def.x, y: 1.3, z: nearbyDoor.def.z },
        params.playerPos,
        params.colliders,
        nearbyDoor.def.material,
      );
    } else {
      const sideYaw = params.playerYaw + (Math.random() > 0.5 ? 1.4 : -1.4);
      const pos = {
        x: params.playerPos.x - Math.sin(sideYaw) * 4.5,
        y: params.playerPos.y,
        z: params.playerPos.z - Math.cos(sideYaw) * 4.5,
      };
      params.audio.playSpatialKnock(pos, params.playerPos, params.colliders, 1);
    }

    params.audio.playScareSting('environmental');
    this.cameraFlinch = 0.3;
    params.onTensionSpike(0.22);
    this.cooldown = 42 + Math.random() * 16;
    return 'environmental';
  }

  dispose() {
    this.apparition.dispose();
  }
}
