import type { DoorMaterial } from './types';

let audioCtx: AudioContext | null = null;
let sfxMasterGain: GainNode | null = null;
let masterVolume = 0.85;
let masterMuted = false;
const audioListeners = new Set<() => void>();
const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();

export type DoorAction =
  | 'open'
  | 'close'
  | 'close_slam'
  | 'locked'
  | 'unlock'
  | 'open_start'
  | 'open_end';

export interface DoorAudioProfile {
  material: DoorMaterial;
  latchFreqHz: number;
  creakRangeHz: [number, number];
  creakFormantHz: [number, number];
  slamBodyHz: [number, number];
  slamRingHz: number[];
  lockedKnockHz: number;
  pitchSpread: number;
}

export const DOOR_MATERIAL_PROFILES: Record<DoorMaterial, DoorAudioProfile> = {
  wood: {
    material: 'wood',
    latchFreqHz: 290,
    creakRangeHz: [128, 215],
    creakFormantHz: [310, 760],
    slamBodyHz: [96, 32],
    slamRingHz: [245],
    lockedKnockHz: 135,
    pitchSpread: 0.08,
  },
  metal: {
    material: 'metal',
    latchFreqHz: 520,
    creakRangeHz: [240, 385],
    creakFormantHz: [580, 1260],
    slamBodyHz: [148, 42],
    slamRingHz: [860, 1420],
    lockedKnockHz: 430,
    pitchSpread: 0.06,
  },
  heavy_iron: {
    material: 'heavy_iron',
    latchFreqHz: 220,
    creakRangeHz: [72, 134],
    creakFormantHz: [195, 420],
    slamBodyHz: [62, 21],
    slamRingHz: [175, 340, 590],
    lockedKnockHz: 84,
    pitchSpread: 0.04,
  },
};

function getDoorNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const existing = noiseBufferCache.get(ctx);
  if (existing) return existing;
  const len = Math.max(1, Math.floor(ctx.sampleRate * 1.6));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.14 * w) / 1.14;
    data[i] = last * 2.1;
  }
  noiseBufferCache.set(ctx, buf);
  return buf;
}

export function getAudioSettings() {
  return { volume: masterVolume, muted: masterMuted };
}

export function getEffectiveVolume(): number {
  return masterMuted ? 0 : Math.max(0, Math.min(1, masterVolume));
}

export function setAudioSettings(volume?: number, muted?: boolean) {
  if (typeof volume === 'number' && Number.isFinite(volume)) {
    masterVolume = Math.max(0, Math.min(1, volume));
  }
  if (typeof muted === 'boolean') {
    masterMuted = muted;
  }
  if (audioCtx && sfxMasterGain) {
    sfxMasterGain.gain.setTargetAtTime(getEffectiveVolume(), audioCtx.currentTime, 0.03);
  }
  for (const listener of audioListeners) {
    listener();
  }
}

export function subscribeAudioSettings(listener: () => void): () => void {
  audioListeners.add(listener);
  return () => audioListeners.delete(listener);
}

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getSfxOutput(): { ctx: AudioContext; out: AudioNode } | null {
  const ctx = getSharedAudioContext();
  if (!ctx) return null;
  if (!sfxMasterGain || sfxMasterGain.context !== ctx) {
    sfxMasterGain = ctx.createGain();
    sfxMasterGain.gain.value = getEffectiveVolume();
    sfxMasterGain.connect(ctx.destination);
  }
  return { ctx, out: sfxMasterGain };
}

/**
 * Renders material-realistic door audio onto any Web Audio destination (direct SFX bus or 3D spatial PannerNode).
 */
export function playDoorActionOnNode(
  ctx: AudioContext,
  dest: AudioNode,
  material: DoorMaterial,
  action: DoorAction,
  gainScale = 1,
) {
  const now = ctx.currentTime;
  const profile = DOOR_MATERIAL_PROFILES[material];
  const pitch = 1 + (Math.random() - 0.5) * 2 * profile.pitchSpread;
  const noiseBuf = getDoorNoiseBuffer(ctx);

  const triggerNoise = (
    startAt: number,
    dur: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    peakGain: number,
  ) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(Math.max(30, freqStart * pitch), startAt);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd * pitch), startAt + dur);
    filter.Q.value = q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0005, startAt);
    gain.gain.linearRampToValueAtTime(Math.max(0.001, peakGain * gainScale), startAt + Math.min(0.025, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0005, startAt + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(startAt);
    src.stop(startAt + dur + 0.02);
  };

  if (action === 'locked') {
    if (material === 'heavy_iron') {
      for (let i = 0; i < 2; i++) {
        const t = now + i * 0.14;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(profile.lockedKnockHz * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.12);
        g.gain.setValueAtTime(0.2 * gainScale, t);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.13);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.14);
        triggerNoise(t, 0.09, 'bandpass', 260, 140, 2.2, 0.11);
      }
      return;
    }

    // Wood or Metal locked handle rattle + knock
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.09;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = material === 'metal' ? 'square' : 'triangle';
      osc.frequency.setValueAtTime((profile.lockedKnockHz - i * 24) * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(material === 'metal' ? 145 : 54, t + 0.065);
      g.gain.setValueAtTime((material === 'metal' ? 0.085 : 0.14) * gainScale, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.075);
      osc.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + 0.08);
      triggerNoise(
        t,
        0.055,
        'bandpass',
        material === 'metal' ? 1600 : 420,
        material === 'metal' ? 920 : 210,
        2.5,
        material === 'metal' ? 0.09 : 0.08,
      );
    }
    return;
  }

  if (action === 'unlock') {
    // Stage 1: Heavy padlocks snap open -> iron crossbar slides -> deep bolt retraction
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.11;
      const clink = ctx.createOscillator();
      const cg = ctx.createGain();
      clink.type = 'triangle';
      clink.frequency.setValueAtTime((420 + i * 95) * pitch, t);
      clink.frequency.exponentialRampToValueAtTime(140, t + 0.085);
      cg.gain.setValueAtTime(0.11 * gainScale, t);
      cg.gain.exponentialRampToValueAtTime(0.0008, t + 0.095);
      clink.connect(cg);
      cg.connect(dest);
      clink.start(t);
      clink.stop(t + 0.1);
      triggerNoise(t, 0.06, 'bandpass', 1800, 950, 3.0, 0.085);
    }

    // Sliding iron crossbar clank (~0.36s)
    const barT = now + 0.34;
    const barOsc = ctx.createOscillator();
    const barGain = ctx.createGain();
    barOsc.type = 'sawtooth';
    barOsc.frequency.setValueAtTime(185 * pitch, barT);
    barOsc.frequency.exponentialRampToValueAtTime(62, barT + 0.36);
    const barBp = ctx.createBiquadFilter();
    barBp.type = 'bandpass';
    barBp.frequency.value = 340;
    barBp.Q.value = 2.4;
    barGain.gain.setValueAtTime(0.001, barT);
    barGain.gain.linearRampToValueAtTime(0.16 * gainScale, barT + 0.025);
    barGain.gain.exponentialRampToValueAtTime(0.0008, barT + 0.38);
    barOsc.connect(barBp);
    barBp.connect(barGain);
    barGain.connect(dest);
    barOsc.start(barT);
    barOsc.stop(barT + 0.4);

    // Sub lock thump
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(72, barT);
    sub.frequency.exponentialRampToValueAtTime(24, barT + 0.32);
    sg.gain.setValueAtTime(0.22 * gainScale, barT);
    sg.gain.exponentialRampToValueAtTime(0.0008, barT + 0.35);
    sub.connect(sg);
    sg.connect(dest);
    sub.start(barT);
    sub.stop(barT + 0.36);
    return;
  }

  if (action === 'open_start') {
    // Heavy shear pin break + initial iron structural groan
    const pin = ctx.createOscillator();
    const pg = ctx.createGain();
    pin.type = 'sawtooth';
    pin.frequency.setValueAtTime(92 * pitch, now);
    pin.frequency.linearRampToValueAtTime(138 * pitch, now + 0.38);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(210, now);
    bp.frequency.linearRampToValueAtTime(390, now + 0.42);
    bp.Q.value = 3.2;
    pg.gain.setValueAtTime(0.001, now);
    pg.gain.linearRampToValueAtTime(0.18 * gainScale, now + 0.03);
    pg.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
    pin.connect(bp);
    bp.connect(pg);
    pg.connect(dest);
    pin.start(now);
    pin.stop(now + 0.54);
    triggerNoise(now, 0.42, 'bandpass', 240, 520, 1.8, 0.16);
    return;
  }

  if (action === 'open_end' || action === 'close_slam') {
    const [bStart, bEnd] = profile.slamBodyHz;
    const isHeavyIron = material === 'heavy_iron';
    const dur = isHeavyIron ? 0.85 : material === 'metal' ? 0.36 : 0.28;

    // 1. Solid physical body thud against jamb/stop
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = material === 'wood' ? 'triangle' : 'sine';
    body.frequency.setValueAtTime(bStart * pitch, now);
    body.frequency.exponentialRampToValueAtTime(Math.max(18, bEnd), now + dur * 0.72);
    bg.gain.setValueAtTime((isHeavyIron ? 0.34 : 0.26) * gainScale, now);
    bg.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    body.connect(bg);
    bg.connect(dest);
    body.start(now);
    body.stop(now + dur + 0.02);

    // 2. Material resonance rings (wood frame thump vs metal clang vs heavy iron plate)
    profile.slamRingHz.forEach((f, idx) => {
      const ring = ctx.createOscillator();
      const rg = ctx.createGain();
      ring.type = material === 'wood' ? 'triangle' : 'square';
      ring.frequency.setValueAtTime(f * pitch, now);
      ring.frequency.exponentialRampToValueAtTime(f * 0.86 * pitch, now + dur * 0.65);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * pitch;
      bp.Q.value = material === 'wood' ? 2.2 : 4.5;
      rg.gain.setValueAtTime(((isHeavyIron ? 0.13 : 0.08) / (idx + 1)) * gainScale, now);
      rg.gain.exponentialRampToValueAtTime(0.0006, now + dur * 0.82);
      ring.connect(bp);
      bp.connect(rg);
      rg.connect(dest);
      ring.start(now);
      ring.stop(now + dur);
    });

    // 3. Latch click / impact crack + short tunnel reverb tail for heavy iron
    triggerNoise(
      now,
      isHeavyIron ? 0.75 : 0.18,
      material === 'wood' ? 'lowpass' : 'bandpass',
      isHeavyIron ? 680 : material === 'metal' ? 1700 : 880,
      isHeavyIron ? 160 : 280,
      isHeavyIron ? 1.1 : 1.5,
      isHeavyIron ? 0.22 : 0.18,
    );
    return;
  }

  // action === 'open' or 'close' (latch + leaf movement, ZERO slam!)
  if (action === 'open') {
    // Handle / latch release (two quick crisp ticks)
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.028;
      const latch = ctx.createOscillator();
      const lg = ctx.createGain();
      latch.type = material === 'metal' ? 'square' : 'triangle';
      latch.frequency.setValueAtTime((profile.latchFreqHz - i * 45) * pitch, t);
      latch.frequency.exponentialRampToValueAtTime(85, t + 0.032);
      lg.gain.setValueAtTime((material === 'metal' ? 0.06 : 0.075) * gainScale, t);
      lg.gain.exponentialRampToValueAtTime(0.0008, t + 0.036);
      latch.connect(lg);
      lg.connect(dest);
      latch.start(t);
      latch.stop(t + 0.04);
    }

    // Aged creak with stick-slip resonance + subtle surface friction noise
    const creakDur = material === 'wood' ? 0.44 : 0.34;
    const creakStart = now + 0.045;
    const [cMin, cMax] = profile.creakRangeHz;
    const [f1, f2] = profile.creakFormantHz;

    const creak = ctx.createOscillator();
    creak.type = 'sawtooth';
    creak.frequency.setValueAtTime(cMin * pitch, creakStart);
    creak.frequency.linearRampToValueAtTime(cMax * pitch, creakStart + creakDur * 0.55);
    creak.frequency.linearRampToValueAtTime((cMin * 1.18) * pitch, creakStart + creakDur);

    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.setValueAtTime(f1 * pitch, creakStart);
    bp1.Q.value = material === 'wood' ? 4.8 : 6.2;

    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.setValueAtTime(f2 * pitch, creakStart);
    bp2.Q.value = 5.0;

    const creakGain = ctx.createGain();
    creakGain.gain.setValueAtTime(0.0005, creakStart);
    creakGain.gain.linearRampToValueAtTime((material === 'wood' ? 0.062 : 0.052) * gainScale, creakStart + 0.08);
    creakGain.gain.linearRampToValueAtTime((material === 'wood' ? 0.045 : 0.035) * gainScale, creakStart + creakDur * 0.72);
    creakGain.gain.exponentialRampToValueAtTime(0.0005, creakStart + creakDur);

    creak.connect(bp1);
    creak.connect(bp2);
    bp1.connect(creakGain);
    bp2.connect(creakGain);
    creakGain.connect(dest);
    creak.start(creakStart);
    creak.stop(creakStart + creakDur + 0.02);

    triggerNoise(
      creakStart,
      creakDur * 0.85,
      'bandpass',
      material === 'wood' ? 480 : 1050,
      material === 'wood' ? 290 : 620,
      2.2,
      0.035,
    );
    return;
  }

  // action === 'close': leaf air swing + brief descending hinge groan (slam fires on physical contact!)
  const swingDur = 0.22;
  triggerNoise(
    now,
    swingDur,
    'bandpass',
    material === 'metal' ? 760 : 420,
    material === 'metal' ? 320 : 180,
    1.4,
    0.065,
  );
  const groan = ctx.createOscillator();
  const gg = ctx.createGain();
  const gbp = ctx.createBiquadFilter();
  groan.type = 'sawtooth';
  groan.frequency.setValueAtTime(profile.creakRangeHz[1] * 0.92 * pitch, now + 0.02);
  groan.frequency.exponentialRampToValueAtTime(profile.creakRangeHz[0] * 0.88 * pitch, now + swingDur);
  gbp.type = 'bandpass';
  gbp.frequency.value = profile.creakFormantHz[0] * pitch;
  gbp.Q.value = 4.2;
  gg.gain.setValueAtTime(0.0005, now + 0.02);
  gg.gain.linearRampToValueAtTime(0.038 * gainScale, now + 0.07);
  gg.gain.exponentialRampToValueAtTime(0.0005, now + swingDur);
  groan.connect(gbp);
  gbp.connect(gg);
  gg.connect(dest);
  groan.start(now + 0.02);
  groan.stop(now + swingDur + 0.02);
}

export function playDoorSound(
  material: DoorMaterial,
  action: DoorAction,
) {
  const audio = getSfxOutput();
  if (!audio) return;
  playDoorActionOnNode(audio.ctx, audio.out, material, action, 1);
}

// Active sustained heavy iron blast-gate opening loop state
let ironLoopNodes: AudioNode[] = [];
let ironLoopSources: AudioScheduledSourceNode[] = [];
let ironLoopGain: GainNode | null = null;
let ironLoopStopTimer: number | null = null;

export function stopHeavyIronOpeningLoop() {
  if (ironLoopStopTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(ironLoopStopTimer);
    ironLoopStopTimer = null;
  }
  const sources = ironLoopSources;
  const nodes = ironLoopNodes;
  const gain = ironLoopGain;
  ironLoopSources = [];
  ironLoopNodes = [];
  ironLoopGain = null;

  if (gain && audioCtx) {
    const now = audioCtx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, 0.06);
    } catch {
      // Ignore context errors
    }
  }

  sources.forEach((src) => {
    try {
      src.stop(audioCtx ? audioCtx.currentTime + 0.14 : undefined);
    } catch {
      // Ignore already stopped sources
    }
  });

  if (typeof window !== 'undefined' && (nodes.length > 0 || gain)) {
    window.setTimeout(() => {
      nodes.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          // Ignore
        }
      });
      try {
        gain?.disconnect();
      } catch {
        // Ignore
      }
    }, 180);
  }
}

export function startHeavyIronOpeningLoop() {
  stopHeavyIronOpeningLoop();
  const audio = getSfxOutput();
  if (!audio) return;
  const { ctx, out } = audio;
  const now = ctx.currentTime;

  const loopBus = ctx.createGain();
  loopBus.gain.setValueAtTime(0.0005, now);
  loopBus.gain.linearRampToValueAtTime(0.24, now + 0.25);
  loopBus.connect(out);
  ironLoopGain = loopBus;

  // 1. Iron-on-iron sustained grinding scrape noise
  const noise = ctx.createBufferSource();
  noise.buffer = getDoorNoiseBuffer(ctx);
  noise.loop = true;

  const scrapeBp = ctx.createBiquadFilter();
  scrapeBp.type = 'bandpass';
  scrapeBp.frequency.setValueAtTime(240, now);
  scrapeBp.frequency.linearRampToValueAtTime(410, now + 1.6);
  scrapeBp.frequency.linearRampToValueAtTime(270, now + 3.2);
  scrapeBp.Q.value = 3.1;

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1.65;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 85;
  lfo.connect(lfoGain);
  lfoGain.connect(scrapeBp.frequency);

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.72;
  noise.connect(scrapeBp);
  scrapeBp.connect(noiseGain);
  noiseGain.connect(loopBus);

  // 2. Deep hydraulic/structural rumble under the massive double doors
  const rumble = ctx.createOscillator();
  rumble.type = 'sawtooth';
  rumble.frequency.setValueAtTime(44, now);
  rumble.frequency.linearRampToValueAtTime(52, now + 2.8);
  const rumbleLp = ctx.createBiquadFilter();
  rumbleLp.type = 'lowpass';
  rumbleLp.frequency.value = 135;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.42;
  rumble.connect(rumbleLp);
  rumbleLp.connect(rumbleGain);
  rumbleGain.connect(loopBus);

  noise.start(now);
  lfo.start(now);
  rumble.start(now);

  ironLoopSources.push(noise, lfo, rumble);
  ironLoopNodes.push(scrapeBp, lfoGain, noiseGain, rumbleLp, rumbleGain);

  // Safety auto-stop after 3.4s even if state transitions unexpectedly
  if (typeof window !== 'undefined') {
    ironLoopStopTimer = window.setTimeout(() => {
      stopHeavyIronOpeningLoop();
    }, 3450);
  }
}

export function playFlashlightSound(turningOn: boolean) {
  const audio = getSfxOutput();
  if (!audio) return;
  const { ctx, out } = audio;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(turningOn ? 920 : 640, now);
  osc.frequency.exponentialRampToValueAtTime(turningOn ? 1480 : 320, now + 0.035);

  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(gain);
  gain.connect(out);
  osc.start(now);
  osc.stop(now + 0.045);
}

export function playKeyPickupSound() {
  const audio = getSfxOutput();
  if (!audio) return;
  const { ctx, out } = audio;

  const now = ctx.currentTime;
  const freqs = [880, 1320, 1760];
  for (let i = 0; i < freqs.length; i++) {
    const t = now + i * 0.045;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freqs[i], t);
    osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.96, t + 0.16);
    gain.gain.setValueAtTime(0.075, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + 0.19);
  }
}

export function playNoteSound() {
  const audio = getSfxOutput();
  if (!audio) return;
  const { ctx, out } = audio;

  const now = ctx.currentTime;
  // Crisp paper rustle via short filtered white noise burst
  const bufferSize = Math.floor(ctx.sampleRate * 0.14);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 1.4;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.11, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  noise.start(now);
}

export function playExamineSound() {
  const audio = getSfxOutput();
  if (!audio) return;
  const { ctx, out } = audio;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(240, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.14);
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain);
  gain.connect(out);
  osc.start(now);
  osc.stop(now + 0.16);
}

export function playExitUnlockSound() {
  playDoorSound('heavy_iron', 'unlock');
}
