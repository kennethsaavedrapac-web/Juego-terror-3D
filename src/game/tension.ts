import type { TensionLevel } from './types';
import type { WatcherState } from './watcher';

export interface TensionInput {
  dt: number;
  watcherActive: boolean;
  watcherDistance: number;
  watcherState: WatcherState;
  timeSinceLastSeen: number;
  keysCollected: number;
  isSprinting: boolean;
}

export interface TensionSnapshot {
  intensity: number; // 0..1 smoothed
  targetIntensity: number; // 0..1 instantaneous target
  level: TensionLevel;
  chaseActive: boolean;
}

export function computeTargetTension(
  input: Omit<TensionInput, 'dt'>,
  recentEventBoost: number,
): number {
  let score = 0.08 + Math.min(3, Math.max(0, input.keysCollected)) * 0.09;

  if (input.watcherActive) {
    // Distance proximity contribution (strongest within 18m)
    const prox = Math.max(0, Math.min(1, 1 - input.watcherDistance / 20));
    score += prox * 0.36;

    // Unseen dread builds slowly when monster is lurking out of sight
    const unseenFactor = Math.min(1, Math.max(0, (input.timeSinceLastSeen - 4) / 22));
    score += unseenFactor * 0.16;

    if (input.watcherState === 'STALK') {
      score += 0.14;
    } else if (input.watcherState === 'FROZEN') {
      score += 0.2 + prox * 0.16;
    } else if (input.watcherState === 'CHASE') {
      score = Math.max(score + 0.34, 0.82);
    } else if (input.watcherState === 'ATTACK') {
      score = 1.0;
    }
  }

  if (input.isSprinting) {
    score += 0.04;
  }

  score += recentEventBoost;
  return Math.max(0, Math.min(1, score));
}

export function classifyTensionLevel(
  intensity: number,
  prevLevel: TensionLevel,
  chaseActive: boolean,
): TensionLevel {
  if (chaseActive || intensity >= 0.78) return 4;
  if (prevLevel === 4 && intensity >= 0.71) return 4;

  if (intensity >= 0.52) return 3;
  if (prevLevel === 3 && intensity >= 0.46) return 3;

  if (intensity >= 0.26) return 2;
  if (prevLevel === 2 && intensity >= 0.21) return 2;

  return 1;
}

export class TensionSystem {
  private intensity = 0.08;
  private level: TensionLevel = 1;
  private eventBoost = 0;

  reset() {
    this.intensity = 0.08;
    this.level = 1;
    this.eventBoost = 0;
  }

  addEventSpike(amount: number) {
    this.eventBoost = Math.min(0.45, this.eventBoost + Math.max(0, amount));
  }

  update(input: TensionInput): TensionSnapshot {
    const dt = Math.min(Math.max(input.dt, 0), 0.1);
    this.eventBoost = Math.max(0, this.eventBoost - dt * 0.09);

    const chaseActive =
      input.watcherActive &&
      (input.watcherState === 'CHASE' || input.watcherState === 'ATTACK');
    const targetIntensity = computeTargetTension(input, this.eventBoost);

    // Smooth progressive transition without abrupt spikes (faster upward response on chase)
    const lambda = targetIntensity > this.intensity ? (chaseActive ? 5.2 : 2.6) : 1.4;
    this.intensity += (targetIntensity - this.intensity) * (1 - Math.exp(-lambda * dt));

    this.level = classifyTensionLevel(this.intensity, this.level, chaseActive);

    return {
      intensity: this.intensity,
      targetIntensity,
      level: this.level,
      chaseActive,
    };
  }

  getSnapshot(): TensionSnapshot {
    return {
      intensity: this.intensity,
      targetIntensity: this.intensity,
      level: this.level,
      chaseActive: this.level === 4,
    };
  }
}
