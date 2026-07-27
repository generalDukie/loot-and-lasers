// Subtle trippy space-station ambience — layered drones, nebula noise, and
// sparse shimmer. All routed through the shared music bus / volume settings.
import { ensureAudio, getCtx, musicInput, track, stopOwned } from "@/lib/audioEngine";
import { stopCantina } from "@/lib/cantinaAudio";

const OWNER = "ambient";
let playing = false;
let timers = [];
let masterGain = null;

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function makeNoiseBuffer(ctx, seconds = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0;
    // Lightweight pink-ish noise (gentler than white for "nebula" hiss).
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.032984;
      b2 = 0.57 * b2 + white * 0.005;
      data[i] = (b0 + b1 + b2 + white * 0.05) * 0.08;
    }
  }
  return buf;
}

function schedulePing(ctx, dest) {
  if (!playing) return;
  const t = ctx.currentTime + 0.02;
  const fund = 420 + Math.random() * 680;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(fund, t);
  osc.frequency.exponentialRampToValueAtTime(fund * 0.72, t + 2.8);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.012 + Math.random() * 0.008, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = fund;
  filter.Q.value = 8;

  osc.connect(filter);
  filter.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + 3.4);
}

export function startStationAmbient() {
  if (playing) return;
  stopCantina();
  const ctx = ensureAudio();
  if (!ctx) return;
  const music = musicInput();
  playing = true;
  clearTimers();

  masterGain = ctx.createGain();
  masterGain.gain.value = 0.85;
  masterGain.connect(music);
  track(masterGain, OWNER);

  // ── Deep detuned drone bed (slow beating = floaty / trippy) ──
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 280;
  droneFilter.Q.value = 1.2;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.028;
  droneFilter.connect(droneGain);
  droneGain.connect(masterGain);

  // Slow breath on the drone filter.
  const breath = ctx.createOscillator();
  breath.type = "sine";
  breath.frequency.value = 0.07;
  const breathDepth = ctx.createGain();
  breathDepth.gain.value = 90;
  breath.connect(breathDepth);
  breathDepth.connect(droneFilter.frequency);
  breath.start();
  track(breath, OWNER);

  // G2 / D3 / A3-ish cluster, slightly detuned for phasing.
  const dronePartials = [
    { f: 98, type: "sine", detune: -6 },
    { f: 98, type: "triangle", detune: 7 },
    { f: 146.83, type: "sine", detune: -4 },
    { f: 220, type: "sine", detune: 5 },
  ];
  dronePartials.forEach(({ f, type, detune }) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    osc.detune.value = detune;
    osc.connect(droneFilter);
    osc.start();
    track(osc, OWNER);
  });

  // ── Nebula noise bed ──
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = makeNoiseBuffer(ctx, 4);
  noiseSrc.loop = true;
  const noiseLp = ctx.createBiquadFilter();
  noiseLp.type = "lowpass";
  noiseLp.frequency.value = 720;
  noiseLp.Q.value = 0.7;
  const noiseHp = ctx.createBiquadFilter();
  noiseHp.type = "highpass";
  noiseHp.frequency.value = 90;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.014;
  // Slow swirl on noise brightness.
  const swirl = ctx.createOscillator();
  swirl.type = "sine";
  swirl.frequency.value = 0.045;
  const swirlDepth = ctx.createGain();
  swirlDepth.gain.value = 280;
  swirl.connect(swirlDepth);
  swirlDepth.connect(noiseLp.frequency);
  swirl.start();
  track(swirl, OWNER);

  noiseSrc.connect(noiseHp);
  noiseHp.connect(noiseLp);
  noiseLp.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSrc.start();
  track(noiseSrc, OWNER);

  // ── High thin shimmer (distant glass / starlight) ──
  const shimFilter = ctx.createBiquadFilter();
  shimFilter.type = "bandpass";
  shimFilter.frequency.value = 2400;
  shimFilter.Q.value = 4;
  const shimGain = ctx.createGain();
  shimGain.gain.value = 0.006;
  shimFilter.connect(shimGain);
  shimGain.connect(masterGain);

  const shimmerLfo = ctx.createOscillator();
  shimmerLfo.type = "sine";
  shimmerLfo.frequency.value = 0.11;
  const shimmerAmp = ctx.createGain();
  shimmerAmp.gain.value = 0.0045;
  shimmerLfo.connect(shimmerAmp);
  shimmerAmp.connect(shimGain.gain);
  shimmerLfo.start();
  track(shimmerLfo, OWNER);

  [1568, 1865, 2093].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    osc.detune.value = (i - 1) * 9;
    osc.connect(shimFilter);
    osc.start();
    track(osc, OWNER);
  });

  // Slow FM wobble on the middle shimmer for a subtle psychedelic edge.
  const wobble = ctx.createOscillator();
  wobble.type = "sine";
  wobble.frequency.value = 0.18;
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = 12;
  wobble.connect(wobbleDepth);
  // Connect into the bandpass cutoff so the shimmer drifts.
  wobbleDepth.connect(shimFilter.frequency);
  wobble.start();
  track(wobble, OWNER);

  // ── Sparse soft sonar pings (very occasional) ──
  const armPing = () => {
    if (!playing) return;
    const delay = 9000 + Math.random() * 16000;
    const id = setTimeout(() => {
      timers = timers.filter((t) => t !== id);
      const c = getCtx();
      if (!playing || !c || !masterGain) return;
      schedulePing(c, masterGain);
      armPing();
    }, delay);
    timers.push(id);
  };
  armPing();
}

export function stopStationAmbient() {
  playing = false;
  clearTimers();
  stopOwned(OWNER);
  masterGain = null;
}

export function isStationAmbientPlaying() {
  return playing;
}
