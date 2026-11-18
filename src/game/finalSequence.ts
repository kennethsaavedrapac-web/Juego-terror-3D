import { SPRINT_SPEED } from './physics';

export type FinalStage = 'PLAYING' | 'FINAL_DOOR_OPENING' | 'FINAL_ESCAPE' | 'FINAL_FACTORY_REVEAL' | 'TO_BE_CONTINUED' | 'END_CREDITS' | 'END_COMPLETE';
export type FinalChasePhase = 'NONE' | 'PANIC_START' | 'DESPERATE_CHASE' | 'FINAL_METERS';

export interface FinalChaseMetrics {
  phase: FinalChasePhase;
  tunnelProgress: number; // 0 (entry -22) .. 1 (factory -134)
  monsterDistance: number;
  threatProximity: number; // 0 (far >= 22m) .. 1 (lethal <= 2.65m)
}

export const FINAL_ENTRY_Z = -22;
export const FINAL_LENGTH = SPRINT_SPEED * 20;
export const FACTORY_Z = FINAL_ENTRY_Z - FINAL_LENGTH;
export const FINAL_TRIGGER_Z = -37;
export const FINAL_STAGE_B_Z = -62;
export const FINAL_STAGE_C_Z = -102;
export const FINAL_MONSTER_SPEED = 5.95;
export const END_CREDITS_DURATION = 27;
export const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };

/**
 * 3-moment violent chase pacing (INICIO -> MITAD -> FINAL):
 * Surges faster than player sprint (5.6 m/s) while keeping a clean sprint survivable (~4 m margin at finish)
 * and rapidly punishing stops, walking, obstacle bumps, or turning around.
 */
export function computeFinalChaseSpeed(
  phase: FinalChasePhase,
  monsterDistance: number,
  chaseElapsed: number,
): number {
  if (phase === 'PANIC_START') {
    const burst = chaseElapsed < 2.2 ? 0.24 : 0;
    return 6.08 + burst;
  }
  if (phase === 'DESPERATE_CHASE') {
    const catchup = monsterDistance > 10 ? 0.1 : 0;
    return 6.08 + catchup;
  }
  if (phase === 'FINAL_METERS') {
    const lunge = monsterDistance > 7 ? 0.1 : 0;
    return 6.18 + lunge;
  }
  return FINAL_MONSTER_SPEED;
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
  const activeChase = chasing && stage === 'FINAL_ESCAPE';
  const monsterDistance = activeChase ? Math.abs(monsterZ - playerZ) : 40;
  const threatProximity = activeChase
    ? Math.max(0, Math.min(1, 1 - (monsterDistance - 2.65) / 18))
    : 0;
  return {
    phase: getFinalChasePhase(playerZ, chasing, stage),
    tunnelProgress,
    monsterDistance,
    threatProximity,
  };
}

/** Pure, single-transition clock. Paused/death time is never supplied by the engine. */
export class FinalSequence {
  stage: FinalStage = 'PLAYING';
  time = 0;
  checkpoint = false;
  chasing = false;
  enter(stage: FinalStage) { if (this.stage === stage) return false; this.stage = stage; this.time = 0; return true; }
  unlock(hasKeys: boolean) {
    if (!hasKeys || this.stage !== 'PLAYING') return false;
    this.checkpoint = true;
    return this.enter('FINAL_DOOR_OPENING');
  }
  update(dt: number, z: number) {
    this.time += dt;
    if (this.stage === 'FINAL_DOOR_OPENING' && this.time >= 4) this.enter('FINAL_ESCAPE');
    else if (this.stage === 'FINAL_ESCAPE' && z <= FACTORY_Z) this.enter('FINAL_FACTORY_REVEAL');
    else if (this.stage === 'FINAL_FACTORY_REVEAL' && this.time >= 9) this.enter('TO_BE_CONTINUED');
    else if (this.stage === 'TO_BE_CONTINUED' && this.time >= 5) this.enter('END_CREDITS');
    else if (this.stage === 'END_CREDITS' && this.time >= END_CREDITS_DURATION) this.enter('END_COMPLETE');
  }
  reset(preserveCheckpoint = false) { this.stage = 'PLAYING'; this.time = 0; this.chasing = false; this.checkpoint = preserveCheckpoint && this.checkpoint; }
}
