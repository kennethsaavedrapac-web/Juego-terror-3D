import * as THREE from 'three';
import type { DoorRuntime } from './doors';
import type { FlickerFixture } from './level';
import { canDoorCloseSafely } from './physics';
import type { SpatialAudioEngine } from './spatialAudio';
import type { AABBCollider, TensionLevel } from './types';
import type { Watcher } from './watcher';

export type SupernaturalEventType =
  | 'door_slam'
  | 'wall_knocks'
  | 'light_flicker'
  | 'whispers'
  | 'sudden_silence'
  | 'unseen_relocation';

export function pickSafeDoorToSlam(
  doors: readonly DoorRuntime[],
  playerPos: { x: number; z: number },
  watcherPos: { x: number; z: number } | null,
): DoorRuntime | null {
  let best: DoorRuntime | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (!d.isOpen || d.def.locked) continue;
    const dist = Math.hypot(d.def.x - playerPos.x, d.def.z - playerPos.z);
    if (dist < 2.2 || dist > 12.5) continue;
    if (!canDoorCloseSafely(playerPos.x, playerPos.z, d.collider, 0.72)) continue;
    if (watcherPos && !canDoorCloseSafely(watcherPos.x, watcherPos.z, d.collider, 0.72)) {
      continue;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

export class SupernaturalEventsSystem {
  private cooldown = 14;
  private lastEvent: SupernaturalEventType | null = null;
  private perEventCooldown: Record<SupernaturalEventType, number> = {
    door_slam: 0,
    wall_knocks: 0,
    light_flicker: 0,
    whispers: 0,
    sudden_silence: 0,
    unseen_relocation: 28,
  };

  private activeLightMalfunction: {
    fixture: FlickerFixture;
    remaining: number;
    duration: number;
  } | null = null;

  reset() {
    this.cooldown = 14;
    this.lastEvent = null;
    this.activeLightMalfunction = null;
    this.perEventCooldown = {
      door_slam: 0,
      wall_knocks: 0,
      light_flicker: 0,
      whispers: 0,
      sudden_silence: 0,
      unseen_relocation: 28,
    };
  }

  getActiveFlickerOverride(): {
    fixture: FlickerFixture;
    multiplier: number;
  } | null {
    if (!this.activeLightMalfunction) return null;
    const { fixture, remaining, duration } = this.activeLightMalfunction;
    const t = duration - remaining;
    // Smooth non-strobing electrical sputter (capped < 4.5 Hz)
    const dip =
      0.22 +
      0.58 *
        (0.5 + 0.5 * Math.sin(t * 7.5 + Math.sin(t * 13.0) * 0.6));
    return { fixture, multiplier: dip };
  }

  update(params: {
    dt: number;
    active: boolean;
    camera: THREE.PerspectiveCamera;
    playerPos: THREE.Vector3;
    playerYaw: number;
    doors: readonly DoorRuntime[];
    flickerFixtures: readonly FlickerFixture[];
    colliders: readonly AABBCollider[];
    watcher: Watcher;
    audio: SpatialAudioEngine;
    tensionLevel: TensionLevel;
    disableFlashes: boolean;
    onTensionSpike: (amount: number) => void;
  }): SupernaturalEventType | null {
    const dt = Math.min(Math.max(params.dt, 0), 0.1);

    if (this.activeLightMalfunction) {
      this.activeLightMalfunction.remaining -= dt;
      if (this.activeLightMalfunction.remaining <= 0) {
        this.activeLightMalfunction = null;
      }
    }

    if (!params.active) return null;

    for (const k of Object.keys(this.perEventCooldown) as SupernaturalEventType[]) {
      if (this.perEventCooldown[k] > 0) {
        this.perEventCooldown[k] = Math.max(0, this.perEventCooldown[k] - dt);
      }
    }

    this.cooldown -= dt;
    if (this.cooldown > 0) return null;

    const candidates: SupernaturalEventType[] = [];
    const safeDoor = pickSafeDoorToSlam(
      params.doors,
      params.playerPos,
      params.watcher.active ? params.watcher.position : null,
    );
    if (safeDoor && this.perEventCooldown.door_slam <= 0) candidates.push('door_slam');
    if (this.perEventCooldown.wall_knocks <= 0) candidates.push('wall_knocks');
    if (params.flickerFixtures.length > 0 && this.perEventCooldown.light_flicker <= 0) {
      candidates.push('light_flicker');
    }
    if (this.perEventCooldown.whispers <= 0) candidates.push('whispers');
    if (this.perEventCooldown.sudden_silence <= 0) candidates.push('sudden_silence');
    if (
      params.watcher.active &&
      params.watcher.state !== 'FROZEN' &&
      params.watcher.state !== 'CHASE' &&
      params.watcher.state !== 'ATTACK' &&
      this.perEventCooldown.unseen_relocation <= 0
    ) {
      candidates.push('unseen_relocation');
    }

    const filtered = candidates.filter((c) => c !== this.lastEvent);
    const pool = filtered.length ? filtered : candidates;
    if (!pool.length) {
      this.cooldown = 6;
      return null;
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    let triggered = false;

    if (chosen === 'door_slam' && safeDoor) {
      safeDoor.isOpen = false;
      safeDoor.targetAngle = 0;
      params.audio.playSpatialDoorSlam(
        { x: safeDoor.def.x, y: 1.3, z: safeDoor.def.z },
        params.playerPos,
        params.colliders,
        safeDoor.def.material,
      );
      params.onTensionSpike(0.18);
      this.perEventCooldown.door_slam = 24;
      triggered = true;
    } else if (chosen === 'wall_knocks') {
      const sideAngle = params.playerYaw + Math.PI * (0.55 + (Math.random() - 0.5) * 0.8);
      const dist = 4.5 + Math.random() * 5.0;
      const knockPos = {
        x: params.playerPos.x - Math.sin(sideAngle) * dist,
        y: params.playerPos.y,
        z: params.playerPos.z - Math.cos(sideAngle) * dist,
      };
      params.audio.playSpatialKnock(
        knockPos,
        params.playerPos,
        params.colliders,
        2 + Math.floor(Math.random() * 3),
      );
      params.onTensionSpike(0.12);
      this.perEventCooldown.wall_knocks = 20;
      triggered = true;
    } else if (chosen === 'light_flicker') {
      let nearest = params.flickerFixtures[0];
      let minDist = Infinity;
      for (const f of params.flickerFixtures) {
        const d = f.light.position.distanceTo(params.playerPos);
        if (d < minDist) {
          minDist = d;
          nearest = f;
        }
      }
      if (nearest) {
        const dur = 3.8 + Math.random() * 1.6;
        if (!params.disableFlashes) {
          this.activeLightMalfunction = { fixture: nearest, remaining: dur, duration: dur };
        }
        params.audio.playElectricalBuzz(
          nearest.light.position,
          params.playerPos,
          params.colliders,
        );
        params.onTensionSpike(0.1);
        this.perEventCooldown.light_flicker = 22;
        triggered = true;
      }
    } else if (chosen === 'whispers') {
      const behindAngle = params.playerYaw + Math.PI + (Math.random() - 0.5) * 1.4;
      const dist = 2.6 + Math.random() * 2.5;
      const whisperPos = {
        x: params.playerPos.x - Math.sin(behindAngle) * dist,
        y: params.playerPos.y,
        z: params.playerPos.z - Math.cos(behindAngle) * dist,
      };
      params.audio.playSpatialWhisper(whisperPos, params.playerPos, params.colliders);
      params.onTensionSpike(0.14);
      this.perEventCooldown.whispers = 26;
      triggered = true;
    } else if (chosen === 'sudden_silence') {
      params.audio.triggerSuddenSilence(3.2 + Math.random() * 1.0);
      params.onTensionSpike(0.11);
      this.perEventCooldown.sudden_silence = 32;
      triggered = true;
    } else if (chosen === 'unseen_relocation') {
      if (params.watcher.relocateUnseen(params.camera, params.playerPos)) {
        params.onTensionSpike(0.16);
        this.perEventCooldown.unseen_relocation = 36;
        triggered = true;
      }
    }

    if (triggered) {
      this.lastEvent = chosen;
      // Shorter interval during higher tension, still well-paced so events breathe
      const baseGap = params.tensionLevel >= 3 ? 13 : 18;
      this.cooldown = baseGap + Math.random() * 9;
      return chosen;
    }

    this.cooldown = 5;
    return null;
  }
}
