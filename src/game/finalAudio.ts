import { getEffectiveVolume, getSharedAudioContext, subscribeAudioSettings } from './audio';
import type { FinalChasePhase, FinalStage } from './finalSequence';

const CHASE_STEP_SEC = 60 / 138 / 2; // 138 BPM 8th notes (~0.2174s)
const CREDITS_EIGHTH_SEC = 60 / 118 / 2; // 118 BPM 8th notes (~0.2542s)

// Credits chord progression (A minor -> F major -> C major -> G major)
const CREDITS_PROGRESSION = [
  { bass: 55.0, pad: [220.0, 261.63, 329.63, 493.88], arp: [220.0, 329.63, 440.0, 493.88] }, // Am9
  { bass: 43.65, pad: [174.61, 220.0, 261.63, 392.0], arp: [174.61, 261.63, 349.23, 392.0] }, // Fmaj9
  { bass: 65.41, pad: [196.0, 261.63, 329.63, 493.88], arp: [261.63, 329.63, 392.0, 493.88] }, // Cmaj7
  { bass: 49.0, pad: [196.0, 246.94, 293.66, 440.0], arp: [196.0, 293.66, 392.0, 440.0] }, // G6/9
] as const;

// Memorable 32-step (4-bar, 8th-note) heroic-mysterious lead motif
const CREDITS_MELODY_A: (number | null)[] = [
  659.25, null, 587.33, 523.25, 440.0, null, 493.88, 523.25,
  587.33, null, 523.25, 440.0, 392.0, null, 440.0, null,
  523.25, null, 659.25, 783.99, 659.25, null, 587.33, 523.25,
  587.33, null, 493.88, null, 440.0, null, null, null,
];

const CREDITS_MELODY_B: (number | null)[] = [
  880.0, null, 783.99, 659.25, 587.33, null, 659.25, 783.99,
  659.25, null, 523.25, 587.33, 523.25, null, 440.0, null,
  783.99, null, 880.0, 987.77, 880.0, null, 783.99, 659.25,
  783.99, null, 659.25, null, 587.33, null, 493.88, null,
];

function createNoiseBuffer(ctx: AudioContext, seconds = 1.5): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.12 * w) / 1.12;
    ch[i] = last * 2.2;
  }
  return buf;
}

/**
 * Original multi-stage synthesized score for Phase 7 & 7.1:
 * - FINAL_DOOR_OPENING: heavy lockdown power-up tension
 * - FINAL_ESCAPE: dual spatial industrial sirens, 138 BPM chase percussion/bass, metallic impacts
 * - FINAL_FACTORY_REVEAL / TO_BE_CONTINUED: vast cavernous awe contrast
 * - END_CREDITS: 118 BPM cinematic modern rhythmic finale (Intro 0-4s -> Groove 4-20s -> Climax & Resolve 20-27s)
 */
export class FinalAudio {
  private voices: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private bus?: GainNode;
  private sirenBus?: GainNode;
  private musicBus?: GainNode;
  private sirenOscA?: OscillatorNode;
  private sirenOscB?: OscillatorNode;
  private sirenGainA?: GainNode;
  private sirenGainB?: GainNode;
  private noiseBuffer: AudioBuffer | null = null;

  private pulse = 0;
  private stage: FinalStage = 'PLAYING';
  private chasePhase: FinalChasePhase = 'NONE';
  private threatProximity = 0;
  private stepAccum = 0;
  private stepIndex = 0;
  private creditsStepAccum = 0;
  private creditsStep = 0;
  private creditsResolved = false;
  private industrialClangTimer = 3.2;
  private unsubVolume: (() => void) | null = null;
  private baseBusLevel = 0.72;

  constructor() {
    this.unsubVolume = subscribeAudioSettings(() => {
      this.syncMasterVolume();
    });
  }

  private syncMasterVolume() {
    if (!this.bus) return;
    const ctx = this.bus.context;
    this.bus.gain.setTargetAtTime(this.baseBusLevel * getEffectiveVolume(), ctx.currentTime, 0.04);
  }

  private registerVoice<T extends AudioScheduledSourceNode>(node: T): T {
    this.voices.push(node);
    node.onended = () => {
      try {
        node.disconnect();
      } catch {
        // Ignore already disconnected nodes
      }
      const idx = this.voices.indexOf(node);
      if (idx !== -1) this.voices.splice(idx, 1);
    };
    return node;
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
      this.noiseBuffer = createNoiseBuffer(ctx, 1.5);
    }
    return this.noiseBuffer;
  }

  setStage(stage: FinalStage) {
    this.stop();
    this.stage = stage;
    this.pulse = 0;
    this.stepAccum = 0;
    this.stepIndex = 0;
    this.creditsStepAccum = 0;
    this.creditsStep = 0;
    this.creditsResolved = false;
    this.industrialClangTimer = 2.6;
    this.chasePhase = 'NONE';
    this.threatProximity = 0;

    if (stage === 'PLAYING' || stage === 'END_COMPLETE') return;
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bus = ctx.createGain();
    this.bus = bus;
    this.baseBusLevel = stage === 'END_CREDITS' ? 0.85 : 0.78;
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(this.baseBusLevel * getEffectiveVolume(), now + 0.35);
    bus.connect(ctx.destination);

    if (stage === 'FINAL_DOOR_OPENING') {
      this.startDoorOpeningLayer(ctx, bus, now);
    } else if (stage === 'FINAL_ESCAPE') {
      this.startEscapeLayer(ctx, bus, now);
    } else if (stage === 'FINAL_FACTORY_REVEAL' || stage === 'TO_BE_CONTINUED') {
      this.startFactoryAmbienceLayer(ctx, bus, now);
    } else if (stage === 'END_CREDITS') {
      this.startCreditsLayer(ctx, bus, now);
    }
  }

  private startDoorOpeningLayer(ctx: AudioContext, bus: GainNode, now: number) {
    // Rising emergency power-up drone + ominous sub-bass swell
    const freqs = [46.25, 69.3, 138.59];
    freqs.forEach((f, i) => {
      const osc = this.registerVoice(ctx.createOscillator());
      const g = ctx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.linearRampToValueAtTime(f * 1.12, now + 3.8);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.14 : 0.06, now + 1.5);
      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      this.nodes.push(g);
    });
  }

  private startEscapeLayer(ctx: AudioContext, bus: GainNode, now: number) {
    const musicBus = ctx.createGain();
    musicBus.gain.setValueAtTime(0.85, now);
    musicBus.connect(bus);
    this.musicBus = musicBus;

    const sirenBus = ctx.createGain();
    sirenBus.gain.setValueAtTime(0.95, now);

    // Metallic industrial tunnel slapback delay for sirens
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wetLp = ctx.createBiquadFilter();
    wetLp.type = 'lowpass';
    wetLp.frequency.value = 1450;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.42;

    sirenBus.connect(bus);
    sirenBus.connect(delay);
    delay.connect(wetLp);
    wetLp.connect(fb);
    fb.connect(delay);
    wetLp.connect(wetGain);
    wetGain.connect(bus);

    this.sirenBus = sirenBus;
    this.nodes.push(musicBus, sirenBus, delay, fb, wetLp, wetGain);

    // Spatialized Left & Right Industrial Emergency Sirens
    const buildSiren = (pan: number, baseFreq: number) => {
      const osc = this.registerVoice(ctx.createOscillator());
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, now);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(640, now);
      bp.Q.value = 2.1;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);

      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.connect(bp);
      bp.connect(gain);
      if (panner) {
        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(sirenBus);
        this.nodes.push(panner);
      } else {
        gain.connect(sirenBus);
      }
      osc.start(now);
      this.nodes.push(bp, gain);
      return { osc, gain };
    };

    const sA = buildSiren(-0.48, 300);
    const sB = buildSiren(0.52, 340);
    this.sirenOscA = sA.osc;
    this.sirenGainA = sA.gain;
    this.sirenOscB = sB.osc;
    this.sirenGainB = sB.gain;

    // Dark underlying chase tension drone (sits cleanly under 180 Hz)
    for (const [freq, amp] of [[46.25, 0.12], [92.5, 0.05]] as const) {
      const osc = this.registerVoice(ctx.createOscillator());
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, now);
      osc.connect(g);
      g.connect(musicBus);
      osc.start(now);
      this.nodes.push(g);
    }

    // Kick off first warning step right away
    this.triggerChaseStep(ctx, 0);
  }

  private startFactoryAmbienceLayer(ctx: AudioContext, bus: GainNode, now: number) {
    // Vast, awe-inspiring cavernous factory contrast
    const notes = [36.71, 73.42, 110.0, 164.81, 220.0, 293.66];
    notes.forEach((freq, i) => {
      const osc = this.registerVoice(ctx.createOscillator());
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime((i - 2) * 3, now);
      const g = ctx.createGain();
      const amp = i === 0 ? 0.13 : i < 3 ? 0.055 : 0.028;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(amp, now + 2.1);
      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      this.nodes.push(g);
    });

    // Distant cavernous air/steam drift
    const noise = this.registerVoice(ctx.createBufferSource());
    noise.buffer = this.getNoise(ctx);
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.setValueAtTime(280, now);
    lp.Q.value = 1.1;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.linearRampToValueAtTime(0.045, now + 2.4);
    noise.connect(lp);
    lp.connect(ng);
    ng.connect(bus);
    noise.start(now);
    this.nodes.push(lp, ng);
  }

  private startCreditsLayer(ctx: AudioContext, bus: GainNode, now: number) {
    const musicBus = ctx.createGain();
    musicBus.gain.setValueAtTime(1.0, now);

    // Subtle stereo warmth delay on lead & arps
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = CREDITS_EIGHTH_SEC * 1.5;
    const fb = ctx.createGain();
    fb.gain.value = 0.24;
    const wetLp = ctx.createBiquadFilter();
    wetLp.type = 'lowpass';
    wetLp.frequency.value = 2200;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.26;

    musicBus.connect(bus);
    musicBus.connect(delay);
    delay.connect(wetLp);
    wetLp.connect(fb);
    fb.connect(delay);
    wetLp.connect(wetGain);
    wetGain.connect(bus);

    this.musicBus = musicBus;
    this.nodes.push(musicBus, delay, fb, wetLp, wetGain);

    // Trigger Intro Cinematic Hit + Beat 0 immediately
    this.triggerCreditsImpact(ctx, musicBus, now);
    this.triggerCreditsStep(ctx, 0);
  }

  /** Heavy metallic lockdown slam when the chase erupts in Stage A. */
  playTunnelLockdownSlam() {
    const ctx = getSharedAudioContext();
    if (!ctx || !this.bus) return;
    const now = ctx.currentTime;

    const boom = this.registerVoice(ctx.createOscillator());
    const boomGain = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(110, now);
    boom.frequency.exponentialRampToValueAtTime(28, now + 0.65);
    boomGain.gain.setValueAtTime(0.42, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    boom.connect(boomGain);
    boomGain.connect(this.bus);
    boom.start(now);
    boom.stop(now + 0.72);

    // Metallic industrial gate clang
    for (const freq of [195, 312, 540]) {
      const clang = this.registerVoice(ctx.createOscillator());
      const cg = ctx.createGain();
      clang.type = 'triangle';
      clang.frequency.setValueAtTime(freq, now);
      clang.frequency.exponentialRampToValueAtTime(freq * 0.72, now + 0.55);
      cg.gain.setValueAtTime(0.11, now);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      clang.connect(cg);
      cg.connect(this.bus);
      clang.start(now);
      clang.stop(now + 0.6);
    }

    const noise = this.registerVoice(ctx.createBufferSource());
    noise.buffer = this.getNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(920, now);
    bp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(this.bus);
    noise.start(now);
    noise.stop(now + 0.44);
  }

  private playIndustrialClang(pan: number) {
    const ctx = getSharedAudioContext();
    if (!ctx || !this.bus) return;
    const now = ctx.currentTime;
    const osc = this.registerVoice(ctx.createOscillator());
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    osc.type = 'square';
    const base = 155 + Math.random() * 130;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.6, now + 0.35);

    bp.type = 'bandpass';
    bp.frequency.value = 680;
    bp.Q.value = 3.2;

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.09, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(bp);
    bp.connect(g);
    if (panner) {
      panner.pan.value = pan;
      g.connect(panner);
      panner.connect(this.bus);
    } else {
      g.connect(this.bus);
    }
    osc.start(now);
    osc.stop(now + 0.4);
  }

  private triggerChaseStep(ctx: AudioContext, step: number) {
    if (!this.musicBus) return;
    const now = ctx.currentTime;
    const phase = this.chasePhase;
    const isFinalMeters = phase === 'FINAL_METERS';
    const isDesperate = phase === 'DESPERATE_CHASE' || isFinalMeters;

    // 1. Sub kick on beats 0, 2, 4, 6 (plus urgent off-beat push in Stage C)
    if (step % 2 === 0 || (isFinalMeters && step % 8 === 7)) {
      const kick = this.registerVoice(ctx.createOscillator());
      const kg = ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(isFinalMeters ? 125 : 108, now);
      kick.frequency.exponentialRampToValueAtTime(34, now + 0.14);
      kg.gain.setValueAtTime(0.001, now);
      kg.gain.linearRampToValueAtTime(isDesperate ? 0.24 : 0.18, now + 0.008);
      kg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      kick.connect(kg);
      kg.connect(this.musicBus);
      kick.start(now);
      kick.stop(now + 0.17);
    }

    // 2. Driving dark bass pulse (F#1 / G1 tension oscillation)
    const bassFreq = step % 16 >= 12 ? 49.0 : step % 8 >= 6 ? 55.0 : 46.25;
    const bass = this.registerVoice(ctx.createOscillator());
    const lp = ctx.createBiquadFilter();
    const bg = ctx.createGain();
    bass.type = 'sawtooth';
    bass.frequency.setValueAtTime(bassFreq, now);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(isFinalMeters ? 290 : isDesperate ? 240 : 190, now);
    bg.gain.setValueAtTime(0.001, now);
    bg.gain.linearRampToValueAtTime(step % 2 === 0 ? 0.13 : 0.085, now + 0.015);
    bg.gain.exponentialRampToValueAtTime(0.001, now + CHASE_STEP_SEC * 0.92);
    bass.connect(lp);
    lp.connect(bg);
    bg.connect(this.musicBus);
    bass.start(now);
    bass.stop(now + CHASE_STEP_SEC);

    // 3. Industrial metallic snare/clack on backbeats (2 & 6) + high pulse in Stage B/C
    if (step % 4 === 2 || (isDesperate && step % 2 === 1)) {
      const isBackbeat = step % 4 === 2;
      const noise = this.registerVoice(ctx.createBufferSource());
      noise.buffer = this.getNoise(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = isBackbeat ? 'bandpass' : 'highpass';
      hp.frequency.value = isBackbeat ? 1850 : 3200;
      hp.Q.value = isBackbeat ? 1.5 : 0.9;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(isBackbeat ? (isDesperate ? 0.13 : 0.09) : 0.035, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + (isBackbeat ? 0.12 : 0.055));
      noise.connect(hp);
      hp.connect(ng);
      ng.connect(this.musicBus);
      noise.start(now);
      noise.stop(now + 0.13);
    }

    // 4. Urgent high tension synth ostinato in Stage B & C (leaves 300-1300Hz clear for footsteps & sirens!)
    if (isDesperate && step % 2 === 0) {
      const ostFreq = isFinalMeters ? (step % 4 === 0 ? 740 : 880) : (step % 4 === 0 ? 587.33 : 659.25);
      const ost = this.registerVoice(ctx.createOscillator());
      const og = ctx.createGain();
      ost.type = 'triangle';
      ost.frequency.setValueAtTime(ostFreq, now);
      og.gain.setValueAtTime(0.001, now);
      og.gain.linearRampToValueAtTime(isFinalMeters ? 0.05 : 0.032, now + 0.012);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      ost.connect(og);
      og.connect(this.musicBus);
      ost.start(now);
      ost.stop(now + 0.15);
    }
  }

  private triggerCreditsImpact(ctx: AudioContext, dest: AudioNode, now: number) {
    // Intro 0s: Deep warm sub impact + majestic opening A-minor-9 pad swell
    const boom = this.registerVoice(ctx.createOscillator());
    const bg = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(98, now);
    boom.frequency.exponentialRampToValueAtTime(36, now + 0.75);
    bg.gain.setValueAtTime(0.001, now);
    bg.gain.linearRampToValueAtTime(0.28, now + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    boom.connect(bg);
    bg.connect(dest);
    boom.start(now);
    boom.stop(now + 0.9);
  }

  private triggerCreditsStep(ctx: AudioContext, step: number) {
    if (!this.musicBus) return;
    const now = ctx.currentTime;
    const elapsedApprox = step * CREDITS_EIGHTH_SEC;

    // 24.4s - 27.0s: Final resolving chord (Asus2/Am9), percussion rests
    if (elapsedApprox >= 24.4) {
      if (!this.creditsResolved) {
        this.creditsResolved = true;
        // Final warm resolving chord + sub hit
        this.triggerCreditsImpact(ctx, this.musicBus, now);
        for (const freq of [110.0, 220.0, 261.63, 329.63, 493.88, 659.25]) {
          const osc = this.registerVoice(ctx.createOscillator());
          const lp = ctx.createBiquadFilter();
          const g = ctx.createGain();
          osc.type = freq < 150 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, now);
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(1900, now);
          lp.frequency.linearRampToValueAtTime(650, now + 2.4);
          g.gain.setValueAtTime(0.001, now);
          g.gain.linearRampToValueAtTime(freq < 150 ? 0.14 : 0.065, now + 0.15);
          g.gain.exponentialRampToValueAtTime(0.0005, now + 2.55);
          osc.connect(lp);
          lp.connect(g);
          g.connect(this.musicBus);
          osc.start(now);
          osc.stop(now + 2.6);
        }
      }
      return;
    }

    const barIdx = Math.floor(step / 8); // 8 eighth-notes per bar (~2.03s)
    const stepInBar = step % 8;
    const chord = CREDITS_PROGRESSION[barIdx % CREDITS_PROGRESSION.length];
    const inIntro = elapsedApprox < 4.05; // Bars 0..1 (0 - 4.06s)
    const inClimax = elapsedApprox >= 20.0; // Bars 10..11 (20.3 - 24.4s)

    // 1. Pad chord sustain at the start of every bar
    if (stepInBar === 0) {
      chord.pad.forEach((freq, idx) => {
        const osc = this.registerVoice(ctx.createOscillator());
        const lp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.value = (idx - 1.5) * 4;
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(inIntro ? 950 : inClimax ? 1850 : 1400, now);
        const amp = inIntro ? 0.042 : inClimax ? 0.055 : 0.045;
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(amp, now + 0.25);
        g.gain.linearRampToValueAtTime(amp * 0.72, now + CREDITS_EIGHTH_SEC * 7.2);
        g.gain.exponentialRampToValueAtTime(0.001, now + CREDITS_EIGHTH_SEC * 8.1);
        osc.connect(lp);
        lp.connect(g);
        g.connect(this.musicBus!);
        osc.start(now);
        osc.stop(now + CREDITS_EIGHTH_SEC * 8.2);
      });
    }

    // 2. Arpeggio pulse (present in Intro, Development & Climax for rhythmic momentum)
    const arpFreq = chord.arp[stepInBar % chord.arp.length] * (inClimax ? 2 : 1);
    const arpOsc = this.registerVoice(ctx.createOscillator());
    const arpGain = ctx.createGain();
    arpOsc.type = 'triangle';
    arpOsc.frequency.setValueAtTime(arpFreq, now);
    arpGain.gain.setValueAtTime(0.001, now);
    arpGain.gain.linearRampToValueAtTime(inIntro ? 0.048 : 0.055, now + 0.012);
    arpGain.gain.exponentialRampToValueAtTime(0.001, now + CREDITS_EIGHTH_SEC * 0.85);
    arpOsc.connect(arpGain);
    arpGain.connect(this.musicBus);
    arpOsc.start(now);
    arpOsc.stop(now + CREDITS_EIGHTH_SEC * 0.9);

    // 3. Intro motif (0-4s): simple recognizable 4-note pickup before full beat enters
    if (inIntro) {
      if (step === 8 || step === 10 || step === 12 || step === 14) {
        const introNotes = [659.25, 880.0, 783.99, 659.25];
        const noteFreq = introNotes[(step - 8) / 2];
        const lead = this.registerVoice(ctx.createOscillator());
        const lg = ctx.createGain();
        lead.type = 'sine';
        lead.frequency.setValueAtTime(noteFreq, now);
        lg.gain.setValueAtTime(0.001, now);
        lg.gain.linearRampToValueAtTime(0.09, now + 0.025);
        lg.gain.exponentialRampToValueAtTime(0.001, now + CREDITS_EIGHTH_SEC * 1.8);
        lead.connect(lg);
        lg.connect(this.musicBus);
        lead.start(now);
        lead.stop(now + CREDITS_EIGHTH_SEC * 1.9);
      }
      return;
    }

    // 4. Development & Climax Groove (4s - 24.4s): Driving hybrid percussion + synth bass + lead melody
    // Kick on 0, 3, 4 (cinematic modern half-step energy)
    if (stepInBar === 0 || stepInBar === 3 || stepInBar === 4 || (inClimax && stepInBar === 6)) {
      const kick = this.registerVoice(ctx.createOscillator());
      const kg = ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(115, now);
      kick.frequency.exponentialRampToValueAtTime(38, now + 0.14);
      kg.gain.setValueAtTime(0.001, now);
      kg.gain.linearRampToValueAtTime(inClimax ? 0.25 : 0.21, now + 0.006);
      kg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      kick.connect(kg);
      kg.connect(this.musicBus);
      kick.start(now);
      kick.stop(now + 0.19);
    }

    // Crisp hybrid snare/clap on 2 & 6
    if (stepInBar === 2 || stepInBar === 6) {
      const snare = this.registerVoice(ctx.createBufferSource());
      snare.buffer = this.getNoise(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2100;
      bp.Q.value = 1.1;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(inClimax ? 0.13 : 0.1, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      snare.connect(bp);
      bp.connect(sg);
      sg.connect(this.musicBus);
      snare.start(now);
      snare.stop(now + 0.15);
    }

    // Crisp hi-hat pulse on every 8th note
    const hat = this.registerVoice(ctx.createBufferSource());
    hat.buffer = this.getNoise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5400;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(stepInBar % 2 === 1 ? 0.042 : 0.022, now);
    hg.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    hat.connect(hp);
    hp.connect(hg);
    hg.connect(this.musicBus);
    hat.start(now);
    hat.stop(now + 0.05);

    // Driving octave synth bass
    const bassOsc = this.registerVoice(ctx.createOscillator());
    const bassLp = ctx.createBiquadFilter();
    const bassGain = ctx.createGain();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(stepInBar % 2 === 1 ? chord.bass * 2 : chord.bass, now);
    bassLp.type = 'lowpass';
    bassLp.frequency.setValueAtTime(inClimax ? 440 : 340, now);
    bassGain.gain.setValueAtTime(0.001, now);
    bassGain.gain.linearRampToValueAtTime(0.14, now + 0.012);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + CREDITS_EIGHTH_SEC * 0.9);
    bassOsc.connect(bassLp);
    bassLp.connect(bassGain);
    bassGain.connect(this.musicBus);
    bassOsc.start(now);
    bassOsc.stop(now + CREDITS_EIGHTH_SEC * 0.95);

    // Memorable Lead Melody
    const phraseStep = (step - 16) % 32;
    const phraseGroup = Math.floor((step - 16) / 32);
    const melody = phraseGroup % 2 === 0 && !inClimax ? CREDITS_MELODY_A : CREDITS_MELODY_B;
    const leadFreq = melody[phraseStep];
    if (leadFreq) {
      const lead = this.registerVoice(ctx.createOscillator());
      const harmony = inClimax ? this.registerVoice(ctx.createOscillator()) : null;
      const leadLp = ctx.createBiquadFilter();
      const lg = ctx.createGain();
      lead.type = 'triangle';
      lead.frequency.setValueAtTime(leadFreq, now);
      if (harmony) {
        harmony.type = 'sine';
        harmony.frequency.setValueAtTime(leadFreq * 0.5, now);
        harmony.connect(leadLp);
      }
      leadLp.type = 'lowpass';
      leadLp.frequency.setValueAtTime(2800, now);
      const dur = CREDITS_EIGHTH_SEC * 1.85;
      lg.gain.setValueAtTime(0.001, now);
      lg.gain.linearRampToValueAtTime(inClimax ? 0.12 : 0.095, now + 0.025);
      lg.gain.exponentialRampToValueAtTime(0.001, now + dur);
      lead.connect(leadLp);
      leadLp.connect(lg);
      lg.connect(this.musicBus);
      lead.start(now);
      lead.stop(now + dur + 0.02);
      if (harmony) {
        harmony.start(now);
        harmony.stop(now + dur + 0.02);
      }
    }
  }

  update(dt: number, chasePhase: FinalChasePhase = 'NONE', threatProximity = 0) {
    this.pulse += dt;
    this.chasePhase = chasePhase;
    this.threatProximity = threatProximity;

    const ctx = getSharedAudioContext();
    if (!ctx || !this.bus) return;
    const now = ctx.currentTime;

    if (this.stage === 'FINAL_ESCAPE') {
      // 1. Modulate Industrial Emergency Sirens cleanly without restarts or chaotic overlaps
      if (this.sirenOscA && this.sirenGainA && this.sirenOscB && this.sirenGainB) {
        const activeChase = chasePhase !== 'NONE';
        const sweepA = 0.5 - 0.5 * Math.cos(this.pulse * 3.1); // ~2.0s smooth industrial sweep
        const freqA = 290 + sweepA * 185;
        this.sirenOscA.frequency.setTargetAtTime(freqA, now, 0.04);

        const sirenLevelA = activeChase
          ? (chasePhase === 'FINAL_METERS' ? 0.115 : 0.095) * (0.42 + 0.58 * sweepA)
          : 0.048 * (0.35 + 0.65 * sweepA); // Warning klaxon before monster appears
        this.sirenGainA.gain.setTargetAtTime(sirenLevelA, now, 0.05);

        // Secondary spatial siren engages during Desperate Chase & Final Meters
        const sweepB = 0.5 - 0.5 * Math.cos(this.pulse * 4.2 + 1.4);
        const klaxonPulse = chasePhase === 'FINAL_METERS' ? (Math.sin(this.pulse * 10) > 0 ? 1.0 : 0.25) : 1.0;
        this.sirenOscB.frequency.setTargetAtTime(340 + sweepB * 190, now, 0.04);
        const sirenLevelB =
          chasePhase === 'DESPERATE_CHASE'
            ? 0.072 * (0.3 + 0.7 * sweepB)
            : chasePhase === 'FINAL_METERS'
              ? 0.095 * (0.35 + 0.65 * sweepB) * klaxonPulse
              : 0.0001;
        this.sirenGainB.gain.setTargetAtTime(sirenLevelB, now, 0.05);
      }

      // 2. Chase Sequencer (138 BPM)
      this.stepAccum += dt;
      while (this.stepAccum >= CHASE_STEP_SEC) {
        this.stepAccum -= CHASE_STEP_SEC;
        this.stepIndex += 1;
        this.triggerChaseStep(ctx, this.stepIndex);
      }

      // 3. Occasional industrial tunnel metallic impacts during Desperate Chase / Final Meters
      if (chasePhase === 'DESPERATE_CHASE' || chasePhase === 'FINAL_METERS') {
        this.industrialClangTimer -= dt;
        if (this.industrialClangTimer <= 0) {
          this.industrialClangTimer = chasePhase === 'FINAL_METERS' ? 2.1 + Math.random() * 1.4 : 3.2 + Math.random() * 2.2;
          this.playIndustrialClang((Math.random() - 0.5) * 1.4);
        }
      }
    } else if (this.stage === 'END_CREDITS') {
      // 118 BPM Credits Sequencer synced to 27s roll
      this.creditsStepAccum += dt;
      while (this.creditsStepAccum >= CREDITS_EIGHTH_SEC) {
        this.creditsStepAccum -= CREDITS_EIGHTH_SEC;
        this.creditsStep += 1;
        this.triggerCreditsStep(ctx, this.creditsStep);
      }
      if (this.pulse > 26.2) {
        this.bus.gain.setTargetAtTime(0, now, 0.35);
      }
    }
  }

  /** Rapidly ducks tunnel sirens & chase score so the capture screamer punches cleanly on impact. */
  duckForScreamer() {
    if (!this.bus) return;
    const ctx = this.bus.context;
    const now = ctx.currentTime;
    try {
      this.musicBus?.gain.setTargetAtTime(0.02, now, 0.015);
      this.sirenBus?.gain.setTargetAtTime(0.02, now, 0.015);
      this.bus.gain.setTargetAtTime(0.02, now, 0.018);
    } catch {
      // Ignore audio context errors
    }
  }

  stop() {
    const bus = this.bus;
    const voices = this.voices;
    const nodes = this.nodes;
    this.bus = undefined;
    this.musicBus = undefined;
    this.sirenBus = undefined;
    this.sirenOscA = undefined;
    this.sirenOscB = undefined;
    this.sirenGainA = undefined;
    this.sirenGainB = undefined;
    this.voices = [];
    this.nodes = [];
    if (!bus) return;
    const ctx = bus.context;
    const now = ctx.currentTime;
    try {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0, now, 0.08);
    } catch {
      // Ignore context errors during shutdown
    }
    voices.forEach((osc) => {
      try {
        osc.stop(now + 0.35);
      } catch {
        // Ignore already stopped sources
      }
    });
    window.setTimeout(() => {
      nodes.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          // Ignore
        }
      });
      try {
        bus.disconnect();
      } catch {
        // Ignore
      }
    }, 420);
  }

  dispose() {
    this.stop();
    this.unsubVolume?.();
    this.unsubVolume = null;
  }
}
