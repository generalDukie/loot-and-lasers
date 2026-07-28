import React from "react";
import { motion } from "framer-motion";
import { getEffectiveFuelCost, ITEM_DROP_RATES } from "@/lib/gameData";
import { getEffectiveMissionDuration } from "@/lib/fuelMounts";
import { computeMissionGains } from "@/hooks/useMissionManager";
import { X, Star, Fuel, MapPin, Lock, Clock } from "lucide-react";

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

const LOOT_TYPES = ["weapon", "armor", "helmet", "boots", "accessory", "ship_module"];
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const RARITY_COLORS = { common: "#9CA3AF", uncommon: "#22C55E", rare: "#3B82F6", epic: "#A855F7", legendary: "#F59E0B" };

export default function MissionDetailSheet({ mission, patron, characterLevel, character, currentFuel, busy, mining, onStart, onClose }) {
  const locked = mission.level_requirement > characterLevel;
  const fuelCost = getEffectiveFuelCost(character, mission);
  const gains = character ? computeMissionGains(character, mission, false) : null;
  const lowFuel = (currentFuel ?? 0) < fuelCost;
  const disabled = locked || lowFuel || busy;
  const lootType = mission.rewards?.loot_type || LOOT_TYPES[mission.name.length % 6];
  const rarityChance = mission.rewards?.item_rarity_chance || "common";
  const dropRates = ITEM_DROP_RATES[rarityChance] || ITEM_DROP_RATES.common;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-border/60 shadow-2xl painted-panel canvas-grain p-5 max-h-[90%] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground z-10">
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-3 pr-6">
          <motion.div
            animate={{ y: [0, -4, 0], rotate: [-2, 2, -2] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="w-16 h-12 rounded-full flex items-center justify-center text-3xl border-4 shrink-0"
            style={{ borderColor: patron.color, background: "rgba(10,12,20,0.7)", boxShadow: `0 0 14px ${patron.color}55` }}
          >
            {patron.emoji}
          </motion.div>
          <div className="min-w-0">
            <p className="text-[10px] font-display tracking-widest uppercase" style={{ color: patron.color }}>{patron.name}</p>
            <h3 className="font-display font-bold text-base leading-tight">{mission.name}</h3>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" /> {mission.location}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-muted/20 border border-border/30">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-display font-semibold text-foreground">
            {formatDuration(getEffectiveMissionDuration(character, mission))}
          </span>
        </div>

        {/* Story */}
        <p className="text-sm text-foreground/90 leading-relaxed">{mission.description}</p>

        {/* Rewards */}
        <div className="mt-4">
          <p className="text-[10px] font-display font-semibold text-muted-foreground tracking-widest uppercase mb-2">Rewards</p>
          <div className="grid grid-cols-3 gap-2 text-center mb-2">
            <div className="p-2 rounded-lg bg-muted/20 border border-border/30">
              <Star className="w-3.5 h-3.5 mx-auto text-teal-400" />
              <p className="text-sm font-display font-bold mt-1 bg-gradient-to-r from-teal-400 to-amber-400 bg-clip-text text-transparent">{gains?.xpGain ?? mission.rewards?.experience}</p>
              <p className="text-[9px] text-muted-foreground">XP</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/20 border border-border/30">
              <span className="text-sm block text-center">✨</span>
              <p className="text-sm font-display font-bold mt-1 text-purple-400">{gains?.stardustGain ?? mission.rewards?.stardust}</p>
              <p className="text-[9px] text-muted-foreground">Stardust</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/20 border border-border/30">
              <Fuel className="w-3.5 h-3.5 mx-auto text-blue-400" />
              <p className="text-sm font-display font-bold mt-1 text-blue-400">{fuelCost}</p>
              <p className="text-[9px] text-muted-foreground">Fuel</p>
            </div>
          </div>

          {/* Loot type + rarity possibility — no specifics revealed until completion */}
          <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-muted/15 border border-border/30 border-dashed">
            <span className="text-base">🎁</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Possible Loot</p>
              <p className="text-xs font-display font-semibold capitalize">{lootType.replace("_", " ")}</p>
              <div className="flex items-center gap-1 mt-1">
                {RARITY_ORDER.map((r) => {
                  const pct = dropRates[r] || 0;
                  if (!pct) return null;
                  return (
                    <span
                      key={r}
                      className="text-[8px] font-display font-bold px-1 py-px rounded capitalize"
                      style={{ backgroundColor: RARITY_COLORS[r] + "22", color: RARITY_COLORS[r] }}
                      title={`${r}: ${pct}%`}
                    >
                      {r.slice(0, 3)} {pct}%
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Status / Start */}
        <div className="mt-4">
          {locked && (
            <p className="text-xs text-destructive font-medium mb-2 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Requires Level {mission.level_requirement}
            </p>
          )}
          {lowFuel && !locked && <p className="text-xs text-amber-400 font-medium mb-2">Not enough fuel (need {fuelCost})</p>}
          {busy && !locked && !lowFuel && <p className="text-xs text-teal-300 mb-2">{mining ? "⛏️ Mining in progress — scout now, launch when free" : "🔭 Mission in progress — scout now, launch when free"}</p>}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { if (!disabled) { onStart(mission); onClose(); } }}
            disabled={disabled}
            className={`w-full text-sm px-4 py-2.5 rounded-lg font-display font-bold tracking-wide transition-colors ${
              disabled ? "bg-muted/30 text-muted-foreground cursor-not-allowed" : "bg-primary hover:bg-primary/90 text-primary-foreground"
            }`}
          >
            {disabled ? (busy && !locked && !lowFuel ? "SCOUTING" : "UNAVAILABLE") : "START MISSION"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}