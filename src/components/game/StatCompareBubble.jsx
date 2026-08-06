import React from "react";
import { Unlock, Swords, Recycle, FlaskConical } from "lucide-react";
import { RARITY_COLORS, computeStardustValue, CLASSES, STARDUST_COLOR } from "@/lib/gameData";
import StatIcon, { StatIconLabel, STAT_PRESENTATION } from "@/components/game/StatIcon";
import StardustIcon from "@/components/game/StardustIcon";
import NeonLockIcon from "@/components/game/NeonLockIcon";
import { EQUIPPABLE_TYPES } from "@/lib/inventoryJunk";

const STATS = ["strength", "agility", "intellect", "vitality", "luck"];

/** Raw integer attr on an item (display values). Missing → 0. */
function attrValue(item, stat) {
  return Math.floor(Number(item?.stats?.[stat]) || 0);
}

/**
 * Authoritative gear attribute comparison — raw differences only.
 * No class weighting, rarity, or combat-power scoring.
 * @returns {{ strength: number, agility: number, intellect: number, vitality: number, luck: number, total: number }}
 */
export function compareGearAttributes(hoveredItem, equippedItem) {
  const out = { strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0, total: 0 };
  let total = 0;
  for (const s of STATS) {
    const d = attrValue(hoveredItem, s) - attrValue(equippedItem, s);
    out[s] = d;
    total += d;
  }
  out.total = total;
  return out;
}

/** Format a raw delta for presentation (no arrows / verdict words). */
export function formatStatDelta(delta) {
  const d = Math.trunc(Number(delta) || 0);
  if (d > 0) return { text: `+${d}`, tone: "pos" };
  if (d < 0) return { text: `${d}`, tone: "neg" };
  return { text: "0", tone: "zero" };
}

const DELTA_TONE = {
  pos: "text-green-400",
  neg: "text-red-400",
  zero: "text-muted-foreground",
};

// Class-aware stat weights — kept for dissolve-junk / shop helpers that still
// need a power heuristic. Presentation no longer uses this for gear verdicts.
export function classStatWeights(className) {
  const cls = CLASSES[className];
  const w = { strength: 1, agility: 1, intellect: 1, vitality: 1.5, luck: 1 };
  if (cls) {
    if (cls.primaryStat) w[cls.primaryStat] = 3;
    if (cls.secondaryStat) w[cls.secondaryStat] = 2;
  }
  return w;
}

// Items are already rarity-scaled at generation, so the power rating uses
// raw stat values directly — no second multiplier. Stats are weighted by the
// character's class (used by junk heuristics, not comparison UI).
export function powerRating(item, className) {
  const w = classStatWeights(className);
  const sum = STATS.reduce((a, s) => a + (item.stats?.[s] || 0) * w[s], 0);
  return Math.round(sum * 10);
}

// Rich RPG-style comparison tooltip. Shows the hovered item beside the
// currently equipped piece with per-attribute raw deltas and a raw total.
export default function StatCompareBubble({ item, equipped, onEquip, onSell, onUse, onLock, characterClass, className = "" }) {
  const color = RARITY_COLORS[item.rarity] || "#9CA3AF";
  const locked = !!item.locked;
  const canEquip = EQUIPPABLE_TYPES.includes(item.type);
  const isStim = item.type === "consumable" && !!item.consumable;
  const diffs = equipped || canEquip ? compareGearAttributes(item, equipped || null) : null;
  void characterClass;

  return (
    <div className={`w-80 max-w-[min(100vw-1.5rem,22rem)] rounded-xl border border-border/60 bg-popover/95 backdrop-blur-md p-3 shadow-2xl border-glow-cyan pointer-events-auto ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display font-bold text-sm truncate" style={{ color }}>{item.name}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{item.rarity} · {item.type} · Lv.{item.level_requirement}</p>
        </div>
        <button
          onClick={() => onLock?.(item)}
          title={locked ? "Unlock" : "Lock"}
          className={`p-1 rounded-md transition-colors ${locked ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
        >
          {locked ? <NeonLockIcon className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Currently equipped gear — the exact piece this item would replace */}
      {equipped ? (
        <div className="mt-2 rounded-lg bg-muted/15 border border-border/30 p-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-display font-semibold text-muted-foreground tracking-wide">CURRENTLY EQUIPPED</p>
            <span className="text-[10px] text-primary font-bold">EQ</span>
          </div>
          <p className="text-[11px] font-display font-semibold truncate mt-0.5" style={{ color: RARITY_COLORS[equipped.rarity] || "#9CA3AF" }}>{equipped.name}</p>
          {equipped.stats && Object.keys(equipped.stats).length > 0 && (
            <div className={STAT_PRESENTATION.tooltipEquipped.wrap}>
              {STATS.filter((s) => (equipped.stats?.[s] || 0) > 0).map((s) => (
                <StatIconLabel
                  key={s}
                  stat={s}
                  presentation="tooltipEquipped"
                  valueClassName={`${STAT_PRESENTATION.tooltipEquipped.value} text-muted-foreground`}
                >
                  +{equipped.stats[s]}
                </StatIconLabel>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Stat comparison — item value + compact raw delta (no arrows) */}
      <div className={`mt-2 ${STAT_PRESENTATION.tooltip.wrap}`}>
        {STATS.map((s) => {
          const v = attrValue(item, s);
          const e = attrValue(equipped, s);
          if (!v && !e) return null;
          const d = diffs ? diffs[s] : v - e;
          const delta = formatStatDelta(d);
          return (
            <div key={s} className="flex items-center justify-between gap-2 min-w-0">
              <span className={`text-muted-foreground inline-flex items-center ${STAT_PRESENTATION.tooltip.gap} min-w-0`}>
                <StatIcon stat={s} presentation="tooltip" />
                <span className={STAT_PRESENTATION.tooltip.label}>{s.slice(0, 3).toUpperCase()}</span>
              </span>
              <span className="flex items-center gap-2.5 shrink-0 tabular-nums">
                <span className={STAT_PRESENTATION.tooltip.value} style={{ color: v > 0 ? color : "#6b7280" }}>
                  {v > 0 ? `+${v}` : "0"}
                </span>
                {(equipped || canEquip) && (
                  <span className={`font-semibold w-10 text-right text-[12px] ${DELTA_TONE[delta.tone]}`}>
                    {delta.text}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Special effects */}
      {item.type === "consumable" && item.consumable && (
        <p className="text-[10px] text-primary mt-2 pt-2 border-t border-border/40 inline-flex items-center gap-1.5 flex-wrap">
          <StatIcon stat={item.consumable.stat} presentation="tooltipEquipped" /> +{Math.round(item.consumable.mult * 100)}% {item.consumable.stat} · {item.consumable.duration_hours}h buff
        </p>
      )}
      {item.set_name && (
        <p className="text-[10px] text-accent mt-1">⛓ {item.set_name} Set</p>
      )}
      {item.flavor_text && (
        <p className="text-[9px] italic text-muted-foreground mt-1">"{item.flavor_text}"</p>
      )}

      {/* Footer — raw total only (no better/worse judgment) */}
      {item.is_equipped && !equipped ? (
        <p className="text-[10px] text-primary mt-2 pt-2 border-t border-border/40 font-display font-bold tracking-wide">
          CURRENTLY EQUIPPED
        </p>
      ) : diffs && canEquip ? (
        <p className="text-[10px] font-display font-bold mt-2 pt-2 border-t border-border/40 flex items-center gap-1.5 flex-wrap">
          <span className="text-muted-foreground tracking-wide">TOTAL STAT CHANGE:</span>
          <span className={`tabular-nums ${DELTA_TONE[formatStatDelta(diffs.total).tone]}`}>
            {formatStatDelta(diffs.total).text}
          </span>
        </p>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/40">
        {isStim && onUse && (
          <button onClick={() => onUse(item)} className="flex items-center gap-1 text-[10px] bg-accent/15 hover:bg-accent/25 text-accent px-2 py-1 rounded-md font-medium transition-colors">
            <FlaskConical className="w-3 h-3" /> Use
          </button>
        )}
        {canEquip && onEquip && !item.is_equipped && (
          <button onClick={() => onEquip(item)} className="flex items-center gap-1 text-[10px] bg-primary/15 hover:bg-primary/25 text-primary px-2 py-1 rounded-md font-medium transition-colors">
            <Swords className="w-3 h-3" /> Equip
          </button>
        )}
        {canEquip && onEquip && item.is_equipped && (
          <button onClick={() => onEquip(item)} className="flex items-center gap-1 text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground px-2 py-1 rounded-md font-medium transition-colors">
            Unequip
          </button>
        )}
        {onSell && !item.is_equipped && !locked && (
          <button onClick={() => onSell(item)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-medium transition-colors hover:opacity-90" style={{ color: STARDUST_COLOR, backgroundColor: `${STARDUST_COLOR}26` }}>
            <Recycle className="w-3 h-3" /> Dissolve {computeStardustValue(item)}<StardustIcon className="w-3 h-3 inline align-text-bottom" glow={false} />
          </button>
        )}
        {locked && (
          <span className="text-[10px] text-amber-400/80 px-2 py-1 flex items-center justify-center gap-1">
            <NeonLockIcon className="w-3 h-3" /> Locked
          </span>
        )}
      </div>
    </div>
  );
}
