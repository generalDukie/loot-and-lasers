import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CLASSES } from "@/lib/gameData";
import { CLASS_STAT_WEIGHTS } from "@/lib/statEngine";
import { Activity, Heart, Crosshair, Shield, Sparkles } from "lucide-react";

const STATS = ["strength", "agility", "intellect", "vitality", "luck"];

const STAT_META = {
  strength:  { label: "Strength",  icon: Activity,  color: "#FF4D6D", effect: "+1 Physical Damage per point" },
  agility:   { label: "Agility",   icon: Crosshair, color: "#34D399", effect: "+0.3% Dodge per point (cap 40%)" },
  intellect: { label: "Intellect", icon: Sparkles,  color: "#9D6BFF", effect: "+1 Tech Damage per point" },
  vitality:  { label: "Vitality",  icon: Heart,     color: "#FFD700", effect: "+8 HP & +0.5% Armor per point (cap 50%)" },
  luck:      { label: "Luck",      icon: Shield,    color: "#22D3EE", effect: "+0.5% Crit Chance per point (cap 50%, 2× dmg)" },
};

function StatLegend({ className }) {
  const def = CLASSES[className];
  const weights = CLASS_STAT_WEIGHTS[className] || {};
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {STATS.map((stat) => {
        const m = STAT_META[stat];
        const Icon = m.icon;
        const isPrimary = def.primaryStat === stat;
        const isSecondary = def.secondaryStat === stat;
        const weight = weights[stat] || 0;
        return (
          <div
            key={stat}
            className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/20 border"
            style={{ borderColor: isPrimary ? m.color + "80" : isSecondary ? m.color + "40" : "hsl(230 20% 18%)" }}
          >
            <div className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center" style={{ background: m.color + "18" }}>
              <Icon className="w-3.5 h-3.5" style={{ color: m.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-display font-bold" style={{ color: m.color }}>{m.label}</p>
                {isPrimary && <span className="text-[8px] font-display font-bold px-1 rounded bg-primary/20 text-primary">PRIMARY</span>}
                {isSecondary && <span className="text-[8px] font-display font-bold px-1 rounded bg-accent/20 text-accent">SECONDARY</span>}
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">{m.effect}</p>
              <p className="text-[10px] font-display font-semibold mt-0.5" style={{ color: weight >= 0.5 ? m.color : "hsl(210 15% 55%)" }}>
                Scaling: {Math.round(weight * 100)}%
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BaseStatTable({ className }) {
  const def = CLASSES[className];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left p-2 font-display font-semibold text-muted-foreground uppercase tracking-wide">Class</th>
            {STATS.map((s) => (
              <th key={s} className="p-2 text-center font-display font-semibold uppercase tracking-wide" style={{ color: STAT_META[s].color }}>
                {STAT_META[s].label.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/20">
            <td className="p-2 font-display font-semibold whitespace-nowrap">{def.emoji} {def.name}</td>
            {STATS.map((s) => {
              const val = def.baseStats[s];
              const isPrimary = def.primaryStat === s;
              const isSecondary = def.secondaryStat === s;
              return (
                <td key={s} className="p-2 text-center">
                  <span className={`inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded font-display font-bold ${
                    isPrimary ? "bg-primary/20 text-primary" : isSecondary ? "bg-accent/15 text-accent" : "text-foreground/70"
                  }`}>
                    {val}
                  </span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/30" /> Primary</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent/25" /> Secondary</span>
      </div>
    </div>
  );
}

function ScalingTable({ className }) {
  const def = CLASSES[className];
  const weights = CLASS_STAT_WEIGHTS[className] || {};
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left p-2 font-display font-semibold text-muted-foreground uppercase tracking-wide">Class</th>
            {STATS.map((s) => (
              <th key={s} className="p-2 text-center font-display font-semibold uppercase tracking-wide" style={{ color: STAT_META[s].color }}>
                {STAT_META[s].label.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/20">
            <td className="p-2 font-display font-semibold whitespace-nowrap">{def.emoji} {def.name}</td>
            {STATS.map((s) => {
              const w = weights[s] || 0;
              const pct = Math.round(w * 100);
              const intensity = Math.min(1, w / 1.0);
              const bg = intensity > 0
                ? `hsla(190, 90%, 50%, ${0.08 + intensity * 0.45})`
                : "transparent";
              return (
                <td key={s} className="p-1 text-center">
                  <span
                    className="inline-flex items-center justify-center min-w-[34px] px-1.5 py-1 rounded font-display font-bold text-[11px]"
                    style={{
                      background: bg,
                      color: intensity >= 0.5 ? "#fff" : intensity > 0 ? "hsl(190 90% 65%)" : "hsl(210 15% 45%)",
                    }}
                  >
                    {pct}%
                  </span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
        Scaling weight = how much each stat contributes to your class's overall combat power. Higher % = invest stat points here for maximum performance gain.
      </p>
    </div>
  );
}

const TABS = [
  { id: "legend", label: "Stat Effects" },
  { id: "base", label: "Base Stats" },
  { id: "scaling", label: "Scaling Weights" },
];

export default function ClassStatChart({ className = "Vanguard" }) {
  const [tab, setTab] = useState("legend");
  const def = CLASSES[className];

  return (
    <div className="painted-panel canvas-grain rounded-2xl border border-border/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-sm tracking-wide flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-primary" /> {def.emoji} {def.name} Stat Scaling
        </h3>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-display font-semibold tracking-wide transition-colors border ${
              tab === t.id
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "legend" && <StatLegend className={className} />}
          {tab === "base" && <BaseStatTable className={className} />}
          {tab === "scaling" && <ScalingTable className={className} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}