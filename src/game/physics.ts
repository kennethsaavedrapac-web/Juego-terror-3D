import { getRoomAt } from './mapData';
import type { AABBCollider, PlayerMoveInput, StaminaState } from './types';

export const PLAYER_RADIUS = 0.42;
export const PLAYER_EYE_HEIGHT = 1.68;
export const WALK_SPEED = 3.4; // m/s
export const SPRINT_SPEED = 5.6; // m/s
export const MAX_DELTA_SECONDS = 0.05;
export const STAMINA_DRAIN_PER_SEC = 26;
export const STAMINA_REGEN_PER_SEC = 18;
export const STAMINA_RECOVERY_THRESHOLD = 22;

/**
 * Clamps frame delta time so tab switches or CPU stalls never tunnel the player through walls.
 */
export function clampDelta(rawDt: number): number {
  if (!Number.isFinite(rawDt) || rawDt <= 0) return 0;
  return Math.min(rawDt, MAX_DELTA_SECONDS);
}

/**
 * Updates sprint stamina cleanly with an exhaustion hysteresis threshold.
 */
export function updateStamina(
  state: StaminaState,
  isTryingToSprint: boolean,
  isMoving: boolean,
  dt: number,
): { next: StaminaState; isSprinting: boolean } {
  const safeDt = clampDelta(dt);
  let value = state.value;
  let exhausted = state.exhausted;

  const canSprint = isTryingToSprint && isMoving && !exhausted && value > 0;

  if (canSprint) {
    value = Math.max(0, value - STAMINA_DRAIN_PER_SEC * safeDt);
    if (value <= 0) {
      value = 0;
      exhausted = true;
    }
  } else {
    value = Math.min(100, value + STAMINA_REGEN_PER_SEC * safeDt);
    if (exhausted && value >= STAMINA_RECOVERY_THRESHOLD) {
      exhausted = false;
    }
  }

  return {
    next: { value, exhausted },
    isSprinting: canSprint,
  };
}

/**
 * Computes desired XZ displacement from camera yaw and directional input.
 * Diagonal movement is normalized so diagonal speed equals cardinal speed.
 */
export function computeWishDirection(
  forward: number,
  strafe: number,
  yaw: number,
): { dx: number; dz: number; moving: boolean } {
  if (forward === 0 && strafe === 0) {
    return { dx: 0, dz: 0, moving: false };
  }

  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  let vx = -sinYaw * forward + cosYaw * strafe;
  let vz = -cosYaw * forward - sinYaw * strafe;

  const len = Math.hypot(vx, vz);
  if (len > 1e-6) {
    vx /= len;
    vz /= len;
    return { dx: vx, dz: vz, moving: true };
  }

  return { dx: 0, dz: 0, moving: false };
}

/**
 * Resolves a 2D circle against a single axis-aligned bounding box (AABB),
 * pushing the circle out along the minimum penetration axis so it slides cleanly.
 */
export function resolveCircleAABB(
  cx: number,
  cz: number,
  radius: number,
  box: AABBCollider,
): { x: number; z: number; collided: boolean } {
  if (box.active === false) {
    return { x: cx, z: cz, collided: false };
  }

  const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));

  const distX = cx - closestX;
  const distZ = cz - closestZ;
  const distSq = distX * distX + distZ * distZ;

  if (distSq >= radius * radius) {
    return { x: cx, z: cz, collided: false };
  }

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const overlap = radius - dist;
    return {
      x: cx + (distX / dist) * overlap,
      z: cz + (distZ / dist) * overlap,
      collided: true,
    };
  }

  const penLeft = Math.abs(cx - box.minX);
  const penRight = Math.abs(box.maxX - cx);
  const penTop = Math.abs(cz - box.minZ);
  const penBottom = Math.abs(box.maxZ - cz);

  const minPen = Math.min(penLeft, penRight, penTop, penBottom);

  if (minPen === penLeft) return { x: box.minX - radius, z: cz, collided: true };
  if (minPen === penRight) return { x: box.maxX + radius, z: cz, collided: true };
  if (minPen === penTop) return { x: cx, z: box.minZ - radius, collided: true };
  return { x: cx, z: box.maxZ + radius, collided: true };
}

/**
 * Returns true if closing the door collider will NOT intersect or trap the player.
 */
export function canDoorCloseSafely(
  playerX: number,
  playerZ: number,
  doorCollider: AABBCollider,
  radius: number = PLAYER_RADIUS,
): boolean {
  const safeMargin = radius + 0.12;
  const closestX = Math.max(
    doorCollider.minX,
    Math.min(playerX, doorCollider.maxX),
  );
  const closestZ = Math.max(
    doorCollider.minZ,
    Math.min(playerZ, doorCollider.maxZ),
  );
  const dx = playerX - closestX;
  const dz = playerZ - closestZ;
  return dx * dx + dz * dz >= safeMargin * safeMargin;
}

/**
 * Advances player XZ position with sliding collision resolution across all active colliders.
 * Sub-steps large motions so movement and collisions behave identically regardless of FPS.
 */
export function resolvePlayerMovement(
  posX: number,
  posZ: number,
  stamina: StaminaState,
  input: PlayerMoveInput,
  colliders: readonly AABBCollider[],
  radius: number = PLAYER_RADIUS,
): {
  x: number;
  z: number;
  stamina: StaminaState;
  isSprinting: boolean;
  speed: number;
  movedDistance: number;
} {
  const dt = clampDelta(input.dt);
  const wish = computeWishDirection(input.forward, input.strafe, input.yaw);
  const { next: nextStamina, isSprinting } = updateStamina(
    stamina,
    input.sprintHeld,
    wish.moving,
    dt,
  );

  const targetSpeed = wish.moving ? (isSprinting ? SPRINT_SPEED : WALK_SPEED) : 0;
  const stepX = wish.dx * targetSpeed * dt;
  const stepZ = wish.dz * targetSpeed * dt;

  let x = posX;
  let z = posZ;

  const totalStep = Math.hypot(stepX, stepZ);
  const maxSubStep = radius * 0.45;
  const subSteps = Math.max(1, Math.ceil(totalStep / maxSubStep));

  for (let s = 0; s < subSteps; s++) {
    x += stepX / subSteps;
    z += stepZ / subSteps;

    // 4 relaxation passes resolve acute corners & door jambs cleanly
    for (let pass = 0; pass < 4; pass++) {
      let anyHit = false;
      for (let i = 0; i < colliders.length; i++) {
        const res = resolveCircleAABB(x, z, radius, colliders[i]);
        if (res.collided) {
          x = res.x;
          z = res.z;
          anyHit = true;
        }
      }
      if (!anyHit) break;
    }
  }

  const movedDistance = Math.hypot(x - posX, z - posZ);

  return {
    x,
    z,
    stamina: nextStamina,
    isSprinting,
    speed: dt > 0 ? movedDistance / dt : 0,
    movedDistance,
  };
}

/**
 * Computes subtle vertical & horizontal camera head-bob synced to distance traveled.
 */
export function computeHeadBob(
  distancePhase: number,
  isSprinting: boolean,
): { offsetY: number; offsetX: number } {
  const ampY = isSprinting ? 0.052 : 0.032;
  const ampX = isSprinting ? 0.026 : 0.015;
  return {
    offsetY: Math.sin(distancePhase * 2.2) * ampY,
    offsetX: Math.cos(distancePhase * 1.1) * ampX,
  };
}

/**
 * Returns the logical building room name at XZ coordinates.
 */
export function getZoneName(x: number, z: number): string {
  return getRoomAt(x, z);
}

/**
 * Slab intersection test between a 2D ray segment (x0,z0)->(x1,z1) and an AABB collider.
 */
export function segmentIntersectsAABB(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  box: AABBCollider,
): boolean {
  if (box.active === false) return false;
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-8) {
    if (x0 < box.minX || x0 > box.maxX) return false;
  } else {
    const invD = 1 / dx;
    let t1 = (box.minX - x0) * invD;
    let t2 = (box.maxX - x0) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dz) < 1e-8) {
    if (z0 < box.minZ || z0 > box.maxZ) return false;
  } else {
    const invD = 1 / dz;
    let t1 = (box.minZ - z0) * invD;
    let t2 = (box.maxZ - z0) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return tMax >= 0 && tMin <= 1;
}

/**
 * Checks whether an active wall or closed door blocks line-of-sight between two XZ points.
 */
export function isLineOfSightBlocked(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  colliders: readonly AABBCollider[],
): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.active === false) continue;
    if (c.kind !== 'wall' && c.kind !== 'door' && c.kind !== 'pillar') continue;
    if (segmentIntersectsAABB(x0, z0, x1, z1, c)) {
      return true;
    }
  }
  return false;
}

