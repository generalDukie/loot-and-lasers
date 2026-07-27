import { ensureAudio } from "@/lib/audioEngine";

// Synthesized battle SFX routed through the shared audio engine's sfx bus.
function _eng() {
  const ctx = ensureAudio();
  const e = typeof window !== "undefined" && window.__ll_audio;
  return ctx && e ? { ctx, e } : null;
}

function playWhoosh(ctx, dest, t) {
  const dur = 0.22;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(280, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  noise.connect(filter); filter.connect(g); g.connect(dest);
  noise.start(t); noise.stop(t + dur);
}

function playStab(ctx, dest, t) {
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(1400, t);
  osc.frequency.exponentialRampToValueAtTime(500, t + 0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.1, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + 0.1);
}

function playLaser(ctx, dest, t) {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(1600, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  osc.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + 0.2);
}

const ABILITY_FREQS = {
  Vanguard: [220, 277, 330],
  "Shadow Operative": [440, 554, 622],
  Technomancer: [330, 415, 494],
  "Astral Warden": [392, 494, 587],
  "Cosmic Engineer": [294, 370, 440],
};

function playAbilityChord(ctx, dest, t, className) {
  const freqs = ABILITY_FREQS[className] || ABILITY_FREQS.Vanguard;
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + 0.5);
  });
}

// weaponType: "swing" | "stab" | "shoot" — drives the base attack SFX.
// isAbility: plays a dramatic class-specific chord instead of the weapon sound.
export function playAttackSound(weaponType, isAbility, className) {
  const eng = _eng();
  if (!eng) return;
  const { ctx, e } = eng;
  const t = ctx.currentTime + 0.001;
  if (isAbility) { playAbilityChord(ctx, e.sfx, t, className); return; }
  if (weaponType === "swing") playWhoosh(ctx, e.sfx, t);
  else if (weaponType === "stab") playStab(ctx, e.sfx, t);
  else playLaser(ctx, e.sfx, t);
}