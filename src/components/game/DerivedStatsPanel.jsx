import React from "react";
import { Heart, Swords, Shield, Zap, Wind, ShieldCheck, Cpu, FlaskConical } from "lucide-react";
import {
  computeDerivedStats,
  CRIT_CAP,
  DODGE_CAP,
  ARMOR_CAP,
  TECH_RESIST_CAP,
  CRIT_MULT,
  getBaseDamageFromPrimary,
} from "@/lib/statEngine";
import { getActiveBuffs } from "@/lib/gameData";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

const OFFENSIVE = [
  { key: "damage",     label: "Damage",          icon: Swords,      color: "#F59E0B", fmt: (v) => v },
  { key: "critChance", label: "Crit Chance",     icon: Zap,         color: "#FBBF24", fmt: (v) => `${Number(v).toFixed(1)}% · ${CRIT_MULT}×` },
];

const DEFENSIVE = [
  { key: "health",      label: "Max Health",        icon: Heart,       color: "#FB7185", fmt: (v) => v },
  { key: "dodgeChance", label: "Dodge Chance",      icon: Wind,        color: "#34D399", fmt: (v) => `${Number(v).toFixed(1)}%` },
  { key: "armor",       label: "Armor",             icon: ShieldCheck, color: "#A78BFA", fmt: (v) => `${Number(v).toFixed(1)}%` },
  { key: "techResist",  label: "Tech Resist",       icon: Cpu,         color: "#38BDF8", fmt: (v) => `${Number(v).toFixed(1)}%` },
];

function fmtPct(v) {
  return `${Number(v).toFixed(2)}%`;
}

function softCapHint(level, maxPct) {
  return `Soft-capped by level (pre-100 ceiling) · hard cap ${maxPct}%`;
}

function statTooltip(key, d, totalStats) {
  const level = d.level;
  const s = (k) => totalStats?.[k] || 0;
  switch (key) {
    case "damage": {
      const stat = d.primaryStat;
      const statVal = s(stat);
      const base = getBaseDamageFromPrimary(statVal);
      const note = d.archetype === "agi"
        ? `\nAGI variance 80–105% × universal 90–110% (sheet shows ~avg)`
        : `\nUniversal variance 90–110% per hit`;
      const typeLabel = d.damageType === "tech" ? "Tech" : d.damageType === "agility" ? "Agility" : "Strength";
      return `${stat.toUpperCase()} ${statVal}\n15 + 0.0032 × ${statVal}^1.727\n≈ ${base.toFixed(1)} → sheet ${d.damage}\nType: ${typeLabel}${note}`;
    }
    case "critChance": {
      const luk = s("luck");
      return `Luck ${luk} · Level ${level}\n${fmtPct(d.critChance)} (cap ${CRIT_CAP}%)\n${softCapHint(level, CRIT_CAP)}\nCrits deal ${CRIT_MULT}× damage`;
    }
    case "health": {
      const vit = s("vitality");
      return `round(50 + 2.5×${vit} + 0.008×${vit}²)\n= ${d.health} Max HP\nNo separate level HP term`;
    }
    case "dodgeChance": {
      const agi = s("agility");
      return `Agility ${agi} · Level ${level}\n${fmtPct(d.dodgeChance)} (cap ${DODGE_CAP}%)\n${softCapHint(level, DODGE_CAP)}\nApplies vs Strength, Agility, and Tech damage`;
    }
    case "armor": {
      if (d.archetype === "str") {
        return `Strength classes convert Strength into damage.\nAttribute Armor = 0%\nInvest in Agility / Intellect for defenses.`;
      }
      const str = s("strength");
      return `Strength ${str} · Level ${level}\n${fmtPct(d.armor)} (cap ${ARMOR_CAP}%)\n${softCapHint(level, ARMOR_CAP)}\nReduces Strength damage only`;
    }
    case "techResist": {
      if (d.archetype === "int") {
        return `Intellect classes convert Intellect into Tech damage.\nAttribute Tech Resist = 0%\nInvest in Strength / Agility for defenses.`;
      }
      const intel = s("intellect");
      return `Intellect ${intel} · Level ${level}\n${fmtPct(d.techResist)} (cap ${TECH_RESIST_CAP}%)\n${softCapHint(level, TECH_RESIST_CAP)}\nReduces Tech damage only`;
    }
    default:
      return "";
  }
}

function StatCell({ label, icon: Icon, color, value, fmt, tooltip, boost, compact }) {
  const boostLabel =
    boost > 0
      ? Number.isInteger(boost)
        ? `+${boost}`
        : `+${boost.toFixed(1)}`
      : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`relative flex-1 min-w-0 rounded-lg bg-muted/20 border border-border/40 flex items-center cursor-help ${
            compact ? "px-2 py-1.5 gap-1.5" : "p-3 gap-2.5 rounded-xl"
          }`}
        >
          {boostLabel && (
            <span className="absolute -top-1.5 -right-1.5 px-1 py-px rounded-full bg-accent/20 border border-accent/50 text-accent text-[8px] font-bold leading-none flex items-center gap-0.5 shadow-sm">
              <FlaskConical className="w-2 h-2" /> {boostLabel}
            </span>
          )}
          <div
            className={`rounded-md flex items-center justify-center shrink-0 ${compact ? "w-6 h-6" : "w-9 h-9"}`}
            style={{ backgroundColor: color + "18" }}
          >
            <Icon className={compact ? "w-3 h-3" : "w-4 h-4"} style={{ color }} />
          </div>
          <div className="min-h-0 min-w-0">
            <p className="text-[8px] text-muted-foreground uppercase tracking-wide truncate leading-none">{label}</p>
            <p className={`font-display font-bold truncate leading-tight ${compact ? "text-[11px] mt-0.5" : "text-sm"}`} style={{ color }}>
              {fmt(value)}
            </p>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px] whitespace-pre-line text-left font-mono text-[10px] leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({ icon: Icon, children, color }) {
  return (
    <p className="text-[8px] font-display tracking-wide uppercase mb-1 flex items-center gap-1" style={{ color }}>
      <Icon className="w-2.5 h-2.5" /> {children}
    </p>
  );
}

export default function DerivedStatsPanel({ totalStats, noBuffStats, character, embedded = false }) {
  // Permanent totals drive the displayed combat numbers; stim-buffed totals
  // only contribute the optional boost badge (preview of temporary modifiers).
  const permanent = noBuffStats || totalStats;
  const d = computeDerivedStats(permanent, character);
  const stimmed = computeDerivedStats(totalStats, character);
  const stimActive = (getActiveBuffs(character) || []).length > 0;

  const renderCell = ({ key, label, icon, color, fmt }) => (
    <StatCell
      key={key}
      label={label}
      icon={icon}
      color={color}
      value={d[key]}
      fmt={fmt}
      compact={embedded}
      boost={stimActive ? Math.max(0, Math.round((stimmed[key] - d[key]) * 10) / 10) : 0}
      tooltip={statTooltip(key, d, permanent)}
    />
  );

  const body = (
    <>
      <div className={`flex items-center justify-between gap-2 ${embedded ? "mb-1.5" : "mb-4"}`}>
        <h2
          className={`font-display font-semibold tracking-wide text-muted-foreground flex items-center gap-1.5 ${
            embedded ? "text-[11px]" : "text-sm"
          }`}
        >
          <Swords className={`text-primary ${embedded ? "w-3 h-3" : "w-4 h-4"}`} /> COMBAT
        </h2>
        <span className="text-[9px] text-muted-foreground/80 capitalize flex items-center gap-1.5 shrink-0">
          {stimActive && (
            <span className="flex items-center gap-0.5 text-accent font-semibold">
              <FlaskConical className="w-2.5 h-2.5" /> Stim
            </span>
          )}
          <span className="hidden sm:inline">
            via <span className="text-primary font-semibold">{d.primaryStat}</span>
          </span>
        </span>
      </div>

      <SectionLabel icon={Swords} color="#F59E0B">Offensive</SectionLabel>
      <div className={`flex flex-nowrap gap-1.5 ${embedded ? "mb-1.5" : "mb-4 gap-2.5"}`}>
        {OFFENSIVE.map(renderCell)}
      </div>

      <SectionLabel icon={Shield} color="#A78BFA">Defensive</SectionLabel>
      <div className={`flex flex-nowrap gap-1.5 ${embedded ? "" : "gap-2.5"}`}>
        {DEFENSIVE.map(renderCell)}
      </div>
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      {embedded ? (
        <div className="min-h-0">{body}</div>
      ) : (
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5">{body}</div>
      )}
    </TooltipProvider>
  );
}
