import React from "react";
import { motion } from "framer-motion";
import { getStatDescription } from "@/lib/gameData";
import StatIcon from "@/components/game/StatIcon";

const STAT_LABELS = {
  strength: "Strength",
  agility: "Agility",
  intellect: "Intellect",
  vitality: "Vitality",
  luck: "Luck",
};

export default function StatAllocator({ stats, points, onAdd, onRemove, allowRemove = true, allocated, className }) {
  const canRemove = (stat) => (allocated ? (allocated[stat] || 0) > 0 : true);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-display font-semibold text-muted-foreground tracking-wide">ATTRIBUTES</h4>
        <span className={`text-xs font-display font-bold px-2 py-0.5 rounded-full ${points > 0 ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted text-muted-foreground"}`}>
          {points} pts
        </span>
      </div>
      {Object.entries(stats).map(([stat, val]) => (
        <div key={stat} className="flex items-center gap-2 bg-muted/20 rounded-lg px-2 py-1.5 border border-border/30">
          <StatIcon stat={stat} className="w-4 h-4" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium">{STAT_LABELS[stat]}</span>
            <p className="text-[9px] text-muted-foreground/70 leading-tight truncate">{getStatDescription(stat, className)}</p>
          </div>
          <span className="font-display font-bold text-sm w-8 text-right">{val}</span>
          {allowRemove && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.8 }}
              onClick={() => onRemove(stat)}
              disabled={!canRemove(stat)}
              className="w-6 h-6 rounded-md bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none flex items-center justify-center"
            >
              −
            </motion.button>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.8 }}
            onClick={() => onAdd(stat)}
            disabled={points <= 0}
            className="w-6 h-6 rounded-md bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-30 text-base leading-none flex items-center justify-center"
          >
            +
          </motion.button>
        </div>
      ))}
    </div>
  );
}