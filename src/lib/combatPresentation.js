/**
 * Combat presentation helpers (Restoration 29).
 * Observes combat events only — never mutates gameplay or combat authority.
 */

import { STAT_COLORS } from "@/lib/gameData";

const DEV_KEY = "ll_combat_dev_diagnostics";

/**
 * Damage float colors derive from Hero attribute panes (STAT_COLORS).
 * Might ← strength, Reflex ← agility, Tech ← intellect, True ← white.
 */
export const DAMAGE_TYPE_COLORS = Object.freeze({
  MIGHT: STAT_COLORS.strength,
  REFLEX: STAT_COLORS.agility,
  TECH: STAT_COLORS.intellect,
  TRUE: "#FFFFFF",
  HEAL: "#86EFAC",
  BARRIER: "#67E8F9",
  NORMAL: "#FCA5A5",
});

/** Floater px sizes — damage +50% over prior 18px; crit = 2× enlarged normal. */
export const FLOAT_FONT_PX = Object.freeze({
  other: 18,
  damage: 27,
  crit: 54,
});

const CRIT_DARKEN = 0.18;

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Slightly darken a #RRGGBB hex (Crit presentation only). */
export function darkenHex(hex, amount = CRIT_DARKEN) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length < 6) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const f = 1 - Math.max(0, Math.min(1, amount));
  return `#${[r, g, b].map((c) => clampByte(c * f).toString(16).padStart(2, "0")).join("")}`;
}

/** Color for a damage event from its damageType field (not attacker class). */
export function damageTypeColor(dtype, isCrit = false) {
  const key = String(dtype || "NORMAL").toUpperCase();
  const base =
    key === "TRUE"
      ? DAMAGE_TYPE_COLORS.TRUE
      : key === "TECH"
        ? DAMAGE_TYPE_COLORS.TECH
        : key === "REFLEX"
          ? DAMAGE_TYPE_COLORS.REFLEX
          : key === "MIGHT"
            ? DAMAGE_TYPE_COLORS.MIGHT
            : DAMAGE_TYPE_COLORS.NORMAL;
  // True Damage cannot Crit under combat rules — never apply Crit darken.
  if (isCrit && key !== "TRUE") return darkenHex(base, CRIT_DARKEN);
  return base;
}

export function isCombatDevDiagnosticsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem(DEV_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  // Dev builds only: ?combatDev=1 once enables for the session via localStorage.
  try {
    if (import.meta.env?.DEV && typeof window.location !== "undefined") {
      const q = new URLSearchParams(window.location.search);
      if (q.get("combatDev") === "1") {
        window.localStorage?.setItem(DEV_KEY, "1");
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function setCombatDevDiagnosticsEnabled(on) {
  try {
    if (on) window.localStorage?.setItem(DEV_KEY, "1");
    else window.localStorage?.removeItem(DEV_KEY);
  } catch {
    /* ignore */
  }
  return isCombatDevDiagnosticsEnabled();
}

function emptySide() {
  return {
    barrier: 0,
    barrierMax: 0,
    phantomCharges: 0,
    overclockStacks: 0,
    dirtyTrick: null,
    kineticTantrum: null,
    stimAttacksLeft: null,
    droneReady: false,
    lastPassive: null,
  };
}

/**
 * Reduce events[0..upToInclusive] into persistent combat status for HUD icons.
 */
export function reduceCombatStatus(events = [], upToInclusive = -1) {
  const state = { player: emptySide(), opponent: emptySide() };
  const end = Math.min(events.length - 1, upToInclusive);
  for (let i = 0; i <= end; i++) {
    const ev = events[i];
    if (!ev) continue;
    applyEventToStatus(state, ev);
  }
  return state;
}

function sideKey(ev) {
  return ev.side || ev.defender || ev.attacker || null;
}

function applyEventToStatus(state, ev) {
  const kind = ev.kind || ev.missKind || "";
  const side = sideKey(ev);
  const slot = side === "player" || side === "opponent" ? state[side] : null;

  if (kind === "astral_barrier_created" || kind === "astral_barrier_restored") {
    if (slot) {
      slot.barrier = Number(ev.barrier) || Number(ev.barrierMax) || 0;
      slot.barrierMax = Number(ev.barrierMax) || slot.barrier;
      slot.lastPassive = "Astral Barrier";
    }
    return;
  }
  if (ev.type === "barrier") {
    const s = state[ev.side];
    if (!s) return;
    if (typeof ev.barrierRemaining === "number") s.barrier = ev.barrierRemaining;
    if (kind === "barrier_broken") {
      s.barrier = 0;
    }
    return;
  }
  if (kind === "phantom_signal_armed") {
    if (slot) {
      slot.phantomCharges = Number(ev.charges) || 2;
      slot.lastPassive = "Phantom Signal";
    }
    return;
  }
  if (kind === "phantom_signal_miss" || (ev.type === "miss" && ev.missKind === "phantom_signal")) {
    const def = state[ev.defender];
    if (def && typeof ev.chargesRemaining === "number") {
      def.phantomCharges = ev.chargesRemaining;
    } else if (def) {
      def.phantomCharges = Math.max(0, (def.phantomCharges || 0) - 1);
    }
    return;
  }
  if (kind === "overclock_stack_gained" || kind === "overclock_ready") {
    if (slot) {
      slot.overclockStacks = Number(ev.stacks) || 0;
      slot.lastPassive = "Overclock";
    }
    return;
  }
  if (kind === "overclock_stacks_removed") {
    if (slot) slot.overclockStacks = Number(ev.stacks) || 0;
    return;
  }
  if (kind === "dirty_trick_selected" || ev.dirtyTrick) {
    if (slot) {
      slot.dirtyTrick = ev.dirtyTrick || slot.dirtyTrick;
      slot.lastPassive = "Dirty Tricks";
    }
    return;
  }
  if (kind === "kinetic_tantrum_strong" || kind === "kinetic_tantrum_normal") {
    if (slot) {
      slot.kineticTantrum = ev.kineticTantrum || (kind.includes("strong") ? "strong" : "normal");
      slot.lastPassive = "Kinetic Tantrum";
    }
    return;
  }
  if (kind === "kinetic_tantrum_consumed" || kind === "kinetic_tantrum_blocked_downgrade") {
    if (slot && kind === "kinetic_tantrum_consumed") slot.kineticTantrum = null;
    return;
  }
  if (ev.passive === "Orbital Assistant" || kind?.includes?.("orbital") || kind?.includes?.("drone") || kind?.includes?.("fire_support") || kind?.includes?.("defensive_protocol") || kind?.includes?.("acquire_target")) {
    if (slot) {
      slot.droneReady = true;
      slot.lastPassive = "Orbital Assistant";
    }
  }
}

function otherFloater(kind, label, color) {
  return {
    kind,
    label,
    color,
    fontSize: FLOAT_FONT_PX.other,
    bold: false,
    crit: false,
  };
}

/** Floater presentation for a single event (defender-facing). */
export function resolveCombatFloater(ev) {
  if (!ev) return null;
  if (ev.heal) {
    return otherFloater("heal", `+${ev.heal}`, DAMAGE_TYPE_COLORS.HEAL);
  }
  if (ev.dodged || ev.type === "dodge") {
    return otherFloater("dodge", "DODGE", "#67E8F9");
  }
  if (ev.type === "miss" || ev.missed) {
    if (ev.missKind === "phantom_signal" || ev.kind === "phantom_signal_miss") {
      return otherFloater("forced_miss", "FORCED MISS", "#C084FC");
    }
    return otherFloater("miss", "MISS", "#94A3B8");
  }
  if (ev.type === "barrier" && ev.kind === "barrier_broken") {
    return otherFloater("barrier_break", "BARRIER BREAK", DAMAGE_TYPE_COLORS.BARRIER);
  }
  if (ev.type === "barrier" && ev.kind === "barrier_absorbed") {
    return otherFloater("barrier", `SHIELD −${ev.absorbed || 0}`, DAMAGE_TYPE_COLORS.BARRIER);
  }
  if (ev.shieldHit && !(ev.damage > 0)) {
    return otherFloater("barrier", "BLOCK", DAMAGE_TYPE_COLORS.BARRIER);
  }
  if (ev.damage > 0) {
    const dtype = String(ev.damageType || "NORMAL").toUpperCase();
    // True Damage cannot Crit — ignore a stray crit flag for presentation.
    const isCrit = !!ev.crit && dtype !== "TRUE";
    const color = damageTypeColor(dtype, isCrit);
    const prefix = dtype === "TRUE" ? "TRUE " : isCrit ? "CRIT " : "";
    const shieldNote = ev.shieldHit && ev.barrierAbsorbed ? ` · SHIELD −${ev.barrierAbsorbed}` : "";
    return {
      kind: isCrit ? "crit" : dtype === "TRUE" ? "true" : "damage",
      label: `${prefix}−${ev.damage}${shieldNote}`,
      color,
      damageType: dtype,
      fontSize: isCrit ? FLOAT_FONT_PX.crit : FLOAT_FONT_PX.damage,
      bold: isCrit,
      crit: isCrit,
    };
  }
  if (ev.type === "passive") {
    return otherFloater("buff", "✦", "#C084FC");
  }
  return null;
}

export function formatCombatLogLine(ev, i) {
  if (!ev) return `#${i} —`;
  if (ev.text) return `#${i + 1} ${ev.text}`;
  if (ev.heal) return `#${i + 1} ${ev.defender} heals ${ev.heal}`;
  if (ev.dodged || ev.type === "dodge") return `#${i + 1} ${ev.defender} DODGES`;
  if (ev.type === "miss" || ev.missed) {
    const forced = ev.missKind === "phantom_signal" ? "FORCED MISS" : "MISS";
    return `#${i + 1} ${forced} vs ${ev.defender}`;
  }
  if (ev.damage > 0) {
    const bits = [
      `#${i + 1}`,
      ev.attacker,
      "→",
      ev.defender,
      ev.crit ? "CRIT" : null,
      ev.damageType || null,
      `−${ev.damage}`,
      ev.shieldHit ? "shield" : null,
    ].filter(Boolean);
    return bits.join(" ");
  }
  if (ev.type === "barrier") return `#${i + 1} ${ev.text || ev.kind || "barrier"}`;
  if (ev.passive || ev.type === "passive") {
    return `#${i + 1} ${ev.passive || "passive"} ${ev.kind || ""}`.trim();
  }
  return `#${i + 1} ${ev.type || "event"}`;
}

export function dirtyTrickLabel(trick) {
  if (!trick) return null;
  const map = {
    flashbang: "Flashbang",
    targeting_beacon: "Targeting Beacon",
    stim_injector: "Stim Injector",
  };
  return map[trick] || String(trick).replace(/_/g, " ");
}
