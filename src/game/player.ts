import { floorHeightAt } from './expansion';
import * as THREE from 'three';
import {
  PLAYER_EYE_HEIGHT,
  computeHeadBob,
  getZoneName,
  resolvePlayerMovement,
} from './physics';
import type { AABBCollider, StaminaState } from './types';

const MOUSE_SENSITIVITY = 0.0022;
const KEY_TURN_SPEED = 1.85;
const MAX_PITCH = THREE.MathUtils.degToRad(78);
const BASE_FOV = 70;
const SPRINT_FOV = 76;

export class FirstPersonController {
  public readonly position = new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 15.2);
  public yaw = 0;
  public pitch = 0;
  public targetYaw = 0;
  public targetPitch = 0;
  public stamina: StaminaState = { value: 100, exhausted: false };
  public isSprinting = false;
  public pointerLocked = false;

  private keysPressed = new Set<string>();
  private interactQueued = false;
  private flashlightQueued = false;
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private distanceWalked = 0;
  private bobWeight = 0;
  private currentFov = BASE_FOV;
  private active = false;
  private controlsLocked = false;

  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly forwardVec = new THREE.Vector3(0, 0, -1);
  private canvas: HTMLCanvasElement;
  private onPointerLockChange?: (locked: boolean) => void;

  constructor(
    canvas: HTMLCanvasElement,
    onPointerLockChange?: (locked: boolean) => void,
  ) {
    this.canvas = canvas;
    this.onPointerLockChange = onPointerLockChange;
    this.bindEvents();
  }

  public setActive(active: boolean) {
    this.active = active;
    if (!active) {
      this.controlsLocked = false;
      this.clearInputs();
      if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock?.();
      }
    }
  }

  /** Temporarily locks player movement/look/interactions during cinematics without breaking Pointer Lock. */
  public setControlsLocked(locked: boolean) {
    this.controlsLocked = locked;
    this.interactQueued = false;
    this.flashlightQueued = false;
    this.isDraggingLook = false;
  }

  /** Synchronizes internal FPS look angles and camera orientation after a scripted camera sweep. */
  public syncCameraAngles(yaw: number, pitch: number) {
    const clampedPitch = THREE.MathUtils.clamp(pitch, -MAX_PITCH, MAX_PITCH);
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.pitch = clampedPitch;
    this.targetPitch = clampedPitch;
    this.isDraggingLook = false;
  }

  public reset(spawnPos: THREE.Vector3, spawnYaw: number) {
    this.position.set(spawnPos.x, PLAYER_EYE_HEIGHT, spawnPos.z);
    this.yaw = spawnYaw;
    this.targetYaw = spawnYaw;
    this.pitch = 0;
    this.targetPitch = 0;
    this.stamina = { value: 100, exhausted: false };
    this.isSprinting = false;
    this.controlsLocked = false;
    this.distanceWalked = 0;
    this.bobWeight = 0;
    this.currentFov = BASE_FOV;
    this.clearInputs();
  }

  public requestPointerLock() {
    if (!this.active) return;
    try {
      const promise = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {});
      }
    } catch {
      // Ignore pointer lock rejection in restricted contexts
    }
  }

  public setQAForward(enabled: boolean) {
    if (!import.meta.env.DEV) return;
    if(enabled){this.keysPressed.add('KeyW');this.keysPressed.add('ShiftLeft');}
    else {this.keysPressed.delete('KeyW');this.keysPressed.delete('ShiftLeft');}
  }

  public clearInputs() {
    this.keysPressed.clear();
    this.interactQueued = false;
    this.flashlightQueued = false;
    this.isDraggingLook = false;
  }

  public consumeInteractPressed(): boolean {
    if (!this.interactQueued) return false;
    this.interactQueued = false;
    return true;
  }

  public consumeFlashlightPressed(): boolean {
    if (!this.flashlightQueued) return false;
    this.flashlightQueued = false;
    return true;
  }

  public getLookDirectionXZ(out: THREE.Vector3): THREE.Vector3 {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    return out;
  }

  public update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    colliders: readonly AABBCollider[],
    effects?: {
      reducedMotion?: boolean;
      trauma?: number;
      chaseIntensity?: number;
      elapsed?: number;
    },
  ): { zoneName: string; forwardDir: THREE.Vector3 } {
    if (this.controlsLocked) {
      this.isSprinting = false;
      this.interactQueued = false;
      this.flashlightQueued = false;
      return {
        zoneName: getZoneName(this.position.x, this.position.z),
        forwardDir: this.getLookDirectionXZ(this.forwardVec),
      };
    }

    const turnLeft = this.keysPressed.has('ArrowLeft') ? 1 : 0;
    const turnRight = this.keysPressed.has('ArrowRight') ? 1 : 0;
    if (turnLeft !== turnRight) {
      this.targetYaw += (turnLeft - turnRight) * KEY_TURN_SPEED * dt;
    }

    const forward =
      (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp') ? 1 : 0) -
      (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown') ? 1 : 0);
    const strafe =
      (this.keysPressed.has('KeyD') ? 1 : 0) -
      (this.keysPressed.has('KeyA') ? 1 : 0);

    const sprintHeld =
      this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight');

    this.yaw = THREE.MathUtils.damp(this.yaw, this.targetYaw, 26, dt);
    this.pitch = THREE.MathUtils.damp(this.pitch, this.targetPitch, 26, dt);

    const moved = resolvePlayerMovement(
      this.position.x,
      this.position.z,
      this.stamina,
      {
        forward,
        strafe,
        yaw: this.yaw,
        sprintHeld,
        dt,
      },
      colliders,
    );

    this.position.x = moved.x;
    this.position.z = moved.z;
    this.position.y = floorHeightAt(moved.x, moved.z) + PLAYER_EYE_HEIGHT;
    this.stamina = moved.stamina;
    this.isSprinting = moved.isSprinting;

    const isMoving = moved.movedDistance > 1e-4;
    if (isMoving) {
      this.distanceWalked += moved.movedDistance;
    }
    this.bobWeight = THREE.MathUtils.damp(this.bobWeight, isMoving ? 1 : 0, 12, dt);
    const bob = computeHeadBob(this.distanceWalked, this.isSprinting);
    const motionScale = effects?.reducedMotion ? 0.25 : 1.0;

    const chase = effects?.chaseIntensity ?? 0;
    const panicFovBoost = this.isSprinting && !effects?.reducedMotion ? chase * 1.8 : 0;
    const targetFov = (this.isSprinting ? SPRINT_FOV : BASE_FOV) + panicFovBoost;
    this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 10, dt);
    if (Math.abs(camera.fov - this.currentFov) > 0.01) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }

    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    camera.position.set(
      this.position.x + rightX * bob.offsetX * this.bobWeight * motionScale,
      this.position.y + bob.offsetY * this.bobWeight * motionScale,
      this.position.z + rightZ * bob.offsetX * this.bobWeight * motionScale,
    );

    const trauma = effects?.trauma ?? 0;
    const t = effects?.elapsed ?? 0;
    const shakeSq = trauma * trauma * motionScale;
    const chaseSway = chase * 0.011 * motionScale;

    const pitchOffset =
      Math.sin(t * 27.3) * 0.042 * shakeSq + Math.sin(t * 5.8) * chaseSway;
    const yawOffset = Math.cos(t * 23.1) * 0.036 * shakeSq;
    const rollOffset =
      Math.sin(t * 31.7) * 0.048 * shakeSq + Math.cos(t * 4.4) * chaseSway * 0.9;

    this.euler.set(this.pitch + pitchOffset, this.yaw + yawOffset, rollOffset, 'YXZ');
    camera.quaternion.setFromEuler(this.euler);

    return {
      zoneName: getZoneName(this.position.x, this.position.z),
      forwardDir: this.getLookDirectionXZ(this.forwardVec),
    };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'Space'
    ) {
      e.preventDefault();
    }
    if (!this.controlsLocked) {
      if (e.code === 'KeyE' && !e.repeat) {
        this.interactQueued = true;
      }
      if (e.code === 'KeyF' && !e.repeat) {
        this.flashlightQueued = true;
      }
    }
    this.keysPressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysPressed.delete(e.code);
  };

  private onBlur = () => {
    this.clearInputs();
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.clearInputs();
    }
  };

  private onPointerLockChangeHandler = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    this.onPointerLockChange?.(this.pointerLocked);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.active) return;
    if (e.target !== this.canvas) return;
    if (!this.pointerLocked) {
      this.requestPointerLock();
      if (!this.controlsLocked) {
        this.isDraggingLook = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      }
    }
  };

  private onMouseUp = () => {
    this.isDraggingLook = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.active || this.controlsLocked) return;
    let dx = 0;
    let dy = 0;

    if (this.pointerLocked) {
      dx = e.movementX || 0;
      dy = e.movementY || 0;
    } else if (this.isDraggingLook) {
      dx = e.clientX - this.lastPointerX;
      dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    } else {
      return;
    }

    this.targetYaw -= dx * MOUSE_SENSITIVITY;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch - dy * MOUSE_SENSITIVITY,
      -MAX_PITCH,
      MAX_PITCH,
    );
  };

  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeHandler);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  public dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeHandler);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
  }
}
