import type {
  AABBCollider,
  DoorDef,
  ExaminableDef,
  KeyItemDef,
  NoteDef,
  PropPlacementDef,
  RoomDef,
  WallSegmentDef,
} from './types';

export const WALL_HEIGHT = 3.6;
export const WALL_THICKNESS = 0.4;
export const DOOR_HEIGHT = 2.5;
export const DOOR_WIDTH = 1.6;

export const SPAWN_POINT = { x: 0, z: 15.2, yaw: 0 };

/**
 * Logical room map for navigation, zone identification, and future AI routing.
 * Connected topology:
 *  - Main Corridor (Pasillo Principal) runs Z: -16..9, X: -1.8..1.8
 *  - West Secondary Loop: Recepción <-> Oficina Abandonada <-> Sala de Archivos <-> Pasillo Principal
 *  - East Secondary Loop: Pasillo Principal <-> Almacén <-> Habitación de Mantenimiento <-> Baños <-> Pasillo Principal
 *  - North Exit Hall: Z: -22..-16, X: -6..6
 */
export const BUILDING_ROOMS: readonly RoomDef[] = [
  { id: 'recepcion', name: 'Recepción', minX: -7.0, maxX: 7.0, minZ: 9.0, maxZ: 18.0 },
  { id: 'oficina', name: 'Oficina abandonada', minX: -13.0, maxX: -1.8, minZ: 1.0, maxZ: 9.0 },
  { id: 'archivos', name: 'Sala de archivos', minX: -13.0, maxX: -1.8, minZ: -12.0, maxZ: 1.0 },
  { id: 'almacen', name: 'Almacén', minX: 1.8, maxX: 13.0, minZ: 1.0, maxZ: 9.0 },
  {
    id: 'mantenimiento',
    name: 'Habitación de mantenimiento',
    minX: 1.8,
    maxX: 13.0,
    minZ: -6.0,
    maxZ: 1.0,
  },
  { id: 'banos', name: 'Baños', minX: 1.8, maxX: 13.0, minZ: -14.0, maxZ: -6.0 },
  { id: 'salida', name: 'Vestíbulo de salida', minX: -6.0, maxX: 6.0, minZ: -22.0, maxZ: -16.0 },
  { id: 'pasillo', name: 'Pasillo principal', minX: -1.8, maxX: 1.8, minZ: -16.0, maxZ: 9.0 },
];

export const BUILDING_DOORS: readonly DoorDef[] = [
  // West Secondary Loop doors
  {
    id: 'door-recepcion-oficina',
    label: 'Oficina',
    x: -4.4,
    z: 9.0,
    axis: 'x',
    width: DOOR_WIDTH,
    hingeSide: -1,
    openAngle: -Math.PI * 0.48,
    material: 'wood',
  },
  {
    id: 'door-pasillo-oficina',
    label: 'Oficina',
    x: -1.8,
    z: 5.0,
    axis: 'z',
    width: DOOR_WIDTH,
    hingeSide: -1,
    openAngle: Math.PI * 0.48,
    material: 'wood',
  },
  {
    id: 'door-oficina-archivos',
    label: 'Archivos',
    x: -9.0,
    z: 1.0,
    axis: 'x',
    width: DOOR_WIDTH,
    hingeSide: -1,
    openAngle: -Math.PI * 0.48,
    material: 'metal',
  },
  {
    id: 'door-pasillo-archivos',
    label: 'Archivos',
    x: -1.8,
    z: -9.4,
    axis: 'z',
    width: DOOR_WIDTH,
    hingeSide: -1,
    openAngle: Math.PI * 0.48,
    material: 'metal',
  },

  // East Secondary Loop doors
  {
    id: 'door-pasillo-almacen',
    label: 'Almacén',
    x: 1.8,
    z: 5.0,
    axis: 'z',
    width: DOOR_WIDTH,
    hingeSide: -1,
    openAngle: -Math.PI * 0.48,
    material: 'metal',
  },
  {
    id: 'door-almacen-mantenimiento',
    label: 'Mantenimiento',
    x: 9.2,
    z: 1.0,
    axis: 'x',
    width: DOOR_WIDTH,
    hingeSide: -1,
    openAngle: -Math.PI * 0.48,
    material: 'metal',
  },
  {
    id: 'door-mantenimiento-banos',
    label: 'Baños',
    x: 9.2,
    z: -6.0,
    axis: 'x',
    width: DOOR_WIDTH,
    hingeSide: -1,
    openAngle: -Math.PI * 0.48,
    material: 'wood',
  },
  {
    id: 'door-pasillo-banos',
    label: 'Baños',
    x: 1.8,
    z: -11.0,
    axis: 'z',
    width: DOOR_WIDTH,
    hingeSide: -1,
    openAngle: -Math.PI * 0.48,
    material: 'wood',
  },
];

/**
 * Complete sealed building walls + doorway lintels + interior room partitions.
 * All outer joints overlap by WALL_THICKNESS/2 (0.2m) so there are zero gaps.
 */
export const BUILDING_WALLS: readonly WallSegmentDef[] = [
  // --- RECEPCIÓN (X: -7..7, Z: 9..18) ---
  { id: 'rec-south', x1: -7.2, z1: 17.8, x2: 7.2, z2: 18.2 },
  { id: 'rec-west', x1: -7.2, z1: 8.8, x2: -6.8, z2: 18.0 },
  { id: 'rec-east', x1: 6.8, z1: 8.8, x2: 7.2, z2: 18.0 },
  // North wall of Recepción (archway X: -1.8..1.8, plus door-recepcion-oficina at X: -5.2..-3.6)
  { id: 'rec-north-wl', x1: -7.2, z1: 8.8, x2: -5.2, z2: 9.2 },
  { id: 'rec-north-wr', x1: -3.6, z1: 8.8, x2: -1.8, z2: 9.2 },
  { id: 'rec-north-e', x1: 1.8, z1: 8.8, x2: 7.2, z2: 9.2 },
  // Archway lintel into Pasillo Principal
  {
    id: 'rec-arch-lintel',
    x1: -1.8,
    z1: 8.8,
    x2: 1.8,
    z2: 9.2,
    height: 0.75,
    yOffset: 2.85,
    collides: false,
  },

  // --- PASILLO PRINCIPAL WALLS (X: -1.8 & +1.8, Z: -16..9) ---
  // West corridor wall (door-pasillo-oficina Z: 4.2..5.8, door-pasillo-archivos Z: -10.2..-8.6)
  { id: 'hall-w-s', x1: -2.0, z1: 5.8, x2: -1.6, z2: 9.0 },
  { id: 'hall-w-m', x1: -2.0, z1: -8.6, x2: -1.6, z2: 4.2 },
  { id: 'hall-w-n', x1: -2.0, z1: -16.0, x2: -1.6, z2: -10.2 },

  // East corridor wall (door-pasillo-almacen Z: 4.2..5.8, door-pasillo-banos Z: -11.8..-10.2)
  { id: 'hall-e-s', x1: 1.6, z1: 5.8, x2: 2.0, z2: 9.0 },
  { id: 'hall-e-m', x1: 1.6, z1: -10.2, x2: 2.0, z2: 4.2 },
  { id: 'hall-e-n', x1: 1.6, z1: -16.0, x2: 2.0, z2: -11.8 },

  // --- WEST WING: OFICINA ABANDONADA (X: -13..-1.8, Z: 1..9) & SALA DE ARCHIVOS (X: -13..-1.8, Z: -12..1) ---
  { id: 'west-south', x1: -13.2, z1: 8.8, x2: -6.8, z2: 9.2 },
  { id: 'west-outer', x1: -13.2, z1: -12.2, x2: -12.8, z2: 9.2 },
  { id: 'archivos-north', x1: -13.2, z1: -12.2, x2: -1.6, z2: -11.8 },
  // Shared wall between Oficina and Archivos (door-oficina-archivos X: -9.8..-8.2)
  { id: 'oficina-archivos-l', x1: -13.0, z1: 0.8, x2: -9.8, z2: 1.2 },
  { id: 'oficina-archivos-r', x1: -8.2, z1: 0.8, x2: -1.8, z2: 1.2 },
  // Interior sightline baffle wall inside Sala de Archivos
  { id: 'archivos-baffle', x1: -8.2, z1: -8.0, x2: -7.8, z2: -2.2 },

  // --- EAST WING: ALMACÉN (Z: 1..9), MANTENIMIENTO (Z: -6..1), BAÑOS (Z: -14..-6) ---
  { id: 'east-south', x1: 6.8, z1: 8.8, x2: 13.2, z2: 9.2 },
  { id: 'east-outer', x1: 12.8, z1: -14.2, x2: 13.2, z2: 9.2 },
  { id: 'banos-north', x1: 1.6, z1: -14.2, x2: 13.2, z2: -13.8, material: 'tile' },
  // Shared wall Almacén / Mantenimiento (door-almacen-mantenimiento X: 8.4..10.0)
  { id: 'alm-mant-l', x1: 1.8, z1: 0.8, x2: 8.4, z2: 1.2 },
  { id: 'alm-mant-r', x1: 10.0, z1: 0.8, x2: 13.0, z2: 1.2 },
  // Shared wall Mantenimiento / Baños (door-mantenimiento-banos X: 8.4..10.0)
  { id: 'mant-banos-l', x1: 1.8, z1: -6.2, x2: 8.4, z2: -5.8, material: 'tile' },
  { id: 'mant-banos-r', x1: 10.0, z1: -6.2, x2: 13.0, z2: -5.8, material: 'tile' },
  // Interior partition in Mantenimiento creating an angled corner
  { id: 'mant-partition', x1: 5.8, z1: -6.0, x2: 6.2, z2: -2.2 },
  // Interior tiled modesty wall in Baños separating sink area & stalls
  { id: 'banos-screen', x1: 5.6, z1: -10.5, x2: 6.0, z2: -6.0, material: 'tile' },

  // --- NORTH EXIT HALL (X: -6..6, Z: -22..-16) ---
  { id: 'salida-s-l', x1: -6.2, z1: -16.2, x2: -1.8, z2: -15.8 },
  { id: 'salida-s-r', x1: 1.8, z1: -16.2, x2: 6.2, z2: -15.8 },
  {
    id: 'salida-arch-lintel',
    x1: -1.8,
    z1: -16.2,
    x2: 1.8,
    z2: -15.8,
    height: 0.75,
    yOffset: 2.85,
    collides: false,
  },
  { id: 'salida-w', x1: -6.2, z1: -22.2, x2: -5.8, z2: -15.8 },
  { id: 'salida-e', x1: 5.8, z1: -22.2, x2: 6.2, z2: -15.8 },
  { id: 'salida-n', x1: -6.2, z1: -22.2, x2: 6.2, z2: -21.8 },
];

export const BUILDING_PILLARS: readonly { id: string; x: number; z: number }[] = [
  { id: 'pillar-rec-w', x: -3.2, z: 11.4 },
  { id: 'pillar-rec-e', x: 3.2, z: 11.4 },
  { id: 'pillar-sal-w', x: -3.8, z: -19.0 },
  { id: 'pillar-sal-e', x: 3.8, z: -19.0 },
];

export const BUILDING_PROPS: readonly PropPlacementDef[] = [
  // Recepción
  {
    id: 'prop-rec-desk',
    kind: 'reception_desk',
    x: -4.4,
    z: 14.2,
    colliderHalfW: 0.85,
    colliderHalfD: 1.25,
  },
  {
    id: 'prop-rec-bench',
    kind: 'waiting_bench',
    x: 4.8,
    z: 13.8,
    rotationY: -Math.PI / 2,
    colliderHalfW: 0.45,
    colliderHalfD: 1.15,
  },
  {
    id: 'prop-rec-crates',
    kind: 'crate_stack',
    x: 5.5,
    z: 16.5,
    colliderHalfW: 0.65,
    colliderHalfD: 0.65,
  },

  // Oficina Abandonada
  {
    id: 'prop-ofi-desk',
    kind: 'office_desk',
    x: -8.6,
    z: 5.0,
    colliderHalfW: 1.05,
    colliderHalfD: 0.55,
  },
  {
    id: 'prop-ofi-chair',
    kind: 'office_chair',
    x: -8.8,
    z: 6.1,
    rotationY: 0.45,
    colliderHalfW: 0.35,
    colliderHalfD: 0.35,
  },
  {
    id: 'prop-ofi-cab1',
    kind: 'filing_cabinet',
    x: -12.3,
    z: 6.5,
    rotationY: Math.PI / 2,
    colliderHalfW: 0.4,
    colliderHalfD: 0.5,
  },
  {
    id: 'prop-ofi-cab2',
    kind: 'filing_cabinet',
    x: -12.3,
    z: 5.4,
    rotationY: Math.PI / 2,
    colliderHalfW: 0.4,
    colliderHalfD: 0.5,
  },

  // Sala de Archivos
  {
    id: 'prop-arc-shelf1',
    kind: 'archive_shelf',
    x: -10.8,
    z: -4.8,
    colliderHalfW: 0.45,
    colliderHalfD: 1.4,
  },
  {
    id: 'prop-arc-shelf2',
    kind: 'archive_shelf',
    x: -4.8,
    z: -5.4,
    colliderHalfW: 0.45,
    colliderHalfD: 1.4,
  },
  {
    id: 'prop-arc-cab',
    kind: 'filing_cabinet',
    x: -5.0,
    z: -11.2,
    colliderHalfW: 0.5,
    colliderHalfD: 0.4,
  },
  {
    id: 'prop-arc-crates',
    kind: 'crate_stack',
    x: -11.6,
    z: -10.6,
    colliderHalfW: 0.65,
    colliderHalfD: 0.65,
  },

  // Almacén
  {
    id: 'prop-alm-rack1',
    kind: 'storage_rack',
    x: 5.2,
    z: 7.4,
    rotationY: Math.PI / 2,
    colliderHalfW: 1.4,
    colliderHalfD: 0.45,
  },
  {
    id: 'prop-alm-rack2',
    kind: 'storage_rack',
    x: 11.6,
    z: 5.2,
    colliderHalfW: 0.45,
    colliderHalfD: 1.4,
  },
  {
    id: 'prop-alm-crates',
    kind: 'crate_stack',
    x: 6.2,
    z: 3.4,
    colliderHalfW: 0.65,
    colliderHalfD: 0.65,
  },
  {
    id: 'prop-alm-drum',
    kind: 'drum',
    x: 4.5,
    z: 2.2,
    colliderHalfW: 0.35,
    colliderHalfD: 0.35,
  },

  // Habitación de Mantenimiento
  {
    id: 'prop-mant-bench',
    kind: 'workbench',
    x: 3.8,
    z: -2.6,
    rotationY: Math.PI / 2,
    colliderHalfW: 0.55,
    colliderHalfD: 1.1,
  },
  {
    id: 'prop-mant-breaker',
    kind: 'breaker_panel',
    x: 12.55,
    z: -2.4,
    rotationY: -Math.PI / 2,
    colliderHalfW: 0.25,
    colliderHalfD: 0.7,
  },
  {
    id: 'prop-mant-drum1',
    kind: 'drum',
    x: 7.4,
    z: -4.8,
    colliderHalfW: 0.35,
    colliderHalfD: 0.35,
  },
  {
    id: 'prop-mant-crates',
    kind: 'crate_stack',
    x: 11.5,
    z: -4.8,
    colliderHalfW: 0.65,
    colliderHalfD: 0.65,
  },

  // Baños
  {
    id: 'prop-ban-sink',
    kind: 'restroom_sink',
    x: 3.5,
    z: -13.3,
    colliderHalfW: 1.15,
    colliderHalfD: 0.42,
  },
  {
    id: 'prop-ban-stall1',
    kind: 'restroom_stall',
    x: 11.6,
    z: -8.2,
    rotationY: -Math.PI / 2,
    colliderHalfW: 0.9,
    colliderHalfD: 0.7,
  },
  {
    id: 'prop-ban-stall2',
    kind: 'restroom_stall',
    x: 11.6,
    z: -10.2,
    rotationY: -Math.PI / 2,
    colliderHalfW: 0.9,
    colliderHalfD: 0.7,
  },
  {
    id: 'prop-ban-stall3',
    kind: 'restroom_stall',
    x: 11.6,
    z: -12.2,
    rotationY: -Math.PI / 2,
    colliderHalfW: 0.9,
    colliderHalfD: 0.7,
  },
];

export const TOTAL_KEYS = 3;

export const BUILDING_KEYS: readonly KeyItemDef[] = [
  {
    id: 'key-recepcion',
    name: 'Llave de Recepción',
    roomId: 'recepcion',
    x: -4.16,
    y: 0.96,
    z: 14.95,
    rotationY: 0.4,
  },
  {
    id: 'key-oficina',
    name: 'Llave de Oficina',
    roomId: 'oficina',
    x: -7.96,
    y: 0.795,
    z: 5.18,
    rotationY: -0.6,
  },
  {
    id: 'key-almacen',
    name: 'Llave de Almacén',
    roomId: 'almacen',
    x: 6.08,
    y: 1.2,
    z: 3.3,
    rotationY: 0.25,
  },
];

export const BUILDING_NOTES: readonly NoteDef[] = [
  {
    id: 'note-recepcion',
    title: 'Nota de Recepción',
    roomLabel: 'Recepción',
    text: 'Las puertas fueron cerradas desde adentro. Tres llaves abren la salida principal. La criatura no soporta que la observen. Si escuchas pasos detrás de ti… no dejes de mirarla.',
    x: -4.22,
    y: 0.96,
    z: 14.22,
    rotationY: 0.18,
  },
  {
    id: 'note-oficina',
    title: 'Registro del Vigilante',
    roomLabel: 'Oficina abandonada',
    text: 'Guardé una de las llaves en el almacén antes de que cortaran la electricidad. Algo camina por el pasillo cuando apago la luz, pero se queda inmóvil en cuanto la encaro.',
    x: -9.28,
    y: 0.795,
    z: 4.8,
    rotationY: -0.25,
  },
  {
    id: 'note-almacen',
    title: 'Nota del Almacén',
    roomLabel: 'Almacén',
    text: 'Si logras reunir las tres llaves, corre hacia el vestíbulo norte. No te detengas en las esquinas ciegas y recuerda dónde dejaste cada puerta abierta.',
    x: 5.55,
    y: 1.065,
    z: 7.4,
    rotationY: 0.12,
  },
];

export const BUILDING_EXAMINABLES: readonly ExaminableDef[] = [
  {
    id: 'exam-phone',
    kind: 'phone',
    label: 'Teléfono desconectado',
    description:
      'Un teléfono de escritorio con el cable arrancado. Solo se escucha un zumbido muerto en la línea.',
    x: -4.12,
    y: 0.96,
    z: 13.42,
    rotationY: 0.35,
  },
  {
    id: 'exam-clock',
    kind: 'clock',
    label: 'Reloj detenido',
    description:
      'Un reloj de escritorio detenido exactamente a las 03:17. El cristal está agrietado por dentro.',
    x: -12.3,
    y: 1.56,
    z: 6.5,
    rotationY: Math.PI / 2,
  },
  {
    id: 'exam-photo',
    kind: 'photo',
    label: 'Fotografía deteriorada',
    description:
      'Una vieja fotografía del personal frente al edificio. Alguien rayó todos los rostros con tinta negra.',
    x: 3.8,
    y: 0.88,
    z: -2.6,
    rotationY: Math.PI / 2 - 0.15,
  },
];

export function getRoomAt(x: number, z: number): string {
  for (let i = 0; i < BUILDING_ROOMS.length; i++) {
    const r = BUILDING_ROOMS[i];
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
      return r.name;
    }
  }
  return 'Edificio abandonado';
}

export function getDoorClosedCollider(door: DoorDef): AABBCollider {
  const halfSpan = door.width * 0.5;
  const halfThick = WALL_THICKNESS * 0.5;
  return door.axis === 'x'
    ? {
        id: door.id,
        minX: door.x - halfSpan,
        maxX: door.x + halfSpan,
        minZ: door.z - halfThick,
        maxZ: door.z + halfThick,
        kind: 'door',
        active: true,
      }
    : {
        id: door.id,
        minX: door.x - halfThick,
        maxX: door.x + halfThick,
        minZ: door.z - halfSpan,
        maxZ: door.z + halfSpan,
        kind: 'door',
        active: true,
      };
}

/**
 * Generates static + initial door colliders purely from map data so physics tests
 * and Three.js level builder share one source of truth.
 */
export function buildStaticColliders(): AABBCollider[] {
  const list: AABBCollider[] = [];

  for (const w of BUILDING_WALLS) {
    if (w.collides === false) continue;
    list.push({
      id: w.id,
      minX: Math.min(w.x1, w.x2),
      maxX: Math.max(w.x1, w.x2),
      minZ: Math.min(w.z1, w.z2),
      maxZ: Math.max(w.z1, w.z2),
      kind: 'wall',
      active: true,
    });
  }

  for (const p of BUILDING_PILLARS) {
    list.push({
      id: p.id,
      minX: p.x - 0.36,
      maxX: p.x + 0.36,
      minZ: p.z - 0.36,
      maxZ: p.z + 0.36,
      kind: 'pillar',
      active: true,
    });
  }

  for (const prop of BUILDING_PROPS) {
    if (prop.colliderHalfW && prop.colliderHalfD) {
      list.push({
        id: prop.id,
        minX: prop.x - prop.colliderHalfW,
        maxX: prop.x + prop.colliderHalfW,
        minZ: prop.z - prop.colliderHalfD,
        maxZ: prop.z + prop.colliderHalfD,
        kind: 'prop',
        active: true,
      });
    }
  }

  // Exit double door collider
  list.push({
    id: 'exit-door',
    minX: -1.45,
    maxX: 1.45,
    minZ: -21.95,
    maxZ: -21.5,
    kind: 'door',
    active: true,
  });

  return list;
}
