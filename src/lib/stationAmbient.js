// Procedural space-station ambience — soft pad + looping Donovan McNab chant.
// Routes music through the shared audio engine; the chant uses speechSynthesis
// (volume scaled from master × music settings).
import { ensureAudio, getCtx, musicInput, track, stopOwned, getVolumes } from "@/lib/audioEngine";
import { stopCantina } from "@/lib/cantinaAudio";

const OWNER = "ambient";
let timers = [];
let playing = false;
let chantTimer = null;

function chantVolume() {
  const v = getVolumes();
  return Math.max(0, Math.min(1, (v.master / 100) * (v.music / 100) * 0.95));
}

function pickVoice() {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices?.() || [];
  const prefer = voices.find((x) => /en(-|_)?(US|GB|AU)?/i.test(x.lang) && /male|daniel|david|fred|google us/i.test(x.name))
    || voices.find((x) => /^en/i.test(x.lang))
    || voices[0];
  return prefer || null;
}

function speakLine(text, { rate = 1, pitch = 1, volume = 1 } = {}) {
  return new Promise((resolve) => {
    if (!playing || typeof speechSynthesis === "undefined") {
      resolve();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = pitch;
    u.volume = Math.max(0, Math.min(1, volume * chantVolume()));
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

async function runChantLoop() {
  while (playing) {
    // Spell it out, then the big cheer.
    await speakLine("D. O. N. O. V. A. N.", { rate: 0.92, pitch: 1.05 });
    if (!playing) break;
    await speakLine("Donovan McNab!", { rate: 1.08, pitch: 1.25 });
    if (!playing) break;
    // Short stadium breath before the next loop.
    await new Promise((r) => {
      chantTimer = setTimeout(r, 700);
    });
  }
}

function stopChant() {
  if (chantTimer) {
    clearTimeout(chantTimer);
    chantTimer = null;
  }
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

function playCrowdHit(freq = 90, dur = 0.18, gain = 0.045) {
  const ctx = getCtx();
  if (!ctx || !playing) return;
  const t = ctx.currentTime + 0.01;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(musicInput());
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function startStationAmbient() {
  if (playing) return;
  stopCantina();
  const ctx = ensureAudio();
  if (!ctx) return;
  const music = musicInput();
  playing = true;
  timers = [];
  stopChant();

  // Soft under-pad so the chant has room to land.
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 480;
  padFilter.Q.value = 3;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.018;
  padFilter.connect(padGain);
  padGain.connect(music);

  [98, 146.83].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = i ? "triangle" : "sine";
    osc.frequency.value = f;
    osc.connect(padFilter);
    osc.start();
    track(osc, OWNER);
  });

  // Simple stompy beat under the chant (boom — clap feel).
  let beat = 0;
  const tickBeat = () => {
    if (!playing) return;
    if (beat % 2 === 0) playCrowdHit(78, 0.2, 0.05);
    else playCrowdHit(220, 0.08, 0.02);
    beat++;
  };
  tickBeat();
  timers.push(setInterval(tickBeat, 420));

  // Some voices load async — retry once voices appear.
  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.onvoiceschanged = () => {};
    runChantLoop();
  }
}

export function stopStationAmbient() {
  playing = false;
  timers.forEach((t) => clearInterval(t));
  timers = [];
  stopChant();
  stopOwned(OWNER);
}

export function isStationAmbientPlaying() {
  return playing;
}
