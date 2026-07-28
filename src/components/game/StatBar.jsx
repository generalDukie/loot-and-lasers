import React from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { STAT_ICONS, CLASSES, getStatDescription } from "@/lib/gameData";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const STAT_SHORT = {
  strength: "STR",
  agility: "AGI",
  intellect: "INT",
  vitality: "VIT",
  luck: "LCK",
};

const STAT_COLORS = {
  strength: "#F59E0B",
  agility: "#34D399",
  intellect: "#60A5FA",
  vitality: "#FB7185",
  luck: "#C084FC",
};

// Primary attribute chip — value, gear bonus, and point-allocation button.
export default function StatBar({ stat, value, base, className, onAdd, canAdd = false }) {
  const safeBase = base ?? value;
  const bonus = Math.max(0, (value || 0) - (safeBase || 0));
  const desc = getStatDescription(stat, className);
  const color = STAT_COLORS[stat] || "#94A3B8";
  const isPrimary = CLASSES[className]?.primaryStat === stat;

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
              onClick={(e) => {
                e.stopPropagation();
                if (canAdd) onAdd(stat);
              }}
              disabled={!canAdd}
              className={`mt-0.5 w-full h-6 rounded-lg border text-[10px] font-display font-bold tracking-wide flex items-center justify-center gap-0.5 transition-colors ${
                canAdd
                  ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 hover:border-primary/60"
                  : "border-border/35 bg-muted/20 text-muted-foreground/40 cursor-not-allowed"
              }`}
              aria-label={`Add point to ${stat}`}
            >
              <Plus className="w-3 h-3" />
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
