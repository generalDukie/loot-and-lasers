import { ensureAudio } from "@/lib/audioEngine";

// Vendor growl on a successful haggle — throaty rumble on the shared sfx bus.
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

/** Gruff merchant rumble when the player wins a haggle (no speech). */
export function playHaggleWinGrowl() {
  const eng = _eng();
  if (!eng) return;
  const { ctx, e } = eng;
  const t = ctx.currentTime + 0.001;
  const dest = e.sfx;
  const dur = 0.85;

  // Low chest growl
  const chest = ctx.createOscillator();
  chest.type = "sawtooth";
  chest.frequency.setValueAtTime(95, t);
  chest.frequency.linearRampToValueAtTime(130, t + dur * 0.55);
  chest.frequency.linearRampToValueAtTime(155, t + dur);
  const chestFilter = ctx.createBiquadFilter();
  chestFilter.type = "lowpass";
  chestFilter.frequency.setValueAtTime(420, t);
  chestFilter.frequency.linearRampToValueAtTime(780, t + dur);
  chestFilter.Q.value = 4;
  const chestGain = ctx.createGain();
  chestGain.gain.setValueAtTime(0.0001, t);
  chestGain.gain.linearRampToValueAtTime(0.14, t + 0.06);
  chestGain.gain.linearRampToValueAtTime(0.18, t + dur * 0.5);
  chestGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  chest.connect(chestFilter);
  chestFilter.connect(chestGain);
  chestGain.connect(dest);
  chest.start(t);
  chest.stop(t + dur + 0.05);

  // Second harmonic for a more "voice-like" rasp
  const rasp = ctx.createOscillator();
  rasp.type = "square";
  rasp.frequency.setValueAtTime(190, t);
  rasp.frequency.linearRampToValueAtTime(260, t + dur);
  const raspFilter = ctx.createBiquadFilter();
  raspFilter.type = "bandpass";
  raspFilter.frequency.setValueAtTime(520, t);
  raspFilter.frequency.linearRampToValueAtTime(900, t + dur);
  raspFilter.Q.value = 2.5;
  const raspGain = ctx.createGain();
  raspGain.gain.setValueAtTime(0.0001, t);
  raspGain.gain.linearRampToValueAtTime(0.05, t + 0.08);
  raspGain.gain.linearRampToValueAtTime(0.08, t + dur * 0.55);
  raspGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  rasp.connect(raspFilter);
  raspFilter.connect(raspGain);
  raspGain.connect(dest);
  rasp.start(t);
  rasp.stop(t + dur + 0.05);

  // Throaty noise texture
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, dur);
  const formant = ctx.createBiquadFilter();
  formant.type = "bandpass";
  formant.frequency.setValueAtTime(280, t);
  formant.frequency.linearRampToValueAtTime(480, t + dur * 0.4);
  formant.frequency.linearRampToValueAtTime(620, t + dur);
  formant.Q.value = 3.2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, t);
  noiseGain.gain.linearRampToValueAtTime(0.16, t + 0.05);
  noiseGain.gain.linearRampToValueAtTime(0.22, t + dur * 0.45);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  noise.connect(formant);
  formant.connect(noiseGain);
  noiseGain.connect(dest);
  noise.start(t);
  noise.stop(t + dur);

  // Subtle vibrato LFO on the chest gain
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 18;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.035;
  lfo.connect(lfoGain);
  lfoGain.connect(chestGain.gain);
  lfo.start(t);
  lfo.stop(t + dur);
}
