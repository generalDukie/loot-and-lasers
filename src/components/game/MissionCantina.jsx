import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getEffectiveFuelCost, QUEST_GIVERS } from "@/lib/gameData";
import { getEffectiveMissionDuration } from "@/lib/fuelMounts";
import { computeMissionGains } from "@/hooks/useMissionManager";
import { Lock, Fuel, Star, Clock, MapPin } from "lucide-react";
import MissionDetailSheet from "@/components/game/MissionDetailSheet";

const CANTINA_BG = "/assets/cantina-bg.png";

const FALLBACK_PATRON = QUEST_GIVERS[0];

function patronFor(mission, index) {
  return mission?.patron || QUEST_GIVERS[index % QUEST_GIVERS.length] || FALLBACK_PATRON;
}

// Drifting neon orbs that give the cantina a playful, living backdrop
const CANTINA_ORBS = [
  { x: 8, y: 18, s: 120, c: "rgba(157,108,255,0.32)" },
  { x: 82, y: 14, s: 90, c: "rgba(0,229,255,0.28)" },
  { x: 60, y: 70, s: 140, c: "rgba(255,107,26,0.20)" },
  { x: 28, y: 78, s: 80, c: "rgba(0,229,255,0.22)" },
  { x: 92, y: 60, s: 70, c: "rgba(157,108,255,0.26)" },
];

// Twinkling sparks scattered across the cantina
const SPARKS = [
  { x: 14, y: 22, r: 4, c: "#00E5FF" },
  { x: 44, y: 12, r: 3, c: "#9D6BFF" },
  { x: 70, y: 30, r: 5, c: "#FFB347" },
  { x: 36, y: 40, r: 3, c: "#00E5FF" },
  { x: 88, y: 36, r: 4, c: "#9D6BFF" },
  { x: 22, y: 64, r: 3, c: "#5CFFB0" },
  { x: 64, y: 58, r: 4, c: "#00E5FF" },
  { x: 52, y: 80, r: 3, c: "#FFB347" },
];

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export default function MissionCantina({ missions, characterLevel, character, currentFuel, onStart, busy, mining }) {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const board = Array.isArray(missions) ? missions : [];
  const n = board.length;

  const hoverMission = hovered !== null ? board[hovered] : null;
  const hoverPatron = hovered !== null ? patronFor(board[hovered], hovered) : null;
  const hoverFuelCost = hoverMission ? getEffectiveFuelCost(character, hoverMission) : 0;
  const hoverGains = hoverMission && character ? computeMissionGains(character, hoverMission, false) : null;
  const hoverLocked = hoverMission ? hoverMission.level_requirement > characterLevel : false;
  const hoverLowFuel = hoverMission ? (currentFuel ?? 0) < hoverFuelCost : false;
  const hoverScouting = busy && hoverMission && !hoverLocked && !hoverLowFuel;
  const hoverAvailable = hoverMission && !hoverLocked && !hoverLowFuel;

  return (
    <div className="relative h-full w-full min-h-0 rounded-2xl overflow-hidden border border-border/60 shadow-2xl painted-panel painted-frame canvas-grain">
      <img src={CANTINA_BG} alt="Station crew lounge" className="absolute inset-0 w-full h-full object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/15 to-background/45" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 75% 60% at 50% 40%, transparent 40%, hsl(232 32% 4% / 0.35) 100%)" }} />

      {/* Soft neon atmosphere — quieter than before so the art reads */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {CANTINA_ORBS.map((o, i) => (
          <motion.div
            key={`orb-${i}`}
            className="absolute rounded-full blur-2xl"
            style={{ width: o.s, height: o.s, left: `${o.x}%`, top: `${o.y}%`, background: o.c }}
            animate={{ y: [0, -10, 0], x: [0, 5, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 7 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
          />
        ))}
        {SPARKS.map((s, i) => (
          <motion.span
            key={`spark-${i}`}
            className="absolute rounded-full"
            style={{ width: s.r, height: s.r, left: `${s.x}%`, top: `${s.y}%`, background: s.c, boxShadow: `0 0 5px ${s.c}` }}
            animate={{ opacity: [0, 0.7, 0], scale: [0.5, 1.15, 0.5] }}
            transition={{ duration: 2.8 + i * 0.3, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
          />
        ))}
        <motion.div
          className="absolute inset-0"
          style={{ background: "radial-gradient(circle at 50% 82%, rgba(157,108,255,0.12), transparent 60%)" }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Quest-giver NPCs */}
      {board.map((m, i) => {
        const patron = patronFor(m, i);
        const x = n === 1 ? 50 : 10 + (i / (n - 1)) * 80;
        const fuelCost = getEffectiveFuelCost(character, m);
        const locked = m.level_requirement > characterLevel;
        const lowFuel = (currentFuel ?? 0) < fuelCost;
        const available = !locked && !lowFuel;

        return (
          <button
            key={i}
            type="button"
            className={`absolute bottom-[6%] -translate-x-1/2 z-40 flex flex-col items-center group focus:outline-none ${locked || lowFuel ? "cursor-not-allowed" : "cursor-pointer"}`}
            style={{ left: `${x}%` }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            onClick={() => !locked && !lowFuel && setSelected(i)}
            aria-disabled={locked || lowFuel}
          >
            {/* Avatar with glow ring */}
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.2 + i * 0.3, repeat: Infinity, ease: "easeInOut" }}
              whileHover={available ? { scale: 1.1, y: -10 } : {}}
              whileTap={available ? { scale: 0.96 } : {}}
              className="relative"
            >
              {available && (
                <motion.span
                  className="absolute -inset-3 rounded-[1.35rem] border-2 pointer-events-none"
                  style={{ borderColor: `${patron.color}88` }}
                  animate={{ scale: [1, 1.12, 1], opacity: [0.75, 0.2, 0.75] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
                />
              )}
              <div
                className="relative w-[5.5rem] h-[4.75rem] sm:w-28 sm:h-24 rounded-2xl flex items-center justify-center text-5xl sm:text-6xl border-[3px] transition-transform"
                style={{
                  borderColor: locked ? "#555" : patron.color,
                  background: locked
                    ? "rgba(10,12,20,0.75)"
                    : `linear-gradient(160deg, ${patron.color}33, rgba(10,12,20,0.85) 55%)`,
                  filter: locked ? "grayscale(1)" : lowFuel ? "saturate(0.45)" : "none",
                  boxShadow: available
                    ? `0 10px 28px rgba(0,0,0,0.45), 0 0 28px ${patron.color}66, inset 0 1px 0 ${patron.color}44`
                    : "0 4px 12px rgba(0,0,0,0.35)",
                }}
              >
                <motion.span
                  animate={available ? { rotate: [-4, 4, -4] } : undefined}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {patron.emoji}
                </motion.span>
                {locked && (
                  <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-background/90 border border-border/50 text-muted-foreground">
                    <Lock className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </motion.div>

            {/* Patron name */}
            <div className="mt-2 flex flex-col items-center gap-1">
              <span
                className="text-xs sm:text-sm font-display font-bold px-3 py-1 rounded-md truncate max-w-[7.5rem] sm:max-w-[9rem] bg-background/90 border canvas-grain shadow-md"
                style={{
                  color: locked ? "#777" : patron.color,
                  borderColor: available ? `${patron.color}66` : "hsl(var(--border) / 0.4)",
                  boxShadow: available ? `0 0 12px ${patron.color}33` : undefined,
                }}
              >
                {patron.name}
              </span>
              {available && (
                <span
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-display font-bold tracking-wide uppercase mt-0.5"
                  style={{ color: patron.color, textShadow: `0 0 8px ${patron.color}` }}
                >
                  Hear the job →
                </span>
              )}
            </div>

          </button>
        );
      })}

      {/* Large centered quest preview — pointer-events-none so leaving the patron doesn't fight the panel */}
      <AnimatePresence>
        {hoverMission && hoverPatron && (
          <motion.div
            key={`preview-${hovered}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-30 flex items-start justify-center pt-6 sm:pt-8 pb-44 sm:pb-48 px-4 sm:px-6 pointer-events-none"
          >
            <div className="absolute inset-0 bg-background/55 backdrop-blur-[2px]" />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 24 }}
              className="relative w-full max-w-xl rounded-2xl border shadow-2xl painted-panel painted-frame canvas-grain p-5 sm:p-7"
              style={{
                borderColor: `${hoverPatron.color}66`,
                boxShadow: `0 20px 50px rgba(0,0,0,0.55), 0 0 36px ${hoverPatron.color}33`,
              }}
            >
              <div className="flex items-start gap-4 mb-4">
                <div
                  className="w-16 h-14 sm:w-20 sm:h-16 rounded-2xl flex items-center justify-center text-4xl sm:text-5xl border-[3px] shrink-0"
                  style={{
                    borderColor: hoverPatron.color,
                    background: `linear-gradient(160deg, ${hoverPatron.color}33, rgba(10,12,20,0.9) 55%)`,
                    boxShadow: `0 0 20px ${hoverPatron.color}55`,
                  }}
                >
                  {hoverPatron.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-display tracking-widest uppercase mb-1" style={{ color: hoverPatron.color }}>
                    {hoverPatron.name}
                  </p>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display font-bold text-xl sm:text-2xl leading-tight text-foreground">
                      {hoverMission.name}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" /> {hoverMission.location}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-muted/25 border border-border/40">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="font-display font-semibold text-foreground">
                    {formatDuration(getEffectiveMissionDuration(character, hoverMission))}
                  </span>
                </div>
              </div>

              <p className="text-base sm:text-lg text-foreground/90 leading-relaxed mb-5">
                {hoverMission.description}
              </p>

              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-center mb-4">
                <div className="p-3 rounded-xl bg-muted/25 border border-border/40">
                  <Star className="w-5 h-5 mx-auto text-cyan-400" />
                  <p className="text-lg sm:text-xl font-display font-bold mt-1.5 bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                    {hoverGains?.xpGain ?? hoverMission.rewards?.experience}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">XP</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/25 border border-border/40">
                  <span className="text-lg block text-center">✨</span>
                  <p className="text-lg sm:text-xl font-display font-bold mt-1.5 text-purple-400">{hoverGains?.stardustGain ?? hoverMission.rewards?.stardust}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Stardust</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/25 border border-border/40">
                  <Fuel className={`w-5 h-5 mx-auto ${hoverLowFuel ? "text-amber-400" : "text-blue-400"}`} />
                  <p className={`text-lg sm:text-xl font-display font-bold mt-1.5 ${hoverLowFuel ? "text-amber-400" : "text-blue-400"}`}>{hoverFuelCost}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Fuel</p>
                </div>
              </div>

              {hoverLocked && (
                <p className="text-sm text-destructive font-medium text-center">Requires Level {hoverMission.level_requirement}</p>
              )}
              {hoverLowFuel && !hoverLocked && (
                <p className="text-sm text-amber-400 font-medium text-center">Not enough fuel (need {hoverFuelCost})</p>
              )}
              {hoverScouting && (
                <p className="text-sm text-cyan-300 text-center">
                  Scouting — finish {mining ? "mining" : "mission"} to launch
                </p>
              )}
              {hoverAvailable && !hoverScouting && (
                <p className="text-sm font-display font-bold text-center tracking-wide" style={{ color: hoverPatron.color }}>
                  Click the patron to take the job
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floor line */}
      <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-background/90 to-transparent pointer-events-none" />

      {/* Hint */}
      <p className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-display tracking-widest text-muted-foreground/70 uppercase z-10">
        {busy ? (mining ? "⛏️ Mining in progress" : "🔭 Scout the lounge — mission in progress") : board.some((m) => m._lowFuel) ? "Low fuel — residual errands sized to your tank" : "Hover a patron for the full job · click to accept"}
      </p>

      {selected !== null && board[selected] && (
        <MissionDetailSheet
          mission={board[selected]}
          patron={patronFor(board[selected], selected)}
          characterLevel={characterLevel}
          character={character}
          currentFuel={currentFuel}
          busy={busy}
          mining={mining}
          onStart={onStart}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}