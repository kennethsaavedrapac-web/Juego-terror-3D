import { TOTAL_KEYS } from './mapData';

export interface InventorySnapshot {
  collectedKeyIds: string[];
  keysCollected: number;
  totalKeys: number;
  hasAllKeys: boolean;
  exitUnlocked: boolean;
  objectiveText: string;
}

/**
 * Single source of truth for collected keys, mission objective, and exit unlock progression.
 */
export class InventoryManager {
  private collectedKeys = new Set<string>();
  private exitUnlocked = false;
  public readonly totalKeys = TOTAL_KEYS;

  public reset() {
    this.collectedKeys.clear();
    this.exitUnlocked = false;
  }

  public hasKey(keyId: string): boolean {
    return this.collectedKeys.has(keyId);
  }

  public collectKey(keyId: string): {
    added: boolean;
    count: number;
    hasAllKeys: boolean;
  } {
    if (this.collectedKeys.has(keyId)) {
      return {
        added: false,
        count: this.collectedKeys.size,
        hasAllKeys: this.collectedKeys.size >= this.totalKeys,
      };
    }

    this.collectedKeys.add(keyId);
    const count = this.collectedKeys.size;
    return {
      added: true,
      count,
      hasAllKeys: count >= this.totalKeys,
    };
  }

  public canUnlockExit(): boolean {
    return this.collectedKeys.size >= this.totalKeys;
  }

  public unlockExit(): boolean {
    if (!this.canUnlockExit() || this.exitUnlocked) {
      return false;
    }
    this.exitUnlocked = true;
    return true;
  }

  public isExitUnlocked(): boolean {
    return this.exitUnlocked;
  }

  public getObjectiveText(): string {
    if (this.exitUnlocked) {
      return 'Salida desbloqueada.';
    }
    if (this.collectedKeys.size >= this.totalKeys) {
      return 'Regresa a la salida.';
    }
    return 'Encuentra las tres llaves.';
  }

  public getSnapshot(): InventorySnapshot {
    const count = this.collectedKeys.size;
    return {
      collectedKeyIds: Array.from(this.collectedKeys),
      keysCollected: count,
      totalKeys: this.totalKeys,
      hasAllKeys: count >= this.totalKeys,
      exitUnlocked: this.exitUnlocked,
      objectiveText: this.getObjectiveText(),
    };
  }
}
