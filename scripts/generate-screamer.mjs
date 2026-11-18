import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 44100;
const DURATION_SEC = 2.45;
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION_SEC);

// Deterministic PRNG so generated asset is reproducible
let seed = 0x517cc1b7;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 0xffffffff) * 2 - 1;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Simple 2-pole biquad filter processor (in-place or into new array)
function biquadFilter(input, type, freqStart, freqEnd, q) {
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < input.length; i++) {
    const progress = i / input.length;
    const freq = freqStart + (freqEnd - freqStart) * progress;
    const w0 = (2 * Math.PI * clamp(freq, 20, SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);

    let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (type === 'bandpass') {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
    } else if (type === 'lowpass') {
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
    } else {
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
    }

    const x0 = input[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    out[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }
  return out;
}

const left = new Float32Array(NUM_SAMPLES);
const right = new Float32Array(NUM_SAMPLES);

// Pre-generate textured pink/brown noise
const noiseL = new Float32Array(NUM_SAMPLES);
const noiseR = new Float32Array(NUM_SAMPLES);
let pL = 0, pR = 0;
for (let i = 0; i < NUM_SAMPLES; i++) {
  pL = (pL + 0.16 * rand()) / 1.16;
  pR = (pR + 0.16 * rand()) / 1.16;
  noiseL[i] = pL * 2.5;
  noiseR[i] = pR * 2.5;
}

// 1. Sub-bass impact shockwave (0.00 - 0.50s)
let subPhase = 0;
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  if (t > 0.55) break;
  const f = 112 * Math.exp(-t * 6.5) + 28;
  subPhase += (2 * Math.PI * f) / SAMPLE_RATE;
  const env = Math.min(1, t / 0.006) * Math.exp(-t * 5.8);
  const punch = Math.sin(subPhase) + 0.35 * Math.tanh(Math.sin(subPhase * 2) * 2.2);
  const s = punch * env * 0.95;
  left[i] += s;
  right[i] += s;
}

// 2. Guttural distorted monster roar (multi-cord FM + formants, 0.01 - 1.45s)
const roarRaw = new Float32Array(NUM_SAMPLES);
let p1 = 0, p2 = 0, p3 = 0, fmPhase = 0, lfoPhase = 0;
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  if (t > 1.48) break;
  const env = Math.min(1, t / 0.018) * Math.exp(-Math.max(0, t - 0.12) * 2.35);

  lfoPhase += (2 * Math.PI * (34 + Math.sin(t * 9) * 10)) / SAMPLE_RATE;
  const fBase = 88 - t * 24 + Math.sin(lfoPhase) * 14;
  fmPhase += (2 * Math.PI * (fBase * 1.47)) / SAMPLE_RATE;
  const fm = Math.sin(fmPhase) * (2.6 + Math.exp(-t * 3) * 3.5);

  p1 += (2 * Math.PI * fBase) / SAMPLE_RATE;
  p2 += (2 * Math.PI * (fBase * 1.51)) / SAMPLE_RATE; // menacing tritone/fifth tension
  p3 += (2 * Math.PI * (fBase * 2.03)) / SAMPLE_RATE;

  // Asymmetric saw-like vocal cord pulse + harsh vocal fry
  const cord =
    Math.tanh((Math.sin(p1 + fm) + 0.65 * Math.sin(p2 + fm * 0.7) + 0.45 * Math.sin(p3)) * 2.4) +
    0.45 * noiseL[i] * Math.abs(Math.sin(p1));
  roarRaw[i] = cord * env;
}
const roarFormantA = biquadFilter(roarRaw, 'bandpass', 680, 290, 1.8);
const roarFormantB = biquadFilter(roarRaw, 'bandpass', 1480, 740, 2.2);

// 3. Tearing shriek / shredded screech texture (0.015 - 1.15s)
const shriekRaw = new Float32Array(NUM_SAMPLES);
let sp1 = 0, sp2 = 0;
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  if (t > 1.18) break;
  const env = Math.min(1, t / 0.012) * Math.exp(-Math.max(0, t - 0.06) * 3.4);
  const fS = (560 - t * 210) + Math.sin(t * 58) * 45;
  sp1 += (2 * Math.PI * fS) / SAMPLE_RATE;
  sp2 += (2 * Math.PI * (fS * 1.38)) / SAMPLE_RATE;
  const rasp = Math.tanh((Math.sin(sp1) * 1.6 + Math.sin(sp2) + noiseR[i] * 1.9) * 2.6);
  shriekRaw[i] = rasp * env;
}
const shriekBand = biquadFilter(shriekRaw, 'bandpass', 1950, 820, 1.35);

// 4. Air blast / tearing noise burst
const tearL = biquadFilter(noiseL, 'bandpass', 2400, 520, 0.9);
const tearR = biquadFilter(noiseR, 'bandpass', 2250, 480, 0.9);

for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  const tearEnv = Math.min(1, t / 0.008) * Math.exp(-Math.max(0, t - 0.04) * 3.8);
  const dryL =
    roarFormantA[i] * 0.95 +
    roarFormantB[i] * 0.72 +
    shriekBand[i] * 0.62 +
    tearL[i] * tearEnv * 0.68;
  const dryR =
    roarFormantA[i] * 0.88 +
    roarFormantB[i] * 0.78 +
    shriekBand[i] * 0.66 +
    tearR[i] * tearEnv * 0.68;

  left[i] += dryL;
  right[i] += dryR;
}

// 5. Dark metallic tunnel multi-tap reverb tail (gives haunting spatial decay out to 2.45s)
const taps = [
  { ms: 37, gain: 0.34, pan: -0.35 },
  { ms: 61, gain: 0.28, pan: 0.4 },
  { ms: 97, gain: 0.23, pan: -0.5 },
  { ms: 149, gain: 0.19, pan: 0.3 },
  { ms: 223, gain: 0.15, pan: -0.25 },
  { ms: 317, gain: 0.12, pan: 0.45 },
  { ms: 443, gain: 0.09, pan: -0.2 },
  { ms: 613, gain: 0.06, pan: 0.2 },
];

const wetL = new Float32Array(NUM_SAMPLES);
const wetR = new Float32Array(NUM_SAMPLES);
for (const tap of taps) {
  const delaySamples = Math.floor((tap.ms / 1000) * SAMPLE_RATE);
  const gL = tap.gain * (0.5 - tap.pan * 0.45);
  const gR = tap.gain * (0.5 + tap.pan * 0.45);
  for (let i = delaySamples; i < NUM_SAMPLES; i++) {
    const src = (left[i - delaySamples] + right[i - delaySamples]) * 0.5;
    wetL[i] += src * gL;
    wetR[i] += src * gR;
  }
}
const dampedWetL = biquadFilter(wetL, 'lowpass', 1900, 620, 0.707);
const dampedWetR = biquadFilter(wetR, 'lowpass', 1900, 620, 0.707);

for (let i = 0; i < NUM_SAMPLES; i++) {
  // Smooth fade-out on final 180ms so tail reaches exact zero
  const t = i / SAMPLE_RATE;
  const tailFade = t > DURATION_SEC - 0.22 ? Math.max(0, (DURATION_SEC - t) / 0.22) : 1;
  left[i] = Math.tanh((left[i] + dampedWetL[i]) * 0.85) * 0.91 * tailFade;
  right[i] = Math.tanh((right[i] + dampedWetR[i]) * 0.85) * 0.91 * tailFade;
}

// Encode stereo 16-bit PCM WAV
const byteRate = SAMPLE_RATE * 2 * 2;
const blockAlign = 4;
const dataSize = NUM_SAMPLES * blockAlign;
const buf = Buffer.alloc(44 + dataSize);

buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(byteRate, 28);
buf.writeUInt16LE(blockAlign, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);

let peak = 0;
let sumSq = 0;
for (let i = 0; i < NUM_SAMPLES; i++) {
  const l = clamp(left[i], -1, 1);
  const r = clamp(right[i], -1, 1);
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
  sumSq += (l * l + r * r) * 0.5;
  buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(r * 32767), 44 + i * 4 + 2);
}

const outPath = path.resolve(process.cwd(), 'public/audio/monster-screamer.wav');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buf);
const rmsDb = 20 * Math.log10(Math.sqrt(sumSq / NUM_SAMPLES) + 1e-9);
console.log(`Generated ${outPath} (${(buf.length / 1024).toFixed(1)} KB, peak=${peak.toFixed(3)}, rms=${rmsDb.toFixed(1)} dBFS)`);
