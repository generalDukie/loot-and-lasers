import { ensureAudio } from "@/lib/audioEngine";

// Synthesized black-hole SFX — void suck + stardust burst on the shared sfx bus.
function _eng() {
  const ctx = ensureAudio();
  const e = typeof window !== "undefined" && window.__ll_audio;
  return ctx && e ? { ctx, e } : null;
}

function noiseBuffer(ctx, dur) {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Deep vacuum pull as gear spirals into the hole (~1.4s animation). */
export function playBlackHoleSuck() {
  const eng = _eng();
  if (!eng) return;
  const { ctx, e } = eng;
  const t = ctx.currentTime + 0.001;
  const dest = e.sfx;
  const dur = 1.35;

  // Falling sub-bass rumble
  const bass = ctx.createOscillator();
  bass.type = "sine";
  bass.frequency.setValueAtTime(90, t);
  bass.frequency.exponentialRampToValueAtTime(28, t + dur);
  const bassGain = ctx.createGain();
  bassGain.gain.setValueAtTime(0.0001, t);
  bassGain.gain.linearRampToValueAtTime(0.16, t + 0.08);
  bassGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  bass.connect(bassGain);
  bassGain.connect(dest);
  bass.start(t);
  bass.stop(t + dur + 0.05);

  // Bandpassed noise spiral (whoosh into the void)
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 2.2;
  filter.frequency.setValueAtTime(1400, t);
  filter.frequency.exponentialRampToValueAtTime(120, t + dur);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, t);
  noiseGain.gain.linearRampToValueAtTime(0.12, t + 0.12);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(dest);
  noise.start(t);
  noise.stop(t + dur);

  // Mid swirl tone
  const swirl = ctx.createOscillator();
  swirl.type = "sawtooth";
  swirl.frequency.setValueAtTime(220, t);
  swirl.frequency.exponentialRampToValueAtTime(55, t + dur * 0.9);
  const swirlFilter = ctx.createBiquadFilter();
  swirlFilter.type = "lowpass";
  swirlFilter.frequency.setValueAtTime(900, t);
  swirlFilter.frequency.exponentialRampToValueAtTime(180, t + dur);
  const swirlGain = ctx.createGain();
  swirlGain.gain.setValueAtTime(0.0001, t);
  swirlGain.gain.linearRampToValueAtTime(0.045, t + 0.15);
  swirlGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  swirl.connect(swirlFilter);
  swirlFilter.connect(swirlGain);
  swirlGain.connect(dest);
  swirl.start(t);
  swirl.stop(t + dur + 0.05);
}

/** Sparkle payoff when stardust erupts from the hole. */
export function playBlackHoleBurst() {
  const eng = _eng();
  if (!eng) return;
  const { ctx, e } = eng;
  const t = ctx.currentTime + 0.001;
  const dest = e.sfx;

  // Soft detonation thump
  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(140, t);
  thump.frequency.exponentialRampToValueAtTime(45, t + 0.22);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.0001, t);
  thumpGain.gain.linearRampToValueAtTime(0.11, t + 0.01);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  thump.connect(thumpGain);
  thumpGain.connect(dest);
  thump.start(t);
  thump.stop(t + 0.32);

  // Rising sparkle arpeggio
  const freqs = [660, 880, 1175, 1568];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const start = t + i * 0.045;
    osc.frequency.setValueAtTime(f, start);
    osc.frequency.exponentialRampToValueAtTime(f * 1.35, start + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(0.055, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(g);
    g.connect(dest);
    osc.start(start);
    osc.stop(start + 0.4);
  });

  // Short shimmer noise
  const shimmer = ctx.createBufferSource();
  shimmer.buffer = noiseBuffer(ctx, 0.35);
  const hi = ctx.createBiquadFilter();
  hi.type = "highpass";
  hi.frequency.value = 2800;
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.setValueAtTime(0.0001, t);
  shimmerGain.gain.linearRampToValueAtTime(0.06, t + 0.02);
  shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  shimmer.connect(hi);
  hi.connect(shimmerGain);
  shimmerGain.connect(dest);
  shimmer.start(t);
  shimmer.stop(t + 0.36);
}
