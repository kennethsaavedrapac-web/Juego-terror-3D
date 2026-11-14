import { floorHeightAt } from './expansion';
import test from 'node:test';
import assert from 'node:assert/strict';
import { InventoryManager } from './inventory';
import {
  BUILDING_DOORS,
  BUILDING_EXAMINABLES,
  BUILDING_KEYS,
  BUILDING_NOTES,
  BUILDING_ROOMS,
  SPAWN_POINT,
  buildStaticColliders,
  getDoorClosedCollider,
  getRoomAt,
} from './mapData';
import {
  PLAYER_RADIUS,
  SPRINT_SPEED,
  WALK_SPEED,
  canDoorCloseSafely,
  clampDelta,
  computeHeadBob,
  computeWishDirection,
  getZoneName,
  isLineOfSightBlocked,
  resolveCircleAABB,
  resolvePlayerMovement,
  updateStamina,
} from './physics';
import type { AABBCollider } from './types';

const sampleWall: AABBCollider = {
  id: 'wall-north',
  minX: -5,
  maxX: 5,
  minZ: -1.2,
  maxZ: -0.8,
  kind: 'wall',
  active: true,
};

test('clampDelta bounds extreme frame spikes', () => {
  assert.equal(clampDelta(0.016), 0.016);
  assert.equal(clampDelta(1.5), 0.05);
  assert.equal(clampDelta(-0.1), 0);
  assert.equal(clampDelta(Number.NaN), 0);
});

test('computeWishDirection normalizes diagonal movement speed', () => {
  const forward = computeWishDirection(1, 0, 0);
  assert.ok(Math.abs(forward.dx) < 1e-6);
  assert.ok(Math.abs(forward.dz + 1) < 1e-6);

  const diag = computeWishDirection(1, 1, 0);
  assert.ok(Math.abs(Math.hypot(diag.dx, diag.dz) - 1) < 1e-6);

  const diagMove = resolvePlayerMovement(
    0,
    14,
    { value: 100, exhausted: false },
    { forward: 1, strafe: 1, yaw: 0, sprintHeld: false, dt: 0.05 },
    [],
  );
  assert.ok(Math.abs(diagMove.speed - WALK_SPEED) < 0.05);
});

test('resolveCircleAABB stops penetration and allows sliding along wall', () => {
  const result = resolveCircleAABB(0, -0.6, PLAYER_RADIUS, sampleWall);
  assert.equal(result.collided, true);
  assert.ok(result.z >= sampleWall.maxZ + PLAYER_RADIUS - 1e-6);
  assert.equal(result.x, 0);
});

test('resolvePlayerMovement slides diagonally along wall without clipping', () => {
  const startX = 0;
  const startZ = -0.35;
  const move = resolvePlayerMovement(
    startX,
    startZ,
    { value: 100, exhausted: false },
    {
      forward: 1,
      strafe: 1,
      yaw: 0,
      sprintHeld: false,
      dt: 0.05,
    },
    [sampleWall],
  );

  assert.ok(move.z >= sampleWall.maxZ + PLAYER_RADIUS - 1e-5);
  assert.ok(move.x > startX);
});

test('closed doors block player while open doors allow passage and block unsafe closing', () => {
  const doorDef = BUILDING_DOORS[0]; // door-recepcion-oficina at (-4.4, 9.0)
  const doorCollider = getDoorClosedCollider(doorDef);

  // Approach closed door from south
  const blocked = resolvePlayerMovement(
    doorDef.x,
    doorDef.z + 0.65,
    { value: 100, exhausted: false },
    { forward: 1, strafe: 0, yaw: 0, sprintHeld: false, dt: 0.05 },
    [doorCollider],
  );
  assert.ok(blocked.z >= doorCollider.maxZ + PLAYER_RADIUS - 1e-5);

  // Open the door and step into the doorway
  doorCollider.active = false;
  const passed = resolvePlayerMovement(
    doorDef.x,
    doorDef.z + 0.65,
    { value: 100, exhausted: false },
    { forward: 1, strafe: 0, yaw: 0, sprintHeld: false, dt: 0.05 },
    [doorCollider],
  );
  assert.ok(passed.z < doorDef.z + 0.65);

  // Standing inside doorway prevents closing door onto player
  assert.equal(canDoorCloseSafely(doorDef.x, doorDef.z, doorCollider), false);
  // Standing well clear allows closing
  assert.equal(canDoorCloseSafely(doorDef.x, doorDef.z + 1.2, doorCollider), true);
});

test('updateStamina drains while sprinting and triggers exhaustion hysteresis', () => {
  let state = { value: 2.0, exhausted: false };
  let res = updateStamina(state, true, true, 0.05);
  res = updateStamina(res.next, true, true, 0.05);
  assert.equal(res.next.value, 0);
  assert.equal(res.next.exhausted, true);

  const s2 = updateStamina(res.next, true, true, 0.05);
  assert.equal(s2.isSprinting, false);
  assert.equal(s2.next.exhausted, true);

  let regenState = s2.next;
  for (let i = 0; i < 30; i++) {
    regenState = updateStamina(regenState, false, false, 0.05).next;
  }
  assert.equal(regenState.exhausted, false);
  assert.ok(regenState.value > 22);
});

test('sprint speed exceeds walk speed', () => {
  const walk = resolvePlayerMovement(
    0,
    14,
    { value: 100, exhausted: false },
    { forward: 1, strafe: 0, yaw: 0, sprintHeld: false, dt: 0.05 },
    [],
  );
  const sprint = resolvePlayerMovement(
    0,
    14,
    { value: 100, exhausted: false },
    { forward: 1, strafe: 0, yaw: 0, sprintHeld: true, dt: 0.05 },
    [],
  );

  assert.ok(Math.abs(walk.speed - WALK_SPEED) < 0.05);
  assert.ok(Math.abs(sprint.speed - SPRINT_SPEED) < 0.05);
});

test('all 16 building rooms are reachable via 2D grid BFS and perimeter is sealed', () => {
  // Build a 0.5m resolution passability grid with static colliders (doors open)
  const colliders = buildStaticColliders();
  const minX = -28;
  const maxX = 28;
  const minZ = -33;
  const maxZ = 19;
  const step = 0.5;
  const cols = Math.round((maxX - minX) / step) + 1;
  const rows = Math.round((maxZ - minZ) / step) + 1;

  const isFree = (wx: number, wz: number): boolean => {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.active === false) continue;
      const closestX = Math.max(c.minX, Math.min(wx, c.maxX));
      const closestZ = Math.max(c.minZ, Math.min(wz, c.maxZ));
      const dSq = (wx - closestX) ** 2 + (wz - closestZ) ** 2;
      if (dSq < (PLAYER_RADIUS * 0.9) ** 2) return false;
    }
    return true;
  };

  const startCol = Math.round((SPAWN_POINT.x - minX) / step);
  const startRow = Math.round((SPAWN_POINT.z - minZ) / step);
  assert.equal(isFree(SPAWN_POINT.x, SPAWN_POINT.z), true, 'Spawn must be free');

  const visited = new Set<string>();
  const queue: [number, number][] = [[startCol, startRow]];
  visited.add(`${startCol},${startRow}`);

  const reachedRooms = new Set<string>();
  let escapedPerimeter = false;

  while (queue.length > 0) {
    const [col, row] = queue.shift()!;
    const wx = minX + col * step;
    const wz = minZ + row * step;

    if (!BUILDING_ROOMS.some(r => wx >= r.minX && wx <= r.maxX && wz >= r.minZ && wz <= r.maxZ)) {
      escapedPerimeter = true;
    }

    const room = getZoneName(wx, wz);
    if (room !== 'Edificio abandonado') {
      reachedRooms.add(room);
    }

    const neighbors: [number, number][] = [
      [col + 1, row],
      [col - 1, row],
      [col, row + 1],
      [col, row - 1],
    ];
    for (const [nc, nr] of neighbors) {
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      const nx = minX + nc * step;
      const nz = minZ + nr * step;
      if (isFree(nx, nz)) {
        visited.add(key);
        queue.push([nc, nr]);
      }
    }
  }

  assert.equal(escapedPerimeter, false, 'Player must not be able to exit building perimeter');
  for (const room of BUILDING_ROOMS) {
    assert.equal(
      reachedRooms.has(room.name),
      true,
      `Room "${room.name}" must be reachable from spawn`,
    );
  }
});

test('computeHeadBob stays bounded and getZoneName maps key coordinates', () => {
  const bob = computeHeadBob(Math.PI / 4, true);
  assert.ok(Math.abs(bob.offsetY) <= 0.06);
  assert.ok(Math.abs(bob.offsetX) <= 0.03);
  assert.equal(getZoneName(0, 15), 'Recepción');
  assert.equal(getZoneName(0, 0), 'Pasillo principal');
  assert.equal(getZoneName(-8, 5), 'Oficina abandonada');
  assert.equal(getZoneName(-8, -5), 'Sala de archivos');
  assert.equal(getZoneName(8, 5), 'Almacén');
  assert.equal(getZoneName(8, -3), 'Habitación de mantenimiento');
  assert.equal(getZoneName(8, -10), 'Baños');
  assert.equal(getZoneName(0, -19), 'Vestíbulo de salida');
});

test('InventoryManager tracks 3 keys, prevents duplicates, updates objective, and gates exit unlock', () => {
  const inv = new InventoryManager();
  assert.equal(inv.getSnapshot().keysCollected, 0);
  assert.equal(inv.getObjectiveText(), 'Encuentra las tres llaves.');
  assert.equal(inv.canUnlockExit(), false);
  assert.equal(inv.unlockExit(), false);

  const first = inv.collectKey('key-recepcion');
  assert.deepEqual(first, { added: true, count: 1, hasAllKeys: false });

  // Duplicate pickup is ignored
  const dup = inv.collectKey('key-recepcion');
  assert.deepEqual(dup, { added: false, count: 1, hasAllKeys: false });

  inv.collectKey('key-oficina');
  const third = inv.collectKey('key-almacen');
  assert.deepEqual(third, { added: true, count: 3, hasAllKeys: true });
  assert.equal(inv.getObjectiveText(), 'Regresa a la salida.');
  assert.equal(inv.canUnlockExit(), true);
  assert.equal(inv.unlockExit(), true);
  assert.equal(inv.isExitUnlocked(), true);
  assert.equal(inv.getObjectiveText(), 'Salida desbloqueada.');

  inv.reset();
  assert.equal(inv.getSnapshot().keysCollected, 0);
  assert.equal(inv.isExitUnlocked(), false);
});

test('walls and closed doors block line-of-sight while open doors allow visibility', () => {
  const doorDef = BUILDING_DOORS[0]; // Reception <-> Oficina at (-4.4, 9.0)
  const doorCollider = getDoorClosedCollider(doorDef);
  const colliders = buildStaticColliders();

  // Line across solid Reception/Oficina wall (x = -6.0, z = 10.5 -> z = 7.5) is blocked by wall
  assert.equal(isLineOfSightBlocked(-6.0, 10.5, -6.0, 7.5, colliders), true);

  // Line through closed doorway is blocked
  assert.equal(
    isLineOfSightBlocked(doorDef.x, doorDef.z + 1.5, doorDef.x, doorDef.z - 1.5, [doorCollider]),
    true,
  );

  // Opening door clears line of sight
  doorCollider.active = false;
  assert.equal(
    isLineOfSightBlocked(doorDef.x, doorDef.z + 1.5, doorDef.x, doorDef.z - 1.5, [doorCollider]),
    false,
  );
});

test('all Phase 3 keys, notes, and examinables sit inside valid named rooms', () => {
  assert.equal(BUILDING_KEYS.length, 3);
  assert.equal(BUILDING_NOTES.length, 3);
  assert.ok(BUILDING_EXAMINABLES.length >= 3);

  for (const item of [...BUILDING_KEYS, ...BUILDING_NOTES, ...BUILDING_EXAMINABLES]) {
    const room = getRoomAt(item.x, item.z);
    assert.notEqual(room, 'Edificio abandonado', `${item.id} must be inside a room`);
    assert.ok(item.y - floorHeightAt(item.x,item.z) > 0.5 && item.y - floorHeightAt(item.x,item.z) < 2.2, `${item.id} must rest on a surface`);
  }
});
