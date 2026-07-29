// ═══════════════════════════════════════════
// FUEL MOUNTS — temporary boosts that reduce mission completion time.
// Only the TIMER stacks (up to 3× base duration); the speed bonus does NOT
// stack — the strongest active mount's speed is what applies.
// Tiers 1–2 cost stardust only; tiers 3–4 cost stardust + Nova Crystals.
// ═══════════════════════════════════════════
import { getModEffectTotal } from "@/lib/gameData";

export const FUEL_MOUNTS = [
  { id: 1, name: "Ion Booster",        emoji: "⚡",  speed: 0.10, duration_hours: 1, stardust: 1200,  crystals: 0,  desc: "A quick ion burst for snappy errands." },
  { id: 2, name: "Plasma Thruster",    emoji: "🔥",  speed: 0.20, duration_hours: 2, stardust: 3000,  crystals: 0,  desc: "Sustained plasma acceleration." },
  { id: 3, name: "Warp Core",          emoji: "🌀",  speed: 0.30, duration_hours: 4, stardust: 5000,  crystals: 8,  desc: "Folds space for serious time savings." },
  { id: 4, name: "Singularity Drive",  emoji: "🌌",  speed: 0.45, duration_hours: 8, stardust: 10000, crystals: 20, desc: "Micro black hole propulsion. Terrifyingly fast." },
];

export const MAX_FUEL_MOUNTS = 3;
// Total time reduction is capped so a mission always takes some time.
const REDUCTION_CAP = 0.9;

export function getFuelMountById(id) {
  return FUEL_MOUNTS.find((m) => m.id === id) || null;
}

export function getActiveFuelMounts(character) {
  const now = Date.now();
  return (character?.active_fuel_mounts || []).filter(
    (m) => new Date(m.expires_at).getTime() > now
  );
}

// Speed does NOT stack — only the timer stacks. The strongest active mount's
// speed is what applies (kept as a single active entry; max is defensive).
export function getFuelSpeedTotal(character) {
  return getActiveFuelMounts(character).reduce((max, m) => Math.max(max, m.speed || 0), 0);
}

// Effective mission duration (seconds) after ship warp reduction + active fuel
// mounts. Ship-mod and fuel-mount reductions stack additively, capped.
export function getEffectiveMissionDuration(character, mission) {
  const warpReduction = getModEffectTotal(character, "mission_duration_reduction");
  const fuelSpeed = getFuelSpeedTotal(character);
  const totalReduction = Math.min(REDUCTION_CAP, warpReduction + fuelSpeed);
  const raw = Math.max(1, Math.floor((mission?.duration_seconds || 0) * (1 - totalReduction)));
  // Snap to the nearest 15s so mission times (and fuel, charged per minute)
  // always land on clean 15-second increments.
  return Math.max(15, Math.round(raw / 15) * 15);
}