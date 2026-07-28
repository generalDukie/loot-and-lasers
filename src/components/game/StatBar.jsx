import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { STAT_ICONS, CLASSES, getStatDescription, STAT_COLORS } from "@/lib/gameData";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const STAT_SHORT = {
  strength: "STR",
  agility: "AGI",
  intellect: "INT",
  vitality: "VIT",
  luck: "LCK",
};

const HOLD_START_RATE = 2;   // clicks / sec right after the first press
const HOLD_END_RATE = 10;    // clicks / sec at full speed
const HOLD_RAMP_MS = 3000;   // time to reach full speed

function holdIntervalMs(elapsedMs) {
  const t = Math.min(1, Math.max(0, elapsedMs) / HOLD_RAMP_MS);
  const rate = HOLD_START_RATE + (HOLD_END_RATE - HOLD_START_RATE) * t;
  return Math.round(1000 / rate);
}

// Primary attribute chip — value, gear bonus, and point-allocation button.
// Click = +1. Hold = keep buying; rate starts slow and ramps to 10/s over ~3s.
export default function StatBar({
  stat,
  value,
  base,
  className,
  onAdd,
  canAdd = false,
  cost,
}) {
  const safeBase = base ?? value;
  const bonus = Math.max(0, (value || 0) - (safeBase || 0));
  const desc = getStatDescription(stat, className);
  const color = STAT_COLORS[stat] || "#94A3B8";
  const isPrimary = CLASSES[className]?.primaryStat === stat;
  const delayRef = useRef(null);
  const repeatRef = useRef(null);
  const holdingRef = useRef(false);
  const holdStartRef = useRef(0);
  const canAddRef = useRef(canAdd);
  const onAddRef = useRef(onAdd);

  useEffect(() => { canAddRef.current = canAdd; }, [canAdd]);
  useEffect(() => { onAddRef.current = onAdd; }, [onAdd]);

  useEffect(() => () => {
    clearTimeout(delayRef.current);
    clearTimeout(repeatRef.current);
  }, []);

  function clearHold() {
    holdingRef.current = false;
    clearTimeout(delayRef.current);
    clearTimeout(repeatRef.current);
    delayRef.current = null;
    repeatRef.current = null;
  }

  function fireAdd() {
    if (!canAddRef.current || !onAddRef.current) return false;
    onAddRef.current(stat);
    return true;
  }

  function scheduleNext() {
    if (!holdingRef.current) return;
    const elapsed = Date.now() - holdStartRef.current;
    repeatRef.current = setTimeout(() => {
      if (!holdingRef.current || !fireAdd()) {
        clearHold();
        return;
      }
      scheduleNext();
    }, holdIntervalMs(elapsed));
  }

  function startHold(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!canAdd || !onAdd) return;
    clearHold();
    holdingRef.current = true;
    holdStartRef.current = Date.now();
    fireAdd();
    // First repeat at the slow start rate, then ramp via scheduleNext.
    delayRef.current = setTimeout(() => {
      if (!holdingRef.current) return;
      if (!fireAdd()) {
        clearHold();
        return;
      }
      scheduleNext();
    }, holdIntervalMs(0));
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`relative flex flex-col items-center gap-1 rounded-xl border px-2 pt-2 pb-1.5 min-w-0 cursor-help transition-colors hover:bg-muted/25 ${
            isPrimary
              ? "border-primary/45 bg-primary/5 shadow-[0_0_14px_hsl(190_90%_50%/0.1)]"
              : "border-border/40 bg-muted/10"
          }`}
        >
          {bonus > 0 && (
            <span className="absolute -top-1.5 -right-1.5 px-1 py-px rounded-full bg-green-500/15 border border-green-500/40 text-green-400 text-[8px] font-bold leading-none shadow-sm z-10">
              +{bonus}
            </span>
          )}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
            style={{ backgroundColor: `${color}20`, boxShadow: `0 0 10px ${color}25` }}
          >
            {STAT_ICONS[stat]}
          </div>
          <p className="text-[8px] font-display font-bold tracking-[0.14em] text-muted-foreground uppercase leading-none">
            {STAT_SHORT[stat] || stat.slice(0, 3).toUpperCase()}
          </p>
          <p className="font-display font-black text-xl tabular-nums leading-none" style={{ color }}>
            {value || 0}
          </p>
          {isPrimary && (
            <span className="text-[7px] font-display font-bold tracking-wide text-primary/70 uppercase">Primary</span>
          )}
          {onAdd && (
            <motion.button
              type="button"
              whileTap={canAdd ? { scale: 0.9 } : undefined}
              onPointerDown={startHold}
              onPointerUp={clearHold}
              onPointerLeave={clearHold}
              onPointerCancel={clearHold}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!canAdd}
              className={`mt-0.5 w-full min-h-6 rounded-lg border text-[9px] font-display font-bold tracking-wide flex items-center justify-center gap-0.5 transition-colors select-none touch-none ${
                canAdd
                  ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 hover:border-primary/60"
                  : "border-border/35 bg-muted/20 text-muted-foreground/40 cursor-not-allowed"
              }`}
              aria-label={`Buy ${stat} point${cost != null ? ` for ${cost} stardust` : ""}. Hold to keep buying.`}
              title={cost != null ? `✨${cost.toLocaleString()} · hold to auto-buy` : "Hold to auto-buy"}
            >
              <Plus className="w-3 h-3 shrink-0" />
              {cost != null && (
                <span className="tabular-nums">✨{cost.toLocaleString()}</span>
              )}
            </motion.button>
          )}
        </div>
      </TooltipTrigger>
      {desc && (
        <TooltipContent side="bottom" className="max-w-[200px] text-[10px] leading-relaxed">
          {desc}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
