import type { RoomDef, WallSegmentDef, PropPlacementDef } from './types';

// The lower floor has a separate XZ footprint: no ambiguous stacked navigation.
export function floorHeightAt(x: number, z: number): number {
  if (x >= 13 && x <= 27 && z < -14) return -3 * Math.min(1, (-14 - z) / 8);
  return 0;
}

export const EXPANSION_ROOMS: RoomDef[] = [
  { id: 'admin-pasillo', name: 'Galería administrativa', minX: -17, maxX: -13, minZ: -12, maxZ: 9 },
  { id: 'reuniones', name: 'Sala de reuniones', minX: -27, maxX: -17, minZ: 1, maxZ: 9 },
  { id: 'administracion', name: 'Administración clausurada', minX: -27, maxX: -17, minZ: -12, maxZ: 1 },
  { id: 'clinica-pasillo', name: 'Ala clínica · Observación', minX: 13, maxX: 17, minZ: -14, maxZ: 9 },
  { id: 'pacientes', name: 'Habitaciones de pacientes', minX: 17, maxX: 27, minZ: -14, maxZ: -3 },
  { id: 'generadores', name: 'Taller de generadores', minX: 17, maxX: 27, minZ: -3, maxZ: 9 },
  { id: 'escaleras', name: 'Escalera de servicio · Sótano', minX: 13, maxX: 17, minZ: -22, maxZ: -14 },
  { id: 'sotano', name: 'Sótano · Depósito de aislamiento', minX: 13, maxX: 27, minZ: -32, maxZ: -22 },
];

const wall = (id: string, x1: number, z1: number, x2: number, z2: number, yOffset = 0, height = 3.6): WallSegmentDef =>
  ({ id, x1, z1, x2, z2, yOffset, height, material: id.startsWith('clinic') || id.startsWith('patient') ? 'tile' : 'plaster' });

export const EXPANSION_WALLS: WallSegmentDef[] = [
  // Two openings in each former outside wall make complete alternate loops.
  wall('west-link-n', -13.2, -12.2, -12.8, -9.2),
  wall('west-link-m', -13.2, -6.8, -12.8, 2.8),
  wall('west-link-s', -13.2, 5.2, -12.8, 9.2),
  wall('east-link-n', 12.8, -14.2, 13.2, -12.2),
  wall('east-link-m', 12.8, -9.8, 13.2, 3.8),
  wall('east-link-s', 12.8, 6.2, 13.2, 9.2),
  wall('admin-west', -27.2, -12.2, -26.8, 9.2),
  wall('admin-north', -27, -12.2, -13, -11.8),
  wall('admin-south', -27, 8.8, -13, 9.2),
  wall('admin-gallery-n', -17.2, -12, -16.8, -9.2),
  wall('admin-gallery-m', -17.2, -6.8, -16.8, 2.8),
  wall('admin-gallery-s', -17.2, 5.2, -16.8, 9),
  wall('admin-divide-w', -27, 0.8, -24.2, 1.2),
  wall('admin-divide-e', -21.8, 0.8, -17, 1.2),
  wall('admin-baffle', -23.2, -9, -22.8, -4),
  wall('clinic-east', 26.8, -14.2, 27.2, 9.2),
  wall('clinic-north', 17, -14.2, 27, -13.8),
  wall('clinic-south', 13, 8.8, 27, 9.2),
  wall('clinic-gallery-n', 16.8, -14, 17.2, -9.2),
  wall('clinic-gallery-m', 16.8, -6.8, 17.2, 2.8),
  wall('clinic-gallery-s', 16.8, 5.2, 17.2, 9),
  wall('clinic-divide-w', 17, -3.2, 21.8, -2.8),
  wall('clinic-divide-e', 24.2, -3.2, 27, -2.8),
  wall('patient-screen', 21.8, -14, 22.2, -10),
  // Tall side walls enclose the complete descent, including its low end.
  wall('stairs-west', 12.8, -22, 13.2, -14, -3, 6.6),
  wall('stairs-east', 16.8, -22, 17.2, -14, -3, 6.6),
  { ...wall('stairs-lower-header',13,-22.2,17,-21.8,.6,3), collides:false },
  wall('basement-west', 12.8, -32.2, 13.2, -22, -3),
  wall('basement-east', 26.8, -32.2, 27.2, -21.8, -3),
  wall('basement-north', 13, -32.2, 27, -31.8, -3),
  wall('basement-south', 17, -22.2, 27, -21.8, -3),
  wall('basement-storage', 21.8, -32, 22.2, -27, -3),
  // Sealed mystery chamber is scenery, not a disconnected playable room.
  wall('isolation-front', 24, -28.2, 27, -27.8, -3),
  wall('isolation-side', 23.8, -32, 24.2, -28, -3),
];

export const EXPANSION_PROPS: PropPlacementDef[] = [
  { id: 'admin-table', kind: 'meeting_table', x: -22, z: 5, colliderHalfW: 1.95, colliderHalfD: .7 },
  { id: 'admin-chair', kind: 'office_chair', x: -22, z: 6.2, colliderHalfW: .4, colliderHalfD: .4 },
  { id: 'admin-chair-2', kind: 'office_chair', x: -23.3, z: 3.8, rotationY: Math.PI, colliderHalfW: .4, colliderHalfD: .4 },
  { id: 'admin-chair-3', kind: 'office_chair', x: -20.7, z: 6.2, colliderHalfW: .4, colliderHalfD: .4 },
  { id: 'admin-files', kind: 'archive_shelf', x: -25.6, z: -6, colliderHalfW: .45, colliderHalfD: 1.4 },
  { id: 'admin-key-desk', kind: 'office_desk', x: -20, z: -10, colliderHalfW: 1.05, colliderHalfD: .55 },
  { id: 'generator-rack', kind: 'storage_rack', x: 25.6, z: 5, colliderHalfW: .45, colliderHalfD: 1.4 },
  { id: 'generator-crates', kind: 'crate_stack', x: 20, z: 7, colliderHalfW: .65, colliderHalfD: .65 },
  { id: 'generator-bench', kind: 'workbench', x: 23, z: 7.8, colliderHalfW: 1.1, colliderHalfD: .55 },
  { id: 'basement-key-crates', kind: 'crate_stack', x: 25.5, z: -24, colliderHalfW: .65, colliderHalfD: .65 },
  { id: 'basement-rack', kind: 'storage_rack', x: 14.3, z: -29, colliderHalfW: .45, colliderHalfD: 1.4 },
];

// Extra solid props are shared by rendering and navigation.
export const CLINICAL_SOLIDS = [
  { id: 'bed-a', x: 19.3, z: -12, w: 1.1, d: 2.1, h: .78, kind: 'bed' },
  { id: 'bed-b', x: 25, z: -11, w: 1.1, d: 2.1, h: .78, kind: 'bed' },
  { id: 'trolley', x: 15.8, z: -.8, w: .8, d: 1.7, h: .85, kind: 'bed' },
  { id: 'generator', x: 20, z: .2, w: 1.8, d: 2.5, h: 1.7, kind: 'generator' },
  { id: 'basement-column-a', x: 17, z: -26, w: .8, d: .8, h: 3.6, kind: 'column' },
  { id: 'basement-column-b', x: 20, z: -29, w: .8, d: .8, h: 3.6, kind: 'column' },
];
