import { SPRINT_SPEED, WALK_SPEED } from './physics';

export type FinalStage =
  | 'PLAYING'
  | 'FINAL_DOOR_OPENING'
  | 'FINAL_ESCAPE'
  | 'FINAL_FACTORY_REVEAL'
  | 'TO_BE_CONTINUED'
  | 'END_CREDITS'
  | 'END_COMPLETE';

export type FinalCinematicState =
  | 'INACTIVE'
  | 'FINAL_DOOR_OPENING'
  | 'FINAL_ESCAPE_APPROACH'
  | 'FINAL_TRIGGERED'
  | 'CAMERA_TURN_BACK'
  | 'MONSTER_REVEAL'
  | 'MONSTER_ROAR'
  | 'CAMERA_TURN_FORWARD'
  | 'FINAL_CHASE'
  | 'FACTORY_REVEAL'
  | 'TO_BE_CONTINUED'
  | 'END_CREDITS'
  | 'END_COMPLETE';

export type FinalChasePhase = 'NONE' | 'PANIC_START' | 'DESPERATE_CHASE' | 'FINAL_METERS';
export type ChaseIntensityLevel = 1 | 2 | 3 | 4;

export interface FinalChaseMetrics {
  phase: FinalChasePhase;
  level: ChaseIntensityLevel;
  tunnelProgress: number; // 0 (entry -22) .. 1 (factory -134)
  escalation: number; // 0 (at trigger -37) .. 1 (at factory -134)
  monsterDistance: number;
  threatProximity: number; // 0 (far >= 22m) .. 1 (lethal <= 2.65m)
}

export interface FinalSpeedContext {
  playerSpeed?: number;
  lookingBack?: boolean;
}

export const FINAL_ENTRY_Z = -22;
export const FINAL_LENGTH = SPRINT_SPEED * 20;
export const FACTORY_Z = FINAL_ENTRY_Z - FINAL_LENGTH;
export const FINAL_TRIGGER_Z = -37;
export const FINAL_STAGE_B_Z = -62;
export const FINAL_STAGE_C_Z = -102;
export const FINAL_LEVEL_2_Z = -60;
export const FINAL_LEVEL_3_Z = -85;
export const FINAL_LEVEL_4_Z = -108;
export const FINAL_MONSTER_SPEED = 5.95;
export const END_CREDITS_DURATION = 27;

export const FINAL_INTRO_DURATIONS = {
  triggered: 0.85,
  turnBack: 0.95,
  reveal: 1.05,
  roar: 0.92,
  turnForward: 0.62,
} as const;

export const smooth = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};

export const easeInOutCubic = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};

export function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Computes camera yaw & pitch from observer toward target in Three.js YXZ FPS space. */
export function computeLookAnglesToTarget(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.max(0.001, Math.hypot(dx, dz));
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, horiz),
  };
}

export function isIntroCinematicState(state: FinalCinematicState): boolean {
  return (
    state === 'FINAL_TRIGGERED' ||
    state === 'CAMERA_TURN_BACK' ||
    state === 'MONSTER_REVEAL' ||
    state === 'MONSTER_ROAR' ||
    state === 'CAMERA_TURN_FORWARD'
  );
}

/**
 * 4-level progressive chase pacing + mistake pressure:
 * Surges faster than sprint (5.6 m/s) while keeping a clean sprint survivable
 * (~3.5-4.5 m margin at finish) and rapidly punishing stops, walking, bumps, or looking back.
 */
export function computeFinalChaseSpeed(
  phase: FinalChasePhase,
  monsterDistance: number,
  chaseElapsed: number,
  context?: FinalSpeedContext,
): number {
  let base: number;
  if (phase === 'PANIC_START') {
    const burst = chaseElapsed < 2.0 ? 0.22 : 0;
    base = 6.0 + burst;
  } else if (phase === 'DESPERATE_CHASE') {
    const catchup = monsterDistance > 10.5 ? 0.08 : 0;
    base = 6.02 + catchup;
  } else if (phase === 'FINAL_METERS') {
    const lunge = monsterDistance > 7.5 ? 0.08 : 0;
    base = 6.14 + lunge;
  } else {
    base = FINAL_MONSTER_SPEED;
  }

  if (context) {
    let mistakePressure = 0;
    if (typeof context.playerSpeed === 'number' && context.playerSpeed < WALK_SPEED + 0.6) {
      mistakePressure += 0.32;
    }
    if (context.lookingBack) {
      mistakePressure += 0.26;
    }
    base += mistakePressure;
  }

  return base;
}

export function getChaseIntensityLevel(z: number): ChaseIntensityLevel {
  if (z <= FINAL_LEVEL_4_Z) return 4;
  if (z <= FINAL_LEVEL_3_Z) return 3;
  if (z <= FINAL_LEVEL_2_Z) return 2;
  return 1;
}

export function getFinalChasePhase(z: number, chasing: boolean, stage: FinalStage): FinalChasePhase {
  if (stage !== 'FINAL_ESCAPE' || !chasing) return 'NONE';
  if (z <= FINAL_STAGE_C_Z) return 'FINAL_METERS';
  if (z <= FINAL_STAGE_B_Z) return 'DESPERATE_CHASE';
  return 'PANIC_START';
}

export function getFinalChaseMetrics(
  playerZ: number,
  monsterZ: number,
  chasing: boolean,
  stage: FinalStage,
): FinalChaseMetrics {
  const tunnelProgress = Math.max(0, Math.min(1, (FINAL_ENTRY_Z - playerZ) / FINAL_LENGTH));
  const escalation = Math.max(
    0,
    Math.min(1, (FINAL_TRIGGER_Z - playerZ) / Math.max(1, FINAL_TRIGGER_Z - FACTORY_Z)),
  );
  const activeChase = chasing && stage === 'FINAL_ESCAPE';
  const monsterDistance = activeChase ? Math.abs(monsterZ - playerZ) : 40;
  const threatProximity = activeChase
    ? Math.max(0, Math.min(1, 1 - (monsterDistance - 2.65) / 18))
    : 0;
  return {
    phase: getFinalChasePhase(playerZ, chasing, stage),
    level: getChaseIntensityLevel(playerZ),
    tunnelProgress,
    escalation,
    monsterDistance,
    threatProximity,
  };
}

/** Pure, single-transition clock & cinematic state machine. Paused/death time is never supplied by the engine. */
export class FinalSequence {
  stage: FinalStage = 'PLAYING';
  cinematicState: FinalCinematicState = 'INACTIVE';
  time = 0;
  cinematicTime = 0;
  checkpoint = false;
  chasing = false;

  enter(stage: FinalStage) {
    if (this.stage === stage) return false;
    this.stage = stage;
    this.time = 0;
    if (stage === 'FINAL_DOOR_OPENING') this.setCinematicState('FINAL_DOOR_OPENING');
    else if (stage === 'FINAL_ESCAPE') this.setCinematicState('FINAL_ESCAPE_APPROACH');
    else if (stage === 'FINAL_FACTORY_REVEAL') {
      this.chasing = false;
      this.setCinematicState('FACTORY_REVEAL');
    } else if (stage === 'TO_BE_CONTINUED') this.setCinematicState('TO_BE_CONTINUED');
    else if (stage === 'END_CREDITS') this.setCinematicState('END_CREDITS');
    else if (stage === 'END_COMPLETE') this.setCinematicState('END_COMPLETE');
    return true;
  }

  private setCinematicState(next: FinalCinematicState) {
    if (this.cinematicState === next) return false;
    this.cinematicState = next;
    this.cinematicTime = 0;
    return true;
  }

  unlock(hasKeys: boolean) {
    if (!hasKeys || this.stage !== 'PLAYING') return false;
    this.checkpoint = true;
    return this.enter('FINAL_DOOR_OPENING');
  }

  /** Triggers the 5-stage monster reveal cinematic once upon crossing FINAL_TRIGGER_Z. */
  triggerIntroCinematic(): boolean {
    if (this.stage !== 'FINAL_ESCAPE' || this.cinematicState !== 'FINAL_ESCAPE_APPROACH') {
      return false;
    }
    return this.setCinematicState('FINAL_TRIGGERED');
  }

  isControlLocked(): boolean {
    return (
      isIntroCinematicState(this.cinematicState) ||
      this.cinematicState === 'FACTORY_REVEAL' ||
      this.cinematicState === 'TO_BE_CONTINUED' ||
      this.cinematicState === 'END_CREDITS' ||
      this.cinematicState === 'END_COMPLETE'
    );
  }

  isCaptureAllowed(): boolean {
    return this.stage === 'FINAL_ESCAPE' && this.cinematicState === 'FINAL_CHASE' && this.chasing;
  }

  update(dt: number, z: number) {
    this.time += dt;
    this.cinematicTime += dt;

    if (this.stage === 'FINAL_DOOR_OPENING' && this.time >= 4) {
      this.enter('FINAL_ESCAPE');
      return;
    }

    if (this.stage === 'FINAL_ESCAPE') {
      if (this.cinematicState === 'FINAL_TRIGGERED' && this.cinematicTime >= FINAL_INTRO_DURATIONS.triggered) {
        this.setCinematicState('CAMERA_TURN_BACK');
      } else if (
        this.cinematicState === 'CAMERA_TURN_BACK' &&
        this.cinematicTime >= FINAL_INTRO_DURATIONS.turnBack
      ) {
        this.setCinematicState('MONSTER_REVEAL');
      } else if (
        this.cinematicState === 'MONSTER_REVEAL' &&
        this.cinematicTime >= FINAL_INTRO_DURATIONS.reveal
      ) {
        this.setCinematicState('MONSTER_ROAR');
      } else if (
        this.cinematicState === 'MONSTER_ROAR' &&
        this.cinematicTime >= FINAL_INTRO_DURATIONS.roar
      ) {
        this.setCinematicState('CAMERA_TURN_FORWARD');
      } else if (
        this.cinematicState === 'CAMERA_TURN_FORWARD' &&
        this.cinematicTime >= FINAL_INTRO_DURATIONS.turnForward
      ) {
        this.chasing = true;
        this.setCinematicState('FINAL_CHASE');
      } else if (
        (this.cinematicState === 'FINAL_CHASE' || this.cinematicState === 'FINAL_ESCAPE_APPROACH') &&
        z <= FACTORY_Z
      ) {
        this.enter('FINAL_FACTORY_REVEAL');
      }
      return;
    }

    if (this.stage === 'FINAL_FACTORY_REVEAL' && this.time >= 9) this.enter('TO_BE_CONTINUED');
    else if (this.stage === 'TO_BE_CONTINUED' && this.time >= 5) this.enter('END_CREDITS');
    else if (this.stage === 'END_CREDITS' && this.time >= END_CREDITS_DURATION) {
      this.enter('END_COMPLETE');
    }
  }

  reset(preserveCheckpoint = false) {
    this.stage = 'PLAYING';
    this.cinematicState = 'INACTIVE';
    this.time = 0;
    this.cinematicTime = 0;
    this.chasing = false;
    this.checkpoint = preserveCheckpoint && this.checkpoint;
  }
}
