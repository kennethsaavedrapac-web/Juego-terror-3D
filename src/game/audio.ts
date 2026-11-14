let audioCtx: AudioContext | null = null;

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

function getAudioContext(): AudioContext | null {
  return getSharedAudioContext();
}

export function playDoorSound(
  material: 'wood' | 'metal',
  action: 'open' | 'close' | 'locked',
) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (action === 'locked') {
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160 - i * 25, t);
      osc.frequency.exponentialRampToValueAtTime(65, t + 0.06);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.075);
    }
    return;
  }

  const clickOsc = ctx.createOscillator();
  const clickGain = ctx.createGain();
  clickOsc.type = 'square';
  clickOsc.frequency.setValueAtTime(material === 'metal' ? 420 : 280, now);
  clickOsc.frequency.exponentialRampToValueAtTime(90, now + 0.045);
  clickGain.gain.setValueAtTime(0.07, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  clickOsc.connect(clickGain);
  clickGain.connect(ctx.destination);
  clickOsc.start(now);
  clickOsc.stop(now + 0.055);

  const creakOsc = ctx.createOscillator();
  const creakGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = material === 'metal' ? 620 : 360;
  filter.Q.value = 5;

  creakOsc.type = 'sawtooth';
  const startFreq = action === 'open' ? 140 : 190;
  const endFreq = action === 'open' ? 210 : 115;
  creakOsc.frequency.setValueAtTime(startFreq, now + 0.03);
  creakOsc.frequency.linearRampToValueAtTime(endFreq, now + 0.28);

  creakGain.gain.setValueAtTime(0.001, now + 0.03);
  creakGain.gain.linearRampToValueAtTime(0.055, now + 0.09);
  creakGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

  creakOsc.connect(filter);
  filter.connect(creakGain);
  creakGain.connect(ctx.destination);
  creakOsc.start(now + 0.03);
  creakOsc.stop(now + 0.34);
}

export function playFlashlightSound(turningOn: boolean) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(turningOn ? 920 : 640, now);
  osc.frequency.exponentialRampToValueAtTime(turningOn ? 1480 : 320, now + 0.035);

  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.045);
}

export function playKeyPickupSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

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
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.19);
  }
}

export function playNoteSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

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
  gain.connect(ctx.destination);
  noise.start(now);
}

export function playExamineSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(240, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.14);
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}

export function playExitUnlockSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  // Heavy bolt retract + low metallic resonance
  const notes = [210, 145, 330];
  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.09;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i === 2 ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(notes[i], t);
    osc.frequency.exponentialRampToValueAtTime(notes[i] * 0.75, t + 0.22);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }
}
