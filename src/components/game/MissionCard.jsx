import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DIFFICULTY_COLORS, getEffectiveFuelCost } from "@/lib/gameData";
import { Clock, MapPin, Star, Fuel, Gem } from "lucide-react";
import RiskGauge from "@/components/game/RiskGauge";

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

const GOOFY_STATUS = [
  { at: 0.0, msg: "🚀 Igniting thrusters (hope they work)..." },
  { at: 0.15, msg: "Captain spilled space coffee, mopping..." },
  { at: 0.3, msg: "Dodging a space raccoon, brb..." },
  { at: 0.45, msg: "Pilot forgot which button is 'go'..." },
  { at: 0.6, msg: "Halfway! The snacks are holding up." },
  { at: 0.75, msg: "Arguing with the GPS about shortcuts..." },
  { at: 0.9, msg: "Almost there! Mostly. Probably." },
  { at: 0.97, msg: "Parking the ship (parallel, ugh)..." },
  { at: 1.0, msg: "🎉 Arrived! Intact and everything." },
];

function getGoofyStatus(progress) {
  let current = GOOFY_STATUS[0];
  for (const s of GOOFY_STATUS) {
    if (progress >= s.at) current = s;
  }
  return current.msg;
}

function CountdownTimer({ endTime, duration_seconds, onComplete }) {
  const [remaining, setRemaining] = useState(0);
  const total = Math.max(1, duration_seconds || 1);

  useEffect(() => {
    const calc = () => {
      const diff = Math.max(0, Math.floor((new Date(endTime) - new Date()) / 1000));
      setRemaining(diff);
      if (diff <= 0 && onComplete) onComplete();
    };
    calc();
    const interval = setInterval(calc, 500);
    return () => clearInterval(interval);
  }, [endTime, onComplete]);

  const progress = Math.min(1, Math.max(0, 1 - remaining / total));
  const done = remaining <= 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Time Remaining</span>
        <span className="font-display font-semibold text-white glow-cyan">
          {done ? "COMPLETE!" : formatDuration(remaining)}
        </span>
      </div>
      <div className="relative h-5 bg-muted/50 rounded-full overflow-hidden border border-border/30">
        {/* Filled portion */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/80 to-accent/80 transition-all duration-500 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
        {/* Dotted path for traveled route */}
        <div className="absolute inset-0 flex items-center px-2">
          <div className="w-full border-t border-dashed border-primary/20" />
        </div>
        {/* Traveling ship */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-500 ease-linear"
          style={{ left: `${Math.max(3, progress * 97)}%` }}
        >
          <motion.div
            animate={{ rotate: done ? [0, -10, 10, 0] : [-3, 3, -3] }}
            transition={{ duration: done ? 0.4 : 0.8, repeat: Infinity, ease: "easeInOut" }}
            className="text-base"
          >
            {done ? "🎉" : "🚀"}
          </motion.div>
        </div>
      </div>
      {/* Goofy status line */}
      <p className="text-[11px] text-muted-foreground/80 italic text-center min-h-[1em] transition-opacity">
        {getGoofyStatus(progress)}
      </p>
    </div>
  );
}

export default function MissionCard({ mission, onStart, onClaim, isActive, isCompleted, characterLevel, character, currentFuel, onSkip, skipCost, claiming, previewStardust, previewXp }) {
  const diffColor = DIFFICULTY_COLORS[mission.difficulty];
  const locked = mission.level_requirement > characterLevel;
  const fuelCost = getEffectiveFuelCost(character, mission);
  const insufficientFuel = !isActive && !isCompleted && (currentFuel ?? 0) < fuelCost;

  return (
    <div className={`p-4 rounded-xl border transition-all duration-300 ${
      locked ? "opacity-40 border-border/30 bg-card/30" :
      isActive ? "border-primary/50 bg-primary/5 border-glow-cyan" :
      isCompleted ? "border-green-500/50 bg-green-500/5" :
      "border-border/50 bg-card/50 hover:border-border"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-sm tracking-wide truncate">{mission.name}</h3>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="w-3 h-3" /> {mission.location}
            </span>
            <span className="flex items-center gap-1 text-[11px]">
              <RiskGauge risk={mission.risk || 1} size={12} />
            </span>
          </div>
        </div>
        <span
          className="text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: diffColor + "15", color: diffColor }}
        >
          {mission.difficulty}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{mission.description}</p>

      <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(mission.duration_seconds)}</span>
        <span className="flex items-center gap-1"><Star className="w-3 h-3 text-cyan-400" /><span className="bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent font-bold">{previewXp ?? mission.rewards?.experience} XP</span></span>
        <span className="flex items-center gap-1 text-purple-400 font-bold">✨ {previewStardust ?? mission.rewards?.stardust}</span>
        <span className={`flex items-center gap-1 font-bold ${insufficientFuel ? "text-amber-400" : "text-blue-400"}`}><Fuel className="w-3 h-3" /> {fuelCost}</span>
        {locked && <span className="text-destructive">Lv.{mission.level_requirement} required</span>}
      </div>

      {isActive && mission.end_time && (
        <div className="mt-3">
          <CountdownTimer endTime={mission.end_time} duration_seconds={mission.duration_seconds} onComplete={() => {}} />
          {onSkip && (
            <button
              onClick={onSkip}
              className="mt-2 w-full text-xs px-4 py-2 rounded-lg font-display font-semibold tracking-wide bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors flex items-center justify-center gap-1.5"
            >
              <Gem className="w-3.5 h-3.5" /> Skip · {skipCost} 💎
            </button>
          )}
        </div>
      )}

      <div className="mt-3">
        {!isActive && !isCompleted && !locked && (
          <button
            onClick={() => onStart(mission)}
            disabled={insufficientFuel}
            className={`w-full text-xs px-4 py-2 rounded-lg font-display font-semibold tracking-wide transition-colors ${
              insufficientFuel
                ? "bg-muted/30 text-muted-foreground cursor-not-allowed"
                : "bg-primary/10 hover:bg-primary/20 text-primary"
            }`}
          >
            {insufficientFuel ? `NEED ${fuelCost} FUEL` : `LAUNCH · ${fuelCost} ⛽`}
          </button>
        )}
        {isCompleted && (
          <button
            onClick={() => onClaim(mission)}
            disabled={claiming}
            className="w-full text-xs bg-green-500/10 hover:bg-green-500/20 text-green-400 px-4 py-2 rounded-lg font-display font-semibold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed animate-pulse"
          >
            {claiming ? "CLAIMING…" : "CLAIM REWARDS"}
          </button>
        )}
        {isActive && (
          <p className="text-center text-[11px] text-muted-foreground font-medium">Mission in progress...</p>
        )}
      </div>
    </div>
  );
}