export type GameStatus = 'title' | 'playing' | 'paused' | 'reading' | 'captured';

export interface AABBCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  kind: 'wall' | 'pillar' | 'prop' | 'door';
  active?: boolean; // defaults to true; open doors set active = false
}

export interface RoomDef {
  id: string;
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WallSegmentDef {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  material?: 'plaster' | 'tile' | 'metal';
  height?: number;
  yOffset?: number;
  collides?: boolean;
}

export interface DoorDef {
  id: string;
  label: string;
  /** Center of doorway in world XZ */
  x: number;
  z: number;
  /** 'x' = doorway spans along X (wall runs E-W); 'z' = doorway spans along Z (wall runs N-S) */
  axis: 'x' | 'z';
  width: number;
  /** Hinge placed at negative (-1) or positive (+1) end of doorway axis */
  hingeSide: -1 | 1;
  /** Swing direction in radians (+PI*0.48 or -PI*0.48) */
  openAngle: number;
  material: 'wood' | 'metal';
  locked?: boolean;
  lockedMessage?: string;
}

export interface PropPlacementDef {
  id: string;
  kind:
    | 'reception_desk'
    | 'waiting_bench'
    | 'office_desk'
    | 'meeting_table'
    | 'office_chair'
    | 'filing_cabinet'
    | 'archive_shelf'
    | 'storage_rack'
    | 'crate_stack'
    | 'drum'
    | 'workbench'
    | 'breaker_panel'
    | 'restroom_sink'
    | 'restroom_stall';
  x: number;
  z: number;
  rotationY?: number;
  colliderHalfW?: number;
  colliderHalfD?: number;
}

export interface KeyItemDef {
  id: string;
  name: string;
  roomId: string;
  x: number;
  y: number;
  z: number;
  rotationY?: number;
}

export interface NoteDef {
  id: string;
  title: string;
  roomLabel: string;
  text: string;
  x: number;
  y: number;
  z: number;
  rotationY?: number;
}

export interface ExaminableDef {
  id: string;
  kind: 'phone' | 'clock' | 'photo';
  label: string;
  description: string;
  x: number;
  y: number;
  z: number;
  rotationY?: number;
}

export interface ActiveNoteData {
  id: string;
  title: string;
  roomLabel: string;
  text: string;
}

export interface StaminaState {
  value: number; // 0..100
  exhausted: boolean;
}

export interface PlayerMoveInput {
  forward: number; // -1..1
  strafe: number; // -1..1
  yaw: number; // radians
  sprintHeld: boolean;
  dt: number;
}

export interface InteractPrompt {
  visible: boolean;
  keyLabel: string;
  text: string;
  locked?: boolean;
}

export interface HudNotification {
  id: number;
  text: string;
  tone: 'neutral' | 'alert' | 'key';
}

export interface HudSnapshot {
  stamina: number;
  exhausted: boolean;
  isSprinting: boolean;
  pointerLocked: boolean;
  zoneName: string;
  flashlightOn: boolean;
  keysCollected: number;
  totalKeys: number;
  objectiveText: string;
  exitUnlocked: boolean;
  prompt: InteractPrompt;
  notification: HudNotification | null;
}

export type WatcherAnimState = 'IDLE' | 'WALK' | 'RUN' | 'FROZEN' | 'ATTACK';

export type TensionLevel = 1 | 2 | 3 | 4;

export interface AccessibilitySettings {
  reducedCameraMotion: boolean;
  disableFlashes: boolean;
}

export interface GameEngineCallbacks {
  onCapture: () => void;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onOpenNote: (note: ActiveNoteData) => void;
  onPauseRequest: () => void;
  onWebglError: (message: string) => void;
}

