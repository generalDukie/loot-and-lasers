// Procedural cantina audio — fun upbeat lounge tune + crowd murmur.
// Routes through the shared audio engine (master/music/sfx + volume settings).
import { ensureAudio, getCtx, musicInput, track, stopOwned } from "@/lib/audioEngine";
import { stopStationAmbient } from "@/lib/stationAmbient";

const OWNER = "cantina";
let out = null;
let timer = null;
let playing = false;

function playTone(freq, start, dur, type, gain) {
  const ctx = getCtx();
  if (!ctx || !out) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function playKick(start) {
  const ctx = getCtx();
  if (!ctx || !out) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, start);
  osc.frequency.exponentialRampToValueAtTime(48, start + 0.14);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(0.07, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
  osc.connect(g);
  g.connect(out);
  osc.start(start);
  osc.stop(start + 0.2);
}

function playHat(start) {
  const ctx = getCtx();
  if (!ctx || !out) return;
  const bufferSize = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.028, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
  src.connect(hp);
  hp.connect(g);
  g.connect(out);
  src.start();
  src.stop(start + 0.05);
}

export function startCantina() {
  if (playing) return;
  stopStationAmbient();
  const ctx = ensureAudio();
  if (!ctx) return;
  out = ctx.createGain();
  out.gain.value = 0.14;
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
  noiseFilter.frequency.value = 520;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.012;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.22;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.01;
  lfo.connect(lfoGain);
  lfoGain.connect(noiseGain.gain);
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(out);
  noiseSource.start();
  lfo.start();
  track(noiseSource, OWNER);
  track(lfo, OWNER);

  // Bouncy lounge riff — major pentatonic with a walking bass + kick/hat groove.
  const leadScale = [0, 2, 4, 7, 9, 12, 14, 16];
  const bassPattern = [0, 0, 7, 5, 0, 4, 7, 9];
  const baseFreq = 196; // G3
  let step = 0;
  const scheduleNote = () => {
    if (!playing) return;
    const t = ctx.currentTime + 0.02;
    const beat = step % 8;
    const bassSemi = bassPattern[beat];
    const bassFreq = baseFreq * Math.pow(2, bassSemi / 12);
    playTone(bassFreq / 2, t, 0.22, "triangle", 0.05);
    if (beat % 2 === 0) playKick(t);
    playHat(t);

    const leadSemi = leadScale[(step + Math.floor(step / 5)) % leadScale.length];
    const leadFreq = baseFreq * Math.pow(2, (leadSemi + 12) / 12);
    playTone(leadFreq, t, 0.16, "square", 0.018);
    if (beat === 3 || beat === 7) {
      playTone(leadFreq * 1.5, t + 0.08, 0.12, "triangle", 0.014);
    }
    step++;
  };
  scheduleNote();
  timer = setInterval(scheduleNote, 240);
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
