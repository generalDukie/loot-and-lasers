// Shared audio engine — one AudioContext persisted on `window` (survives HMR),
// master/music/sfx gain busses, persisted volume settings, a global node
// registry so stale instances can be torn down, and a global click SFX.

const STORAGE_KEY = "ll_audio_volumes";
const DEFAULTS = { master: 80, music: 55, sfx: 70 };

const listeners = new Set();
let volumes = loadVolumes();

function loadVolumes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULTS };
}

function getEngine() {
  if (typeof window !== "undefined" && window.__ll_audio) return window.__ll_audio;
  const AC = (typeof window !== "undefined") && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  music.connect(master);
  sfx.connect(master);
  master.connect(ctx.destination);
  const engine = { ctx, master, music, sfx, nodes: new Set() };
  if (typeof window !== "undefined") window.__ll_audio = engine;
  applyVolumes();
  return engine;
}

function saveVolumes(v) {
  volumes = v;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch (e) {}
  applyVolumes();
  listeners.forEach((fn) => fn(volumes));
}

function applyVolumes() {
  const e = (typeof window !== "undefined") && window.__ll_audio;
  if (!e) return;
  const t = e.ctx.currentTime;
  e.master.gain.cancelScheduledValues(t);
  e.music.gain.cancelScheduledValues(t);
  e.sfx.gain.cancelScheduledValues(t);
  // 0 = silence, 100 = full internal gain.
  e.master.gain.setValueAtTime(volumes.master / 100, t);
  e.music.gain.setValueAtTime(volumes.music / 100, t);
  e.sfx.gain.setValueAtTime(volumes.sfx / 100, t);
}

export function getVolumes() {
  return { ...volumes };
}

export function setVolumes(partial) {
  // Ensure the AudioContext is live within this user gesture before applying.
  ensureAudio();
  saveVolumes({ ...volumes, ...partial });
}

export function subscribeVolumes(fn) {
  listeners.add(fn);
  fn(volumes);
  return () => listeners.delete(fn);
}

export function ensureAudio() {
  const e = getEngine();
  if (!e) return null;
  if (e.ctx.state === "suspended") e.ctx.resume();
  return e.ctx;
}

export function getCtx() {
  const e = (typeof window !== "undefined") && window.__ll_audio;
  return e ? e.ctx : null;
}

export function musicInput() {
  ensureAudio();
  return window.__ll_audio.music;
}

export function sfxInput() {
  ensureAudio();
  return window.__ll_audio.sfx;
}

// Track a persistent audio node with an owner tag so it can be torn down
// later (even across HMR). Each soundtrack stops only its own nodes.
export function track(node, owner) {
  const e = (typeof window !== "undefined") && window.__ll_audio;
  if (e) e.nodes.add({ node, owner });
  return node;
}

// Stop + disconnect every tracked node belonging to `owner`.
export function stopOwned(owner) {
  const e = (typeof window !== "undefined") && window.__ll_audio;
  if (!e) return;
  e.nodes.forEach((entry) => {
    if (entry.owner !== owner) return;
    try { entry.node.stop && entry.node.stop(); } catch (err) {}
    try { entry.node.disconnect && entry.node.disconnect(); } catch (err) {}
    e.nodes.delete(entry);
  });
}

// Click SFX — short, bright blip.
export function playClick() {
  const e = (typeof window !== "undefined") && window.__ll_audio;
  const ctx = ensureAudio();
  if (!ctx || !e) return;
  const t = ctx.currentTime + 0.001;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(420, t + 0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(g);
  g.connect(e.sfx);
  osc.start(t);
  osc.stop(t + 0.1);
}

// Mission-complete fanfare — a triumphant ascending trumpet-like arpeggio
// followed by a sustained chord. Routed through the sfx bus.
export function playMissionComplete() {
  const e = (typeof window !== "undefined") && window.__ll_audio;
  const ctx = ensureAudio();
  if (!ctx || !e) return;
  const t = ctx.currentTime + 0.02;
  // Ascending arpeggio: C-E-G-C (523, 659, 784, 1047)
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const start = t + i * 0.12;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(0.14, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
    osc.connect(g);
    g.connect(e.sfx);
    osc.start(start);
    osc.stop(start + 0.3);
  });
  // Sustained final chord (C+E+G) overlapping the last note
  const chordStart = t + 0.48;
  [523, 659, 784].forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, chordStart);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, chordStart);
    g.gain.linearRampToValueAtTime(0.08, chordStart + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.8);
    osc.connect(g);
    g.connect(e.sfx);
    osc.start(chordStart);
    osc.stop(chordStart + 0.85);
  });
}

if (typeof window !== "undefined" && !window.__ll_listeners) {
  window.__ll_listeners = true;
  const ensure = () => ensureAudio();
  window.addEventListener("pointerdown", ensure, true);
  window.addEventListener("keydown", ensure, true);

  // Play a click sound whenever an interactive element is pressed.
  window.addEventListener("pointerdown", (e) => {
    const el = e.target.closest && e.target.closest(
      'button, a, [role="button"], [role="slider"], input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"]'
    );
    if (el) playClick();
  }, true);
}