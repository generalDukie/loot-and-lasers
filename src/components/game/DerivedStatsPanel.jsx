import React from "react";
import { Heart, Swords, Shield, Zap, Wind, ShieldCheck, FlaskConical } from "lucide-react";
import {
  computeDerivedStats,
  CLASS_ATK_MULT,
  CRIT_CAP,
  DODGE_CAP,
  ARMOR_CAP,
} from "@/lib/statEngine";
import { getActiveBuffs } from "@/lib/gameData";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

const OFFENSIVE = [
  { key: "damage",     label: "Damage",          icon: Swords,      color: "#F59E0B", fmt: (v) => v },
  { key: "critChance", label: "Crit Chance",     icon: Zap,         color: "#FBBF24", fmt: (v) => `${v}% · 2× dmg` },
];

const DEFENSIVE = [
  { key: "health",      label: "Max Health",        icon: Heart,       color: "#FB7185", fmt: (v) => v },
  { key: "dodgeChance", label: "Dodge Chance",      icon: Wind,        color: "#34D399", fmt: (v) => `${v}%` },
  { key: "armor",       label: "Armor",             icon: ShieldCheck, color: "#A78BFA", fmt: (v) => `${v}%` },
];

// Builds a class-specific formula breakdown for the hovered stat, plugging in
// the character's actual attribute values so players can see exactly how the
// number is derived.
function statTooltip(key, d, totalStats, character) {
  const level = d.level;
  const s = (k) => totalStats?.[k] || 0;
  switch (key) {
    case "damage": {
      const stat = d.primaryStat;
      const statVal = s(stat) || 5;
      const atkMult = CLASS_ATK_MULT[character?.class] ?? 1.0;
      const base = Math.round(statVal * 2 * atkMult);
      const lvlBonus = level * 3;
      const multPart = atkMult !== 1 ? ` × ${atkMult}` : "";
      const note = atkMult !== 1 ? " (Astral Warden trades raw offense for durability)" : "";
      return `${stat.toUpperCase()} ${statVal} × 2${multPart} + Lv${level} × 3\n= ${base} + ${lvlBonus} = ${d.damage}${note}`;
    }
    case "critChance": {
      const luk = s("luck");
      return `5% base + ${luk} LUK × 0.5%\n= ${(5 + luk * 0.5).toFixed(1)}% (cap ${CRIT_CAP}%)\nCrits deal 2× damage`;
    }
    case "health": {
      const vit = s("vitality");
      return `${vit} VIT × 8 + Lv${level} × 20 + 80\n= ${vit * 8} + ${level * 20} + 80 = ${d.health}`;
    }
    case "dodgeChance": {
      const agi = s("agility");
      return `5% base + ${agi} AGI × 0.3%\n= ${(5 + agi * 0.3).toFixed(1)}% (cap ${DODGE_CAP}%)`;
    }
    case "armor": {
      const vit = s("vitality");
      return `${vit} VIT × 0.5%\n= ${(vit * 0.5).toFixed(1)}% (cap ${ARMOR_CAP}%)\nFlat damage reduction per hit`;
    }
    default:
      return "";
  }
}

function StatCell({ label, icon: Icon, color, value, fmt, tooltip, boost }) {
  const boostLabel =
    boost > 0
      ? Number.isInteger(boost)
        ? `+${boost}`
        : `+${boost.toFixed(1)}`
      : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative p-3 rounded-xl bg-muted/20 border border-border/40 flex items-center gap-2.5 cursor-help">
          {boostLabel && (
            <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-accent/20 border border-accent/50 text-accent text-[9px] font-bold leading-none flex items-center gap-0.5 shadow-sm">
              <FlaskConical className="w-2.5 h-2.5" /> {boostLabel}
            </span>
          )}
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + "18" }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
            <p className="font-display font-bold text-sm truncate" style={{ color }}>{fmt(value)}</p>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] whitespace-pre-line text-left font-mono text-[10px] leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({ icon: Icon, children, color }) {
  return (
    <p className="text-[9px] font-display tracking-wide uppercase mb-2 flex items-center gap-1" style={{ color }}>
      <Icon className="w-3 h-3" /> {children}
    </p>
  );
}

export default function DerivedStatsPanel({ totalStats, noBuffStats, character }) {
  const d = computeDerivedStats(totalStats, character);
  // Baseline combat stats with NO active stims — the delta shows each stim's
  // contribution to the displayed number.
  const b = computeDerivedStats(noBuffStats || totalStats, character);
  const stimActive = (getActiveBuffs(character) || []).length > 0;

  const renderCell = ({ key, label, icon, color, fmt }) => (
    <StatCell
      key={key}
      label={label}
      icon={icon}
      color={color}
      value={d[key]}
      fmt={fmt}
      boost={Math.max(0, Math.round((d[key] - b[key]) * 10) / 10)}
      tooltip={statTooltip(key, d, totalStats, character)}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-sm tracking-wide text-muted-foreground flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary" /> COMBAT STATS
          </h2>
          <span className="text-[10px] text-muted-foreground/80 capitalize flex items-center gap-1">
            {stimActive && (
              <span className="flex items-center gap-0.5 text-accent font-semibold">
                <FlaskConical className="w-3 h-3" /> Stim active
              </span>
            )}
            Scales with <span className="text-primary font-semibold">{d.primaryStat}</span>
          </span>
        </div>

        {/* Offensive */}
        <SectionLabel icon={Swords} color="#F59E0B">Offensive</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
          {OFFENSIVE.map(renderCell)}
        </div>

        {/* Defensive */}
        <SectionLabel icon={Shield} color="#A78BFA">Defensive</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {DEFENSIVE.map(renderCell)}
        </div>
      </div>
    </TooltipProvider>
  );
}