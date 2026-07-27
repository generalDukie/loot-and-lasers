// Procedural cantina audio — upbeat synth melody + ambient crowd murmur.
// Routes through the shared audio engine (master/music/sfx + volume settings).
import { ensureAudio, getCtx, musicInput, track, stopOwned } from "@/lib/audioEngine";
import { stopStationAmbient } from "@/lib/stationAmbient";

const OWNER = "cantina";
let out = null;
let timer = null;
let playing = false;

function playTone(freq, start, dur, type, gain) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function playHat(start) {
  const ctx = getCtx();
  const bufferSize = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.02, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
  src.connect(hp);
  hp.connect(g);
  g.connect(out);
  src.start();
  src.stop(start + 0.06);
}

export function startCantina() {
  if (playing) return;
  stopStationAmbient();
  const ctx = ensureAudio();
  if (!ctx) return;
  out = ctx.createGain();
  out.gain.value = 0.12;
  out.connect(musicInput());
  playing = true;

  // Ambient crowd murmur — looping filtered noise
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuffer.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.6;
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.value = 500;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.015;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.2;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.015;
  lfo.connect(lfoGain);
  lfoGain.connect(noiseGain.gain);
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(out);
  noiseSource.start();
  lfo.start();
  track(noiseSource, OWNER);
  track(lfo, OWNER);

  // Upbeat pentatonic melody loop
  const scale = [0, 3, 5, 7, 10, 12, 15];
  const baseFreq = 220; // A3
  let step = 0;
  const scheduleNote = () => {
    if (!playing) return;
    const t = ctx.currentTime + 0.02;
    const note = scale[step % scale.length];
    const oct = Math.floor(step / scale.length) % 2 ? 0 : 12;
    const freq = baseFreq * Math.pow(2, (note + oct) / 12);
    playTone(freq / 2, t, 0.26, "sine", 0.04);            // bass
    playTone(freq, t, 0.2, "triangle", 0.025);            // lead
    if (step % 2 === 1) playHat(t);                       // off-beat hat
    step++;
  };
  scheduleNote();
  timer = setInterval(scheduleNote, 300);
}

export function stopCantina() {
  playing = false;
  if (timer) { clearInterval(timer); timer = null; }
  if (out) { try { out.disconnect(); } catch (e) {} out = null; }
  stopOwned(OWNER);
}

export function isCantinaPlaying() {
  return playing;
}