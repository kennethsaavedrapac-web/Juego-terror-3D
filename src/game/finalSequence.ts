import { SPRINT_SPEED } from './physics';

export type FinalStage = 'PLAYING' | 'FINAL_DOOR_OPENING' | 'FINAL_ESCAPE' | 'FINAL_FACTORY_REVEAL' | 'TO_BE_CONTINUED' | 'END_CREDITS' | 'END_COMPLETE';
export const FINAL_ENTRY_Z = -22;
export const FINAL_LENGTH = SPRINT_SPEED * 20;
export const FACTORY_Z = FINAL_ENTRY_Z - FINAL_LENGTH;
export const FINAL_TRIGGER_Z = -37;
export const FINAL_MONSTER_SPEED = 5.95;
export const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };

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
    else if (this.stage === 'END_CREDITS' && this.time >= 27) this.enter('END_COMPLETE');
  }
  reset(preserveCheckpoint = false) { this.stage = 'PLAYING'; this.time = 0; this.chasing = false; this.checkpoint = preserveCheckpoint && this.checkpoint; }
}
