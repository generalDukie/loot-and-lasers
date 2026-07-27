// Procedural space-station ambience — trippy, upbeat, bustling.
// Routes through the shared audio engine (master/music/sfx + volume settings).
import { ensureAudio, getCtx, musicInput, track, stopOwned } from "@/lib/audioEngine";
import { stopCantina } from "@/lib/cantinaAudio";

const OWNER = "ambient";
let timers = [];
let playing = false;

export function startStationAmbient() {
  if (playing) return;
  stopCantina();
  const ctx = ensureAudio();
  if (!ctx) return;
  const music = musicInput();
  playing = true;
  timers = [];

  // --- Trippy pad: detuned oscillators through a moving lowpass filter ---
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 700;
  padFilter.Q.value = 6;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.03;
  padFilter.connect(padGain);
  padGain.connect(music);

  const roots = [110, 164.81]; // A2 + E3 (open fifth — dreamy)
  roots.forEach((f, i) => {
    [0, 6, 12].forEach((det) => {
      const osc = ctx.createOscillator();
      osc.type = i ? "triangle" : "sawtooth";
      osc.frequency.value = f;
      osc.detune.value = det;
      osc.connect(padFilter);
      osc.start();
      track(osc, OWNER);
    });
  });

  // Slow filter LFO — swirling, trippy movement
  const fLfo = ctx.createOscillator();
  fLfo.frequency.value = 0.08;
  const fLfoGain = ctx.createGain();
  fLfoGain.gain.value = 380;
  fLfo.connect(fLfoGain);
  fLfoGain.connect(padFilter.frequency);
  fLfo.start();
  track(fLfo, OWNER);

  // --- Bustle: bandpassed noise loop, gently modulated ---
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.012;
  noise.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(music);
  noise.start();
  track(noise, OWNER);
  const nLfo = ctx.createOscillator();
  nLfo.frequency.value = 0.25;
  const nLfoGain = ctx.createGain();
  nLfoGain.gain.value = 0.015;
  nLfo.connect(nLfoGain);
  nLfoGain.connect(noiseGain.gain);
  nLfo.start();
  track(nLfo, OWNER);

  // --- Echo bus for the bubbly arp + bleeps ---
  const delay = ctx.createDelay();
  delay.delayTime.value = 0.28;
  const delayFb = ctx.createGain();
  delayFb.gain.value = 0.32;
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0.15;
  delay.connect(delayFb);
  delayFb.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(music);

  // --- Upbeat bubbly arpeggio (minor pentatonic), pinged with delay ---
  const scale = [0, 3, 5, 7, 10, 12, 15, 17];
  const base = 220; // A3
  let step = 0;
  const playPluck = () => {
    if (!playing) return;
    const t = ctx.currentTime + 0.02;
    const note = scale[step % scale.length];
    const freq = base * Math.pow(2, note / 12);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.sin(step * 0.7) * 0.6;
      g.connect(pan);
      pan.connect(music);
      pan.connect(delay);
    } else {
      g.connect(music);
      g.connect(delay);
    }
    osc.start(t);
    osc.stop(t + 0.3);
    step++;
  };
  playPluck();
  timers.push(setInterval(playPluck, 260));

  // --- Sci-fi bleeps occasionally ---
  const playBleep = () => {
    if (!playing) return;
    const t = ctx.currentTime + 0.02;
    const f = [880, 1320, 1760][Math.floor(Math.random() * 3)];
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.012, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(music);
    g.connect(delay);
    osc.start(t);
    osc.stop(t + 0.2);
  };
  timers.push(setInterval(playBleep, 3400));
}

export function stopStationAmbient() {
  playing = false;
  timers.forEach((t) => clearInterval(t));
  timers = [];
  stopOwned(OWNER);
}

export function isStationAmbientPlaying() {
  return playing;
}