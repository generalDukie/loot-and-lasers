import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Sparkles, TrendingUp, ArrowRight } from "lucide-react";
import GameplayOverlayPortal from "@/components/game/GameplayOverlayPortal";
import { api } from "@/api/gameClient";
import { spring } from "@/lib/goofyMotion";
import {
  computePermanentTotalStats,
  computeDerivedStats,
} from "@/lib/statEngine";
import { DUNGEON_UNLOCK_LEVELS } from "@/lib/dungeonEngine";
import { DUNGEON_PLANETS } from "@/lib/dungeonData";

const COMBAT_ROWS = [
  { key: "damage", label: "Damage", fmt: (v) => `${Math.round(v)}`, deltaFmt: (d) => `${d >= 0 ? "+" : ""}${Math.round(d)}` },
  { key: "health", label: "Max Health", fmt: (v) => `${Math.round(v)}`, deltaFmt: (d) => `${d >= 0 ? "+" : ""}${Math.round(d)}` },
  { key: "critChance", label: "Crit Chance", fmt: (v) => `${Number(v).toFixed(1)}%`, deltaFmt: (d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}%` },
  { key: "dodgeChance", label: "Dodge Chance", fmt: (v) => `${Number(v).toFixed(1)}%`, deltaFmt: (d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}%` },
  { key: "armor", label: "Armor", fmt: (v) => `${Number(v).toFixed(1)}%`, deltaFmt: (d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}%` },
  { key: "techResist", label: "Tech Resist", fmt: (v) => `${Number(v).toFixed(1)}%`, deltaFmt: (d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}%` },
];

function dungeonUnlocksBetween(fromLevel, toLevel) {
  const from = Math.max(1, Math.floor(Number(fromLevel) || 1));
  const to = Math.max(from, Math.floor(Number(toLevel) || from));
  const out = [];
  for (let id = 1; id <= 10; id++) {
    const need = DUNGEON_UNLOCK_LEVELS[id];
    if (need != null && need > from && need <= to) {
      const planet = DUNGEON_PLANETS.find((p) => p.id === id);
      out.push({ id, name: planet?.name || `Dungeon ${id}`, icon: planet?.icon || "🪐", level: need });
    }
  }
  return out;
}

/** Build a pending level-up payload from a mission/combat complete summary. */
export function pendingLevelUpFromSummary(summary) {
  const prog = summary?.progression;
  if (prog && Number(prog.levels_gained) > 0) {
    return {
      fromLevel: Math.floor(Number(prog.previous_level)),
      toLevel: Math.floor(Number(prog.level)),
      attributeAwards: Array.isArray(prog.attribute_awards) ? prog.attribute_awards : [],
    };
  }
  if (!summary?.leveledUp || !summary.newLevel) return null;
  const to = Math.floor(Number(summary.newLevel));
  const from = Math.floor(Number(summary.prevLevel ?? to - 1));
  if (!(to > from)) return null;
  return {
    fromLevel: from,
    toLevel: to,
    attributeAwards: Array.isArray(summary.attribute_awards) ? summary.attribute_awards : [],
  };
}

/**
 * Content-area level-up sheet (GameplayOverlayPortal — centered on the page,
 * not under/over the side nav). Shown after mission/combat complete is confirmed.
 */
export default function LevelUpOverlay({
  open,
  fromLevel,
  toLevel,
  character,
  onConfirm,
  attributeAwards = [],
}) {
  const [equipped, setEquipped] = useState([]);

  const awardLine = useMemo(() => {
    if (!Array.isArray(attributeAwards) || !attributeAwards.length) return "";
    const tallies = {};
    for (const entry of attributeAwards) {
      const stat = String(entry?.stat || "").trim();
      if (!stat) continue;
      tallies[stat] = (tallies[stat] || 0) + 1;
    }
    return ["strength", "agility", "intellect", "vitality", "luck"]
      .filter((k) => tallies[k])
      .map((k) => `+${tallies[k]} ${k}`)
      .join(", ");
  }, [attributeAwards]);

  useEffect(() => {
    if (!open || !character?.id) {
      setEquipped([]);
      return undefined;
    }
    let cancelled = false;
    api.entities.Item.filter({ character_id: character.id })
      .then((all) => {
        if (!cancelled) setEquipped((all || []).filter((i) => i.is_equipped));
      })
      .catch(() => {
        if (!cancelled) setEquipped([]);
      });
    return () => { cancelled = true; };
  }, [open, character?.id]);

  useEffect(() => {
    if (!open || document.hidden) return undefined;
    confetti({
      particleCount: 90,
      spread: 75,
      startVelocity: 38,
      origin: { x: 0.5, y: 0.4 },
      colors: ["#FBBF24", "#F59E0B", "#00E5FF", "#FDE68A"],
    });
    return () => { confetti.reset(); };
  }, [open, fromLevel, toLevel]);

  const rows = useMemo(() => {
    if (!open || !character) return [];
    const totals = computePermanentTotalStats(character, equipped);
    const before = computeDerivedStats(totals, { ...character, level: fromLevel });
    const after = computeDerivedStats(totals, { ...character, level: toLevel });
    return COMBAT_ROWS.map((row) => {
      const a = Number(before[row.key]) || 0;
      const b = Number(after[row.key]) || 0;
      const delta = b - a;
      return { ...row, before: a, after: b, delta, changed: Math.abs(delta) >= 0.05 };
    });
  }, [open, character, equipped, fromLevel, toLevel]);

  const unlocks = useMemo(
    () => (open ? dungeonUnlocksBetween(fromLevel, toLevel) : []),
    [open, fromLevel, toLevel],
  );

  if (!open) return null;

  return (
    <GameplayOverlayPortal
      className="z-[90] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring}
        className="relative w-full max-w-md max-h-[88%] overflow-y-auto rounded-2xl border border-amber-400/40 painted-panel painted-frame canvas-grain p-5"
        style={{ boxShadow: "0 0 36px hsl(38 95% 50% / 0.22)" }}
        role="dialog"
        aria-labelledby="level-up-title"
      >
        <div className="text-center mb-4">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring, delay: 0.05 }}
            className="mx-auto mb-2 w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: "hsl(38 90% 50% / 0.18)",
              boxShadow: "0 0 22px hsl(38 95% 50% / 0.4)",
            }}
          >
            <Sparkles className="w-6 h-6 text-amber-300" />
          </motion.div>
          <h2 id="level-up-title" className="font-display font-bold text-lg tracking-[0.22em] text-amber-300">
            LEVEL UP
          </h2>
          <div className="mt-2 flex items-center justify-center gap-2 font-display font-black tabular-nums">
            <span className="text-xl text-muted-foreground">{fromLevel}</span>
            <ArrowRight className="w-4 h-4 text-amber-400/80" />
            <span
              className="text-3xl text-amber-300"
              style={{ textShadow: "0 0 20px hsl(38 95% 55% / 0.55)" }}
            >
              {toLevel}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
			Soft-capped combat stats scale with level. Permanent attributes are awarded
            automatically on level-up; buy more with Stardust anytime.
          </p>
          {awardLine ? (
            <p className="text-[12px] font-display font-semibold text-amber-300 mt-2">{awardLine}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border/50 bg-card/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-display font-semibold tracking-wide text-muted-foreground uppercase">
            <TrendingUp className="w-3 h-3 text-amber-400" /> Combat stats
          </div>
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-muted-foreground truncate">{row.label}</span>
              <span className="flex items-center gap-1.5 tabular-nums shrink-0 font-display font-semibold">
                <span className="text-muted-foreground/80">{row.fmt(row.before)}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                <span className={row.changed ? "text-amber-200" : "text-foreground"}>{row.fmt(row.after)}</span>
                {row.changed ? (
                  <span className="text-[10px] text-green-400 w-12 text-right">{row.deltaFmt(row.delta)}</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50 w-12 text-right">—</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {unlocks.length > 0 && (
          <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
            <p className="text-[10px] font-display font-semibold tracking-wide text-cyan-300 uppercase mb-1.5">
              Newly unlocked
            </p>
            <ul className="space-y-1">
              {unlocks.map((u) => (
                <li key={u.id} className="text-xs text-foreground/90 flex items-center gap-1.5">
                  <span>{u.icon}</span>
                  <span className="font-medium">{u.name}</span>
                  <span className="text-muted-foreground text-[10px]">· Lv {u.level}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={onConfirm}
          className="w-full mt-4 painted-btn py-2.5 text-sm font-display font-bold tracking-wide"
        >
          Confirm
        </button>
      </motion.div>
    </GameplayOverlayPortal>
  );
}
