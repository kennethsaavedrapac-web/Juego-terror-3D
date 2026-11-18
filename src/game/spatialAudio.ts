import * as THREE from 'three';
import {
  getEffectiveVolume,
  getSharedAudioContext,
  playDoorActionOnNode,
  type DoorAction,
} from './audio';
import { segmentIntersectsAABB } from './physics';
import type { AABBCollider, DoorMaterial, TensionLevel } from './types';
import type { WatcherState } from './watcher';

export interface WallAttenuation {
  wallCount: number;
  cutoffHz: number;
  gainMultiplier: number;
}

/** Counts occluding walls and closed doors along the 2D XZ path for lowpass muffling. */
export function computeWallAttenuation(
  listener: { x: number; z: number },
  source: { x: number; z: number },
  colliders: readonly AABBCollider[],
): WallAttenuation {
  let wallCount = 0;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.active === false) continue;
    if (c.kind !== 'wall' && c.kind !== 'door') continue;
    if (segmentIntersectsAABB(listener.x, listener.z, source.x, source.z, c)) {
      wallCount++;
      if (wallCount >= 3) break;
    }
  }
  if (wallCount === 0) return { wallCount: 0, cutoffHz: 18000, gainMultiplier: 1.0 };
  if (wallCount === 1) return { wallCount: 1, cutoffHz: 860, gainMultiplier: 0.58 };
  if (wallCount === 2) return { wallCount: 2, cutoffHz: 420, gainMultiplier: 0.34 };
  return { wallCount, cutoffHz: 240, gainMultiplier: 0.2 };
}

function createNoiseBuffer(ctx: AudioContext, seconds = 2.0): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    // Slight pink/brown warmth so horror loops never sound like harsh digital hiss
    last = (last + 0.08 * white) / 1.08;
    data[i] = last * 2.4;
  }
  return buffer;
}

function createDistortionCurve(amount = 18): Float32Array<ArrayBuffer> {
  const n = 256;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export class SpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private distortionCurve: Float32Array<ArrayBuffer> | null = null;

  // Ambient & tension loops
  private ambientHumOsc: OscillatorNode | null = null;
  private ambientHumGain: GainNode | null = null;
  private tensionDroneOsc: OscillatorNode | null = null;
  private tensionDroneGain: GainNode | null = null;
  private chasePulseOsc: OscillatorNode | null = null;
  private chasePulseGain: GainNode | null = null;

  // Monster continuous positional loops
  private monsterPanner: PannerNode | null = null;
  private monsterFilter: BiquadFilterNode | null = null;
  private monsterBreathSrc: AudioBufferSourceNode | null = null;
  private monsterBreathGain: GainNode | null = null;
  private monsterDroneOsc: OscillatorNode | null = null;
  private monsterDroneGain: GainNode | null = null;

  // Player agitated breath loop (Tension Level 4 / exhausted)
  private playerBreathTimer = 0;
  private distantNoiseTimer = 8;

  // Death Screen dark ambient drone & screamer state
  private deathDroneOsc: OscillatorNode | null = null;
  private deathDroneGain: GainNode | null = null;
  private deathNoiseSrc: AudioBufferSourceNode | null = null;
  private deathNoiseGain: GainNode | null = null;
  private deathSeqTimers: number[] = [];
  private screamerLimiter: DynamicsCompressorNode | null = null;
  private screamerBuffer: AudioBuffer | null = null;
  private screamerLoadPromise: Promise<void> | null = null;
  private activeScreamerNodes: AudioNode[] = [];
  private activeScreamerSources: AudioScheduledSourceNode[] = [];
  private screamerImpactTimer: number | null = null;

  private activeVoices = 0;
  private readonly maxVoices = 14;
  private lastGrowlAt = -10;
  private lastExhaleAt = -10;
  private lastCreakAt = -10;
  private lastStepAt = -10;
  private stepParity = false;
  private silenceTimer = 0;
  private initialized = false;
  private disposed = false;

  private readonly forwardVec = new THREE.Vector3();
  private readonly upVec = new THREE.Vector3();

  /** Safe lazy initialization on first gameplay tick / user interaction. */
  private ensureInitialized(): boolean {
    if (this.disposed) return false;
    if (this.initialized && this.ctx) return true;

    const ctx = getSharedAudioContext();
    if (!ctx) return false;

    try {
      this.ctx = ctx;
      this.noiseBuffer = createNoiseBuffer(ctx, 2.5);
      this.distortionCurve = createDistortionCurve(16);

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = 0.0;
      this.masterGain.connect(ctx.destination);

      this.screamerLimiter = ctx.createDynamicsCompressor();
      this.screamerLimiter.threshold.value = -10;
      this.screamerLimiter.knee.value = 10;
      this.screamerLimiter.ratio.value = 10;
      this.screamerLimiter.attack.value = 0.002;
      this.screamerLimiter.release.value = 0.15;
      this.screamerLimiter.connect(this.masterGain);

      // 1. Ambient building electrical hum (58 Hz + subtle harmonic)
      this.ambientHumOsc = ctx.createOscillator();
      this.ambientHumOsc.type = 'sawtooth';
      this.ambientHumOsc.frequency.value = 58;
      const humFilter = ctx.createBiquadFilter();
      humFilter.type = 'lowpass';
      humFilter.frequency.value = 140;
      this.ambientHumGain = ctx.createGain();
      this.ambientHumGain.gain.value = 0.0;
      this.ambientHumOsc.connect(humFilter);
      humFilter.connect(this.ambientHumGain);
      this.ambientHumGain.connect(this.masterGain);
      this.ambientHumOsc.start();

      // 2. Dynamic tension low drone (42 Hz ominous rumble)
      this.tensionDroneOsc = ctx.createOscillator();
      this.tensionDroneOsc.type = 'triangle';
      this.tensionDroneOsc.frequency.value = 42;
      this.tensionDroneGain = ctx.createGain();
      this.tensionDroneGain.gain.value = 0.0;
      this.tensionDroneOsc.connect(this.tensionDroneGain);
      this.tensionDroneGain.connect(this.masterGain);
      this.tensionDroneOsc.start();

      // 3. Level 4 chase pulse sub-oscillator
      this.chasePulseOsc = ctx.createOscillator();
      this.chasePulseOsc.type = 'sine';
      this.chasePulseOsc.frequency.value = 72;
      this.chasePulseGain = ctx.createGain();
      this.chasePulseGain.gain.value = 0.0;
      this.chasePulseOsc.connect(this.chasePulseGain);
      this.chasePulseGain.connect(this.masterGain);
      this.chasePulseOsc.start();

      // 4. Monster 3D spatialized chain: Source -> Filter (wall occlusion) -> PannerNode (HRTF) -> Master
      this.monsterPanner = this.createPanner(ctx, 1.8, 28, 1.35);
      this.monsterFilter = ctx.createBiquadFilter();
      this.monsterFilter.type = 'lowpass';
      this.monsterFilter.frequency.value = 1600;
      this.monsterFilter.connect(this.monsterPanner);
      this.monsterPanner.connect(this.masterGain);

      // Monster distorted breathing loop
      this.monsterBreathSrc = ctx.createBufferSource();
      this.monsterBreathSrc.buffer = this.noiseBuffer;
      this.monsterBreathSrc.loop = true;
      const breathFormant = ctx.createBiquadFilter();
      breathFormant.type = 'bandpass';
      breathFormant.frequency.value = 380;
      breathFormant.Q.value = 2.6;
      const breathShaper = ctx.createWaveShaper();
      breathShaper.curve = this.distortionCurve;
      this.monsterBreathGain = ctx.createGain();
      this.monsterBreathGain.gain.value = 0.0;
      this.monsterBreathSrc.connect(breathFormant);
      breathFormant.connect(breathShaper);
      breathShaper.connect(this.monsterBreathGain);
      this.monsterBreathGain.connect(this.monsterFilter);
      this.monsterBreathSrc.start();

      // Monster close proximity menacing hum
      this.monsterDroneOsc = ctx.createOscillator();
      this.monsterDroneOsc.type = 'sawtooth';
      this.monsterDroneOsc.frequency.value = 49;
      this.monsterDroneGain = ctx.createGain();
      this.monsterDroneGain.gain.value = 0.0;
      this.monsterDroneOsc.connect(this.monsterDroneGain);
      this.monsterDroneGain.connect(this.monsterFilter);
      this.monsterDroneOsc.start();

      this.initialized = true;
      void this.preloadScreamer();
      return true;
    } catch {
      return false;
    }
  }

  public preloadScreamer(): Promise<void> {
    if (this.screamerBuffer) return Promise.resolve();
    if (this.screamerLoadPromise) return this.screamerLoadPromise;
    if (
      this.disposed ||
      !this.ctx ||
      typeof fetch !== 'function' ||
      typeof document === 'undefined'
    ) {
      return Promise.resolve();
    }

    const ctx = this.ctx;
    const probe = document.createElement('audio');
    const supportsOgg =
      typeof probe.canPlayType === 'function' &&
      probe.canPlayType('audio/ogg; codecs="vorbis"') !== '';
    const url = supportsOgg ? '/audio/monster-screamer.ogg' : '/audio/monster-screamer.wav';

    this.screamerLoadPromise = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        if (this.disposed) return;
        this.screamerBuffer = await ctx.decodeAudioData(arr);
      } catch {
        // Fallback procedural formant screamer remains ready if decode/fetch fails
      } finally {
        this.screamerLoadPromise = null;
      }
    })();

    return this.screamerLoadPromise;
  }

  private createPanner(
    ctx: AudioContext,
    refDistance = 1.5,
    maxDistance = 26,
    rolloffFactor = 1.4,
  ): PannerNode {
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = rolloffFactor;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    return panner;
  }

  private setPannerPosition(panner: PannerNode, x: number, y: number, z: number, now: number) {
    if (panner.positionX) {
      panner.positionX.setValueAtTime(x, now);
      panner.positionY.setValueAtTime(y, now);
      panner.positionZ.setValueAtTime(z, now);
    } else {
      panner.setPosition(x, y, z);
    }
  }

  private updateListener(camera: THREE.PerspectiveCamera, now: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const listener = ctx.listener;
    this.forwardVec.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    this.upVec.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    if (listener.positionX) {
      listener.positionX.setValueAtTime(camera.position.x, now);
      listener.positionY.setValueAtTime(camera.position.y, now);
      listener.positionZ.setValueAtTime(camera.position.z, now);
      listener.forwardX.setValueAtTime(this.forwardVec.x, now);
      listener.forwardY.setValueAtTime(this.forwardVec.y, now);
      listener.forwardZ.setValueAtTime(this.forwardVec.z, now);
      listener.upX.setValueAtTime(this.upVec.x, now);
      listener.upY.setValueAtTime(this.upVec.y, now);
      listener.upZ.setValueAtTime(this.upVec.z, now);
    } else if (typeof listener.setPosition === 'function') {
      listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
      listener.setOrientation(
        this.forwardVec.x,
        this.forwardVec.y,
        this.forwardVec.z,
        this.upVec.x,
        this.upVec.y,
        this.upVec.z,
      );
    }
  }

  private canSpawnVoice(): boolean {
    return this.activeVoices < this.maxVoices;
  }

  private trackVoice(durationSec: number) {
    this.activeVoices++;
    window.setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    }, Math.ceil(durationSec * 1000) + 40);
  }

  public setMuted(muted: boolean) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(muted ? 0.0 : 0.9 * getEffectiveVolume(), now, 0.08);
  }

  public triggerSuddenSilence(durationSec: number) {
    this.silenceTimer = Math.max(this.silenceTimer, durationSec);
  }

  public update(params: {
    dt: number;
    elapsed: number;
    active: boolean;
    camera: THREE.PerspectiveCamera;
    watcherActive: boolean;
    watcherPos: THREE.Vector3;
    watcherState: WatcherState;
    tensionLevel: TensionLevel;
    tensionIntensity: number;
    exhausted: boolean;
    colliders: readonly AABBCollider[];
    finalChaseMode?: boolean;
    chaseProximity?: number;
  }) {
    if (!params.active) {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.08);
      }
      return;
    }

    if (!this.ensureInitialized() || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this.masterGain.gain.setTargetAtTime(0.92 * getEffectiveVolume(), now, 0.08);
    this.updateListener(params.camera, now);

    if (this.silenceTimer > 0) {
      this.silenceTimer = Math.max(0, this.silenceTimer - params.dt);
    }
    const silenceMult = this.silenceTimer > 0 ? 0.04 : 1.0;

    if (params.finalChaseMode) {
      // Final tunnel emergency pursuit: suppress slow ambient building drone, focus on monster & player panic
      this.ambientHumGain?.gain.setTargetAtTime(0.0, now, 0.15);
      this.tensionDroneGain?.gain.setTargetAtTime(0.0, now, 0.15);
      this.chasePulseGain?.gain.setTargetAtTime(0.0, now, 0.15);

      const prox = params.chaseProximity ?? params.tensionIntensity;
      if (params.watcherActive && (params.tensionIntensity > 0.45 || prox > 0.25)) {
        this.playerBreathTimer -= params.dt;
        if (this.playerBreathTimer <= 0) {
          this.playerBreathTimer = THREE.MathUtils.lerp(0.95, 0.44, Math.max(prox, params.tensionIntensity));
          this.playPlayerBreath(0.04 + prox * 0.055);
        }
      }
    } else {
      // 1. Dynamic Tension Layers (Levels 1..4)
      const humTarget = (0.028 + params.tensionIntensity * 0.022) * silenceMult;
      this.ambientHumGain?.gain.setTargetAtTime(humTarget, now, 0.25);

      const droneTarget =
        params.tensionLevel >= 2
          ? (0.015 + Math.max(0, params.tensionIntensity - 0.2) * 0.075) * silenceMult
          : 0.0;
      this.tensionDroneGain?.gain.setTargetAtTime(droneTarget, now, 0.35);

      const chasePulse =
        params.tensionLevel === 4
          ? (0.03 + 0.028 * (0.5 + 0.5 * Math.sin(params.elapsed * 5.2))) * silenceMult
          : 0.0;
      this.chasePulseGain?.gain.setTargetAtTime(chasePulse, now, 0.12);

      // 2. Level 2+ distant metallic creaks/pipes
      if (params.tensionLevel >= 2 && this.silenceTimer <= 0) {
        this.distantNoiseTimer -= params.dt;
        if (this.distantNoiseTimer <= 0) {
          this.distantNoiseTimer = params.tensionLevel >= 3 ? 7 + Math.random() * 6 : 11 + Math.random() * 8;
          const angle = Math.random() * Math.PI * 2;
          const dist = 9 + Math.random() * 7;
          const pos = {
            x: params.camera.position.x + Math.cos(angle) * dist,
            y: params.camera.position.y,
            z: params.camera.position.z + Math.sin(angle) * dist,
          };
          this.playDistantPipeGroan(pos, params.camera.position, params.colliders);
        }
      }

      // 3. Level 4 or exhausted player agitated breathing
      if ((params.tensionLevel === 4 || params.exhausted) && this.silenceTimer <= 0) {
        this.playerBreathTimer -= params.dt;
        if (this.playerBreathTimer <= 0) {
          this.playerBreathTimer = params.tensionLevel === 4 ? 0.85 : 1.15;
          this.playPlayerBreath(params.tensionLevel === 4 ? 0.055 : 0.038);
        }
      }
    }

    // 4. Monster 3D spatial breathing & proximity drone
    if (this.monsterPanner && this.monsterFilter && this.monsterBreathGain && this.monsterDroneGain) {
      if (!params.watcherActive) {
        this.monsterBreathGain.gain.setTargetAtTime(0, now, 0.15);
        this.monsterDroneGain.gain.setTargetAtTime(0, now, 0.15);
      } else {
        this.setPannerPosition(
          this.monsterPanner,
          params.watcherPos.x,
          params.watcherPos.y + 2.35,
          params.watcherPos.z,
          now,
        );
        const att = computeWallAttenuation(
          { x: params.camera.position.x, z: params.camera.position.z },
          { x: params.watcherPos.x, z: params.watcherPos.z },
          params.colliders,
        );
        this.monsterFilter.frequency.setTargetAtTime(att.cutoffHz, now, 0.08);

        const isFrozen = params.watcherState === 'FROZEN';
        const isChase = params.watcherState === 'CHASE';
        const breathSpeed = params.finalChaseMode ? 7.4 : isChase ? 4.6 : isFrozen ? 1.3 : 2.2;
        const breathCycle = 0.45 + 0.55 * Math.sin(params.elapsed * breathSpeed);
        const breathBase = isFrozen ? 0.028 : params.finalChaseMode ? 0.24 : isChase ? 0.15 : 0.075;
        this.monsterBreathGain.gain.setTargetAtTime(
          breathBase * breathCycle * att.gainMultiplier * silenceMult,
          now,
          0.08,
        );

        const dist = params.camera.position.distanceTo(params.watcherPos);
        const maxDroneDist = params.finalChaseMode ? 22 : 16;
        const proxGain = dist < maxDroneDist ? (1 - dist / maxDroneDist) * (params.finalChaseMode ? 0.14 : 0.085) : 0;
        this.monsterDroneGain.gain.setTargetAtTime(
          proxGain * att.gainMultiplier * silenceMult,
          now,
          0.12,
        );
      }
    }
  }

  private playSpatialOneShot(
    pos: { x: number; y: number; z: number },
    listenerPos: { x: number; z: number },
    colliders: readonly AABBCollider[],
    durationSec: number,
    builder: (ctx: AudioContext, dest: AudioNode, gainScale: number, now: number) => void,
    refDist = 1.6,
    maxDist = 26,
  ) {
    if (!this.ensureInitialized() || !this.ctx || !this.masterGain) return;
    if (!this.canSpawnVoice()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const att = computeWallAttenuation(listenerPos, pos, colliders);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(att.cutoffHz, now);

    const panner = this.createPanner(ctx, refDist, maxDist, 1.35);
    this.setPannerPosition(panner, pos.x, pos.y, pos.z, now);

    filter.connect(panner);
    panner.connect(this.masterGain);

    this.trackVoice(durationSec);
    builder(ctx, filter, att.gainMultiplier, now);
  }

  public playMonsterFootstep(
    pos: THREE.Vector3,
    listenerPos: THREE.Vector3,
    colliders: readonly AABBCollider[],
    intensity: number,
    isRunning: boolean,
    tunnelEcho = false,
  ) {
    if (!this.ensureInitialized() || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastStepAt < (isRunning ? 0.15 : 0.28)) return;
    this.lastStepAt = t;
    this.stepParity = !this.stepParity;

    const dur = isRunning ? 0.24 : 0.21;
    const refDist = isRunning ? (tunnelEcho ? 4.4 : 2.6) : 1.8;
    const maxDist = isRunning ? (tunnelEcho ? 46 : 32) : 26;
    const pitchShift = this.stepParity ? 1.0 : 0.91;

    this.playSpatialOneShot(
      { x: pos.x, y: pos.y + 0.12, z: pos.z },
      listenerPos,
      colliders,
      dur + (tunnelEcho ? 0.09 : 0),
      (ctx, dest, gainScale, now) => {
        // 1. Heavy sub-bass monster weight impact
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        subOsc.type = isRunning ? 'sine' : 'triangle';
        const baseFreq = (isRunning ? 104 : 68) * pitchShift + Math.random() * 10;
        subOsc.frequency.setValueAtTime(baseFreq, now);
        subOsc.frequency.exponentialRampToValueAtTime(24, now + dur * 0.85);

        const heavyBoost = tunnelEcho ? 1.55 : 1.0;
        const vol = (isRunning ? 0.34 : 0.16) * heavyBoost * intensity * gainScale;
        subGain.gain.setValueAtTime(0.001, now);
        subGain.gain.linearRampToValueAtTime(vol, now + 0.01);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        subOsc.connect(subGain);
        subGain.connect(dest);
        subOsc.start(now);
        subOsc.stop(now + dur + 0.02);

        // 2. Concrete / grating crunch + metallic ring on heavy running steps
        if (isRunning) {
          const clangOsc = ctx.createOscillator();
          const clangBp = ctx.createBiquadFilter();
          const clangGain = ctx.createGain();
          clangOsc.type = 'triangle';
          clangOsc.frequency.setValueAtTime((225 + Math.random() * 45) * pitchShift, now);
          clangOsc.frequency.exponentialRampToValueAtTime(82, now + 0.13);
          clangBp.type = 'bandpass';
          clangBp.frequency.value = 360;
          clangBp.Q.value = 2.2;
          clangGain.gain.setValueAtTime(0.001, now);
          clangGain.gain.linearRampToValueAtTime(vol * 0.38, now + 0.008);
          clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
          clangOsc.connect(clangBp);
          clangBp.connect(clangGain);
          clangGain.connect(dest);
          clangOsc.start(now);
          clangOsc.stop(now + 0.15);
        }

        // 3. Floor scrape / grit transient
        if (this.noiseBuffer) {
          const noise = ctx.createBufferSource();
          noise.buffer = this.noiseBuffer;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = (isRunning ? 740 : 620) * pitchShift;
          bp.Q.value = 1.4;
          const ng = ctx.createGain();
          ng.gain.setValueAtTime(vol * (isRunning ? 0.45 : 0.35), now);
          ng.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.72);
          noise.connect(bp);
          bp.connect(ng);
          ng.connect(dest);
          noise.start(now);
          noise.stop(now + dur);

          // 4. Industrial tunnel slapback echo on heavy chase strides
          if (tunnelEcho) {
            const echoTime = now + 0.085;
            const echoNoise = ctx.createBufferSource();
            echoNoise.buffer = this.noiseBuffer;
            const echoLp = ctx.createBiquadFilter();
            echoLp.type = 'lowpass';
            echoLp.frequency.value = 520;
            const echoGain = ctx.createGain();
            echoGain.gain.setValueAtTime(0.001, echoTime);
            echoGain.gain.linearRampToValueAtTime(vol * 0.28, echoTime + 0.01);
            echoGain.gain.exponentialRampToValueAtTime(0.001, echoTime + 0.16);
            echoNoise.connect(echoLp);
            echoLp.connect(echoGain);
            echoGain.connect(dest);
            echoNoise.start(echoTime);
            echoNoise.stop(echoTime + 0.17);
          }
        }
      },
      refDist,
      maxDist,
    );
  }

  public playMonsterGrowl(
    pos: THREE.Vector3,
    listenerPos: THREE.Vector3,
    colliders: readonly AABBCollider[],
    aggressive = false,
    force = false,
  ) {
    if (!this.ensureInitialized() || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (!force && t - this.lastGrowlAt < 5.0) return;
    this.lastGrowlAt = t;

    const dur = aggressive ? 1.05 : 1.25;
    this.playSpatialOneShot(
      { x: pos.x, y: pos.y + 2.3, z: pos.z },
      listenerPos,
      colliders,
      dur,
      (ctx, dest, gainScale, now) => {
        const osc = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        const bp = ctx.createBiquadFilter();
        const shaper = ctx.createWaveShaper();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(aggressive ? 84 : 58, now);
        osc.frequency.linearRampToValueAtTime(aggressive ? 48 : 42, now + dur);

        mod.type = 'sine';
        mod.frequency.value = aggressive ? 32 : 16;
        modGain.gain.value = aggressive ? 18 : 14;
        mod.connect(modGain);
        modGain.connect(osc.frequency);

        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(aggressive ? 390 : 310, now);
        bp.frequency.linearRampToValueAtTime(190, now + dur);
        bp.Q.value = 2.2;

        shaper.curve = this.distortionCurve;
        const vol = (aggressive ? 0.34 : 0.15) * gainScale;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(bp);
        bp.connect(shaper);
        shaper.connect(gain);
        gain.connect(dest);
        osc.start(now);
        mod.start(now);
        osc.stop(now + dur + 0.02);
        mod.stop(now + dur + 0.02);
      },
      aggressive ? 3.2 : 2.0,
      aggressive ? 42 : 28,
    );
  }

  /** Aggressive running exhalation / guttural rasp between monster roars. */
  public playMonsterExhale(
    pos: THREE.Vector3,
    listenerPos: THREE.Vector3,
    colliders: readonly AABBCollider[],
  ) {
    if (!this.ensureInitialized() || !this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    if (t - this.lastExhaleAt < 1.6) return;
    this.lastExhaleAt = t;

    const dur = 0.52;
    this.playSpatialOneShot(
      { x: pos.x, y: pos.y + 2.2, z: pos.z },
      listenerPos,
      colliders,
      dur,
      (ctx, dest, gainScale, now) => {
        if (!this.noiseBuffer) return;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(540 + Math.random() * 140, now);
        bp.frequency.exponentialRampToValueAtTime(240, now + dur);
        bp.Q.value = 2.6;

        const shaper = ctx.createWaveShaper();
        shaper.curve = this.distortionCurve;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.26 * gainScale, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        src.connect(bp);
        bp.connect(shaper);
        shaper.connect(gain);
        gain.connect(dest);
        src.start(now);
        src.stop(now + dur + 0.02);
      },
      3.0,
      36,
    );
  }

  public playLimbCreak(
    pos: THREE.Vector3,
    listenerPos: THREE.Vector3,
    colliders: readonly AABBCollider[],
  ) {
    if (!this.ensureInitialized() || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastCreakAt < 2.0) return;
    this.lastCreakAt = t;

    const dur = 0.26;
    this.playSpatialOneShot(
      { x: pos.x, y: pos.y + 1.8, z: pos.z },
      listenerPos,
      colliders,
      dur,
      (ctx, dest, gainScale, now) => {
        const osc = ctx.createOscillator();
        const bp = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220 + Math.random() * 80, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + dur);
        bp.type = 'bandpass';
        bp.frequency.value = 640;
        bp.Q.value = 6;
        gain.gain.setValueAtTime(0.045 * gainScale, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(bp);
        bp.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + dur + 0.02);
      },
      1.5,
      16,
    );
  }

  public playPreAttackWarning(
    pos: THREE.Vector3,
    listenerPos: THREE.Vector3,
    colliders: readonly AABBCollider[],
  ) {
    if (!this.ensureInitialized() || !this.ctx) return;
    const dur = 0.45;
    this.playSpatialOneShot(
      { x: pos.x, y: pos.y + 2.2, z: pos.z },
      listenerPos,
      colliders,
      dur,
      (ctx, dest, gainScale, now) => {
        const osc = ctx.createOscillator();
        const bp = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(84, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + dur);
        bp.type = 'bandpass';
        bp.frequency.value = 420;
        bp.Q.value = 3.5;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18 * gainScale, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(bp);
        bp.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + dur + 0.02);
      },
      2.0,
      20,
    );
  }

  public fadeOutGameplayLoops() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.ambientHumGain?.gain.setTargetAtTime(0.0, now, 0.14);
    this.tensionDroneGain?.gain.setTargetAtTime(0.0, now, 0.12);
    this.chasePulseGain?.gain.setTargetAtTime(0.0, now, 0.1);
    this.monsterBreathGain?.gain.setTargetAtTime(0.0, now, 0.1);
    this.monsterDroneGain?.gain.setTargetAtTime(0.0, now, 0.1);
  }

  public clearDeathSequenceTimers() {
    for (const id of this.deathSeqTimers) {
      window.clearTimeout(id);
    }
    this.deathSeqTimers = [];
  }

  public stopScreamer() {
    if (this.screamerImpactTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.screamerImpactTimer);
      this.screamerImpactTimer = null;
    }
    for (const src of this.activeScreamerSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    }
    for (const node of this.activeScreamerNodes) {
      try {
        node.disconnect();
      } catch {
        // Ignore already disconnected nodes
      }
    }
    this.activeScreamerSources = [];
    this.activeScreamerNodes = [];
  }

  private triggerScreamerImpact(ctx: AudioContext, dest: AudioNode) {
    if (this.disposed) return;
    const now = ctx.currentTime;

    if (this.screamerBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.screamerBuffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(1.05, now);
      src.connect(gain);
      gain.connect(dest);
      src.start(now);
      this.activeScreamerSources.push(src);
      this.activeScreamerNodes.push(gain);
      src.onended = () => {
        try {
          src.disconnect();
          gain.disconnect();
        } catch {
          // Ignore
        }
      };
      return;
    }

    // Layered multi-formant horror screamer fallback (never a simple oscillator beep)
    const dur = 1.95;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.001, now);
    bus.gain.linearRampToValueAtTime(0.92, now + 0.018);
    bus.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // Subtle tunnel slapback reverb
    const delayA = ctx.createDelay(0.4);
    delayA.delayTime.value = 0.085;
    const delayFb = ctx.createGain();
    delayFb.gain.value = 0.28;
    const delayLp = ctx.createBiquadFilter();
    delayLp.type = 'lowpass';
    delayLp.frequency.value = 1650;

    bus.connect(dest);
    bus.connect(delayA);
    delayA.connect(delayLp);
    delayLp.connect(delayFb);
    delayFb.connect(delayA);
    delayLp.connect(dest);
    this.activeScreamerNodes.push(bus, delayA, delayFb, delayLp);

    // 1. Sub-bass chest-slam shockwave
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(112, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + 0.72);
    subGain.gain.setValueAtTime(0.75, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
    sub.connect(subGain);
    subGain.connect(bus);
    sub.start(now);
    sub.stop(now + 0.8);
    this.activeScreamerSources.push(sub);
    this.activeScreamerNodes.push(subGain);

    // 2. Dual FM-distorted monstrous vocal cords routed through throat/mouth formants
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distortionCurve;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(840, now);
    f1.frequency.exponentialRampToValueAtTime(420, now + dur);
    f1.Q.value = 2.2;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1760, now);
    f2.frequency.exponentialRampToValueAtTime(920, now + dur);
    f2.Q.value = 2.6;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.52;
    shaper.connect(f1);
    shaper.connect(f2);
    f1.connect(roarGain);
    f2.connect(roarGain);
    roarGain.connect(bus);
    this.activeScreamerNodes.push(shaper, f1, f2, roarGain);

    for (const [fStart, fPeak, fEnd] of [
      [146, 232, 86],
      [154, 248, 92],
      [310, 520, 175],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(fStart, now);
      osc.frequency.linearRampToValueAtTime(fPeak, now + 0.14);
      osc.frequency.exponentialRampToValueAtTime(fEnd, now + dur * 0.9);
      osc.connect(shaper);
      osc.start(now);
      osc.stop(now + dur);
      this.activeScreamerSources.push(osc);
    }

    // 3. Shredded shriek burst noise
    if (this.noiseBuffer) {
      const shriek = ctx.createBufferSource();
      shriek.buffer = this.noiseBuffer;
      const sBp = ctx.createBiquadFilter();
      sBp.type = 'bandpass';
      sBp.frequency.setValueAtTime(2450, now);
      sBp.frequency.exponentialRampToValueAtTime(680, now + dur * 0.85);
      sBp.Q.value = 1.6;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.65, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.9);
      shriek.connect(sBp);
      sBp.connect(shaper);
      shriek.connect(sg);
      sg.connect(bus);
      shriek.start(now);
      shriek.stop(now + dur);
      this.activeScreamerSources.push(shriek);
      this.activeScreamerNodes.push(sBp, sg);
    }
  }

  public playMonsterAttack() {
    if (!this.ensureInitialized() || !this.ctx || !this.masterGain) return;
    this.stopScreamer();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dest = this.screamerLimiter || this.masterGain;
    this.trackVoice(2.35);

    this.masterGain.gain.setTargetAtTime(0.98 * getEffectiveVolume(), now, 0.02);
    this.fadeOutGameplayLoops();

    // Immediate t=0.00s capture visceral grab thud + rasp (pre-lunge shock)
    const grabSub = ctx.createOscillator();
    const grabGain = ctx.createGain();
    grabSub.type = 'sine';
    grabSub.frequency.setValueAtTime(88, now);
    grabSub.frequency.exponentialRampToValueAtTime(24, now + 0.24);
    grabGain.gain.setValueAtTime(0.45, now);
    grabGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    grabSub.connect(grabGain);
    grabGain.connect(dest);
    grabSub.start(now);
    grabSub.stop(now + 0.28);
    this.activeScreamerSources.push(grabSub);
    this.activeScreamerNodes.push(grabGain);

    if (this.noiseBuffer) {
      const rasp = ctx.createBufferSource();
      rasp.buffer = this.noiseBuffer;
      const rBp = ctx.createBiquadFilter();
      rBp.type = 'bandpass';
      rBp.frequency.setValueAtTime(980, now);
      rBp.Q.value = 1.3;
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.24, now);
      rg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      rasp.connect(rBp);
      rBp.connect(rg);
      rg.connect(dest);
      rasp.start(now);
      rasp.stop(now + 0.18);
      this.activeScreamerSources.push(rasp);
      this.activeScreamerNodes.push(rBp, rg);
    }

    // Peak screamer fires at +85ms synchronized with the creature lunging full-frame into camera
    if (typeof window !== 'undefined') {
      this.screamerImpactTimer = window.setTimeout(() => {
        this.screamerImpactTimer = null;
        if (!this.disposed && this.ctx && (this.screamerLimiter || this.masterGain)) {
          this.triggerScreamerImpact(this.ctx, this.screamerLimiter || this.masterGain!);
        }
      }, 85);
    } else {
      this.triggerScreamerImpact(ctx, dest);
    }
  }

  /** Synchronized multi-stage audio for the 1.5s Phase 6 death animation sequence. */
  public playDeathSequenceAudio(disableFlashes = false) {
    this.clearDeathSequenceTimers();
    this.playMonsterAttack();
    if (!this.ensureInitialized() || !this.ctx || !this.masterGain) return;

    // Stage 3/4 interference static crackle (~0.72s)
    const tStatic = window.setTimeout(() => {
      if (this.disposed || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const dur = 0.55;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(disableFlashes ? 650 : 1850, now);
      bp.frequency.exponentialRampToValueAtTime(340, now + dur);
      bp.Q.value = 1.6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(disableFlashes ? 0.08 : 0.16, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);
      src.stop(now + dur + 0.02);
    }, 720);

    // Stage 4 deep blackout boom (~1.15s)
    const tDrop = window.setTimeout(() => {
      if (this.disposed || !this.ctx || !this.masterGain) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const dur = 0.65;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(76, now);
      osc.frequency.exponentialRampToValueAtTime(24, now + dur);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.26, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + dur + 0.03);
    }, 1120);

    this.deathSeqTimers.push(tStatic, tDrop);
  }

  public startDeathAmbience() {
    if (!this.ensureInitialized() || !this.ctx || !this.masterGain) return;
    this.stopDeathAmbience();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this.masterGain.gain.setTargetAtTime(0.85 * getEffectiveVolume(), now, 0.25);
    this.fadeOutGameplayLoops();

    try {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(37, now);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 110;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.075, now + 0.8);
      osc.connect(lp);
      lp.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      this.deathDroneOsc = osc;
      this.deathDroneGain = gain;

      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 320;
        bp.Q.value = 2.4;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.001, now);
        ng.gain.linearRampToValueAtTime(0.03, now + 1.0);
        src.connect(bp);
        bp.connect(ng);
        ng.connect(this.masterGain);
        src.start(now);
        this.deathNoiseSrc = src;
        this.deathNoiseGain = ng;
      }
    } catch {
      // Ignore audio failures in restricted headless contexts
    }
  }

  public stopDeathAmbience() {
    this.clearDeathSequenceTimers();
    this.stopScreamer();
    const stopNode = (n: AudioScheduledSourceNode | null) => {
      if (!n) return;
      try {
        n.stop();
        n.disconnect();
      } catch {
        // Ignore already stopped nodes
      }
    };
    stopNode(this.deathDroneOsc);
    stopNode(this.deathNoiseSrc);
    this.deathDroneGain?.disconnect();
    this.deathNoiseGain?.disconnect();
    this.deathDroneOsc = null;
    this.deathDroneGain = null;
    this.deathNoiseSrc = null;
    this.deathNoiseGain = null;
  }

  public playSpatialKnock(
    pos: { x: number; y: number; z: number },
    listenerPos: { x: number; z: number },
    colliders: readonly AABBCollider[],
    knocks = 3,
  ) {
    for (let i = 0; i < knocks; i++) {
      window.setTimeout(() => {
        if (this.disposed) return;
        this.playSpatialOneShot(
          pos,
          listenerPos,
          colliders,
          0.14,
          (ctx, dest, gainScale, now) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(115 + Math.random() * 20, now);
            osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
            gain.gain.setValueAtTime(0.24 * gainScale, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.14);
          },
          2.0,
          22,
        );
      }, i * (190 + Math.random() * 90));
    }
  }

  public playSpatialDoorSound(
    pos: { x: number; y: number; z: number },
    listenerPos: { x: number; z: number },
    colliders: readonly AABBCollider[],
    material: DoorMaterial,
    action: DoorAction,
  ) {
    const dur =
      action === 'open_end' || action === 'close_slam'
        ? material === 'heavy_iron'
          ? 0.9
          : 0.45
        : action === 'open'
          ? 0.55
          : 0.35;
    this.playSpatialOneShot(
      pos,
      listenerPos,
      colliders,
      dur,
      (ctx, dest, gainScale) => {
        playDoorActionOnNode(ctx, dest, material, action, gainScale);
      },
      material === 'heavy_iron' ? 3.5 : 1.7,
      material === 'heavy_iron' ? 38 : 22,
    );
  }

  public playSpatialDoorSlam(
    pos: { x: number; y: number; z: number },
    listenerPos: { x: number; z: number },
    colliders: readonly AABBCollider[],
    material: DoorMaterial,
  ) {
    this.playSpatialOneShot(
      pos,
      listenerPos,
      colliders,
      material === 'heavy_iron' ? 0.9 : 0.42,
      (ctx, dest, gainScale) => {
        playDoorActionOnNode(ctx, dest, material, 'close_slam', gainScale * 1.15);
      },
      2.2,
      26,
    );
  }

  public playSpatialWhisper(
    pos: { x: number; y: number; z: number },
    listenerPos: { x: number; z: number },
    colliders: readonly AABBCollider[],
  ) {
    const dur = 1.35;
    this.playSpatialOneShot(
      pos,
      listenerPos,
      colliders,
      dur,
      (ctx, dest, gainScale, now) => {
        if (!this.noiseBuffer) return;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f1 = ctx.createBiquadFilter();
        f1.type = 'bandpass';
        f1.frequency.setValueAtTime(1450, now);
        f1.frequency.linearRampToValueAtTime(980, now + dur * 0.6);
        f1.frequency.linearRampToValueAtTime(1700, now + dur);
        f1.Q.value = 5.5;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.14 * gainScale, now + 0.28);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        src.connect(f1);
        f1.connect(gain);
        gain.connect(dest);
        src.start(now);
        src.stop(now + dur);
      },
      1.2,
      14,
    );
  }

  public playElectricalBuzz(
    pos: { x: number; y: number; z: number },
    listenerPos: { x: number; z: number },
    colliders: readonly AABBCollider[],
  ) {
    const dur = 0.75;
    this.playSpatialOneShot(
      pos,
      listenerPos,
      colliders,
      dur,
      (ctx, dest, gainScale, now) => {
        const osc = ctx.createOscillator();
        const bp = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 120;
        bp.type = 'bandpass';
        bp.frequency.value = 920;
        bp.Q.value = 3.2;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.075 * gainScale, now + 0.08);
        gain.gain.linearRampToValueAtTime(0.02 * gainScale, now + 0.35);
        gain.gain.linearRampToValueAtTime(0.07 * gainScale, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(bp);
        bp.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + dur + 0.02);
      },
      2.0,
      18,
    );
  }

  public playScareSting(kind: 'environmental' | 'silhouette') {
    if (!this.ensureInitialized() || !this.ctx || !this.masterGain) return;
    if (!this.canSpawnVoice()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = kind === 'silhouette' ? 0.9 : 0.45;
    this.trackVoice(dur);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === 'silhouette' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(kind === 'silhouette' ? 92 : 165, now);
    osc.frequency.exponentialRampToValueAtTime(kind === 'silhouette' ? 54 : 45, now + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'silhouette' ? 680 : 1200;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(kind === 'silhouette' ? 0.16 : 0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private playDistantPipeGroan(
    pos: { x: number; y: number; z: number },
    listenerPos: { x: number; z: number },
    colliders: readonly AABBCollider[],
  ) {
    const dur = 1.1;
    this.playSpatialOneShot(
      pos,
      listenerPos,
      colliders,
      dur,
      (ctx, dest, gainScale, now) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const base = 110 + Math.random() * 60;
        osc.frequency.setValueAtTime(base, now);
        osc.frequency.linearRampToValueAtTime(base * 0.84, now + dur);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.045 * gainScale, now + 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + dur + 0.02);
      },
      2.5,
      24,
    );
  }

  private playPlayerBreath(volume: number) {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || !this.canSpawnVoice()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 0.42;
    this.trackVoice(dur);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 1.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.11);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + dur);
  }

  public dispose() {
    this.disposed = true;
    this.stopDeathAmbience();
    const stopNode = (n: AudioScheduledSourceNode | null) => {
      if (!n) return;
      try {
        n.stop();
        n.disconnect();
      } catch {
        // Ignore already-stopped nodes
      }
    };
    stopNode(this.ambientHumOsc);
    stopNode(this.tensionDroneOsc);
    stopNode(this.chasePulseOsc);
    stopNode(this.monsterBreathSrc);
    stopNode(this.monsterDroneOsc);
    this.screamerLimiter?.disconnect();
    this.masterGain?.disconnect();
    this.initialized = false;
  }
}
