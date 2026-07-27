import React from "react";
import { TrendingUp, TrendingDown, Minus, Lock, Unlock, Swords, Recycle, Coins, Power } from "lucide-react";
import { STAT_ICONS, RARITY_COLORS, computeStardustValue, CLASSES } from "@/lib/gameData";

const STATS = ["strength", "agility", "intellect", "vitality", "luck"];

// Class-aware stat weights — each class's primary stat counts most, secondary
// next; vitality always carries a little defensive value. Different classes
// value different stats, so the same item can be an upgrade for one class and
// a downgrade for another.
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
// character's class so the verdict reflects what actually matters to them.
export function powerRating(item, className) {
  const w = classStatWeights(className);
  const sum = STATS.reduce((a, s) => a + (item.stats?.[s] || 0) * w[s], 0);
  return Math.round(sum * 10);
}

// Rich RPG-style comparison tooltip. Shows the hovered item side by side with
// the currently equipped item in the same slot, with stat deltas, % changes,
// a power rating, an overall verdict, and quick action buttons.
export default function StatCompareBubble({ item, equipped, onEquip, onSell, onLock, characterClass }) {
  const color = RARITY_COLORS[item.rarity] || "#9CA3AF";
  const myPower = powerRating(item, characterClass);
  const eqPower = equipped ? powerRating(equipped, characterClass) : 0;
  const powerDelta = myPower - eqPower;
  const verdict = equipped ? (powerDelta > 0 ? "better" : powerDelta < 0 ? "worse" : "equal") : "new";
  const locked = !!item.locked;

  return (
    <div className="w-72 rounded-xl border border-border/60 bg-popover/95 backdrop-blur-md p-3 shadow-2xl border-glow-cyan pointer-events-auto">
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
          {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Power rating */}
      <div className="flex items-center justify-between mt-2 px-2 py-1.5 rounded-lg bg-muted/20 border border-border/30">
        <span className="flex items-center gap-1 text-[10px] font-display tracking-wide text-muted-foreground"><Power className="w-3 h-3" /> POWER</span>
        <span className="flex items-center gap-1.5">
          <span className="font-display font-bold text-sm" style={{ color }}>{myPower}</span>
          {equipped ? (
            <span className={`flex items-center gap-0.5 text-[10px] font-bold ${powerDelta > 0 ? "text-green-400" : powerDelta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
              {powerDelta > 0 ? <TrendingUp className="w-3 h-3" /> : powerDelta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {powerDelta > 0 ? `+${powerDelta}` : powerDelta < 0 ? powerDelta : "="}
            </span>
          ) : (
            <span className="text-[10px] text-green-400 font-bold">NEW</span>
          )}
        </span>
      </div>

      {/* Currently equipped gear — the exact piece this item would replace */}
      {equipped ? (
        <div className="mt-2 rounded-lg bg-muted/15 border border-border/30 p-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-display font-semibold text-muted-foreground tracking-wide">CURRENTLY EQUIPPED</p>
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><Power className="w-3 h-3" />{eqPower}</span>
          </div>
          <p className="text-[11px] font-display font-semibold truncate mt-0.5" style={{ color: RARITY_COLORS[equipped.rarity] || "#9CA3AF" }}>{equipped.name}</p>
          {equipped.stats && Object.keys(equipped.stats).length > 0 && (
            <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1">
              {STATS.filter((s) => (equipped.stats?.[s] || 0) > 0).map((s) => (
                <span key={s} className="text-[10px] text-muted-foreground">{STAT_ICONS[s]}+{equipped.stats[s]}</span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Stat comparison */}
      <div className="mt-2 space-y-1">
        {STATS.map((s) => {
          const v = item.stats?.[s] || 0;
          const e = equipped?.stats?.[s] || 0;
          if (!v && !e) return null;
          const d = v - e;
          const pct = e > 0 && d !== 0 ? Math.round((d / e) * 100) : null;
          return (
            <div key={s} className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{STAT_ICONS[s]} {s.slice(0, 3).toUpperCase()}</span>
              <span className="flex items-center gap-1.5">
                <span className="font-display font-bold" style={{ color: v > 0 ? color : "#6b7280" }}>{v > 0 ? `+${v}` : "0"}</span>
                {equipped ? (
                  <span className="flex items-center gap-0.5 font-bold w-14 justify-end">
                    {d > 0 ? (
                      <span className="text-green-400 flex items-center"><TrendingUp className="w-3 h-3" />+{d}{pct !== null && <span className="text-[8px] opacity-70">({pct}%)</span>}</span>
                    ) : d < 0 ? (
                      <span className="text-red-400 flex items-center"><TrendingDown className="w-3 h-3" />−{Math.abs(d)}{pct !== null && <span className="text-[8px] opacity-70">({pct}%)</span>}</span>
                    ) : (
                      <span className="text-muted-foreground flex items-center"><Minus className="w-3 h-3" />=</span>
                    )}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      {/* Special effects */}
      {item.type === "consumable" && item.consumable && (
        <p className="text-[10px] text-primary mt-2 pt-2 border-t border-border/40">
          {STAT_ICONS[item.consumable.stat]} +{Math.round(item.consumable.mult * 100)}% {item.consumable.stat} · {item.consumable.duration_hours}h buff
        </p>
      )}
      {item.set_name && (
        <p className="text-[10px] text-accent mt-1">⛓ {item.set_name} Set</p>
      )}
      {item.flavor_text && (
        <p className="text-[9px] italic text-muted-foreground mt-1">"{item.flavor_text}"</p>
      )}

      {/* Verdict */}
      {equipped ? (
        <p className={`text-[10px] font-display font-bold mt-2 pt-2 border-t border-border/40 flex items-center gap-1 ${verdict === "better" ? "text-green-400" : verdict === "worse" ? "text-red-400" : "text-muted-foreground"}`}>
          {verdict === "better" ? <TrendingUp className="w-3 h-3" /> : verdict === "worse" ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          {verdict === "better" ? "BETTER OVERALL" : verdict === "worse" ? "WORSE OVERALL" : "EVEN"}
          <span className="text-muted-foreground/60 font-normal"> vs {equipped.name}</span>
        </p>
      ) : (
        <p className="text-[10px] text-green-400 mt-2 pt-2 border-t border-border/40">Empty slot — equip for pure gain!</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/40">
        {onEquip && !item.is_equipped && (
          <button onClick={() => onEquip(item)} className="flex items-center gap-1 text-[10px] bg-primary/15 hover:bg-primary/25 text-primary px-2 py-1 rounded-md font-medium transition-colors">
            <Swords className="w-3 h-3" /> Equip
          </button>
        )}
        {onSell && !item.is_equipped && !locked && (
          <>
            <button onClick={() => onSell(item)} className="flex items-center gap-1 text-[10px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 px-2 py-1 rounded-md font-medium transition-colors">
              <Coins className="w-3 h-3" /> Sell {computeStardustValue(item)}✨
            </button>
            <button onClick={() => onSell(item)} className="flex items-center gap-1 text-[10px] bg-destructive/10 hover:bg-destructive/20 text-destructive px-2 py-1 rounded-md font-medium transition-colors">
              <Recycle className="w-3 h-3" /> Salvage
            </button>
          </>
        )}
        {locked && (
          <span className="text-[10px] text-amber-400/80 px-2 py-1 flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</span>
        )}
      </div>
    </div>
  );
}