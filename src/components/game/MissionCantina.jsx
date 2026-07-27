import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getEffectiveFuelCost, DIFFICULTY_COLORS } from "@/lib/gameData";
import { getEffectiveMissionDuration } from "@/lib/fuelMounts";
import { Lock, Fuel, Zap, Star, Clock } from "lucide-react";
import MissionDetailSheet from "@/components/game/MissionDetailSheet";
import RiskGauge from "@/components/game/RiskGauge";

const CANTINA_BG =
  "https://media.base44.com/images/public/6a62f636bad44979b2c073f6/4294f70a6_generated_image.png";

const PATRONS = [
  { emoji: "🤖", name: "CLANK", color: "#00E5FF" },
  { emoji: "👽", name: "Zyx", color: "#9D5CFF" },
  { emoji: "🐙", name: "Capt. Tentak", color: "#FF6B35" },
  { emoji: "🧙", name: "Old Maru", color: "#FFD700" },
  { emoji: "👻", name: "Wraith Vin", color: "#8BE8FF" },
  { emoji: "🦊", name: "Vex", color: "#FF9E4F" },
  { emoji: "🐉", name: "Drako", color: "#FF4D6D" },
  { emoji: "🛸", name: "Skip", color: "#5CFFB0" },
];

const AMBIENT_PATRONS = [
  { emoji: "🍻", x: 20, y: 46, delay: 0 },
  { emoji: "🍷", x: 76, y: 44, delay: 1.1 },
  { emoji: "🥃", x: 50, y: 47, delay: 0.5 },
];

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
  const n = missions.length;

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-border/60 shadow-2xl painted-panel painted-frame canvas-grain"
      style={{ aspectRatio: "16/9", minHeight: 300 }}
    >
      <img src={CANTINA_BG} alt="Space cantina" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/10 to-background/40" />

      {/* Playful neon backdrop — drifting orbs + twinkling sparks */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {CANTINA_ORBS.map((o, i) => (
          <motion.div
            key={`orb-${i}`}
            className="absolute rounded-full blur-xl"
            style={{ width: o.s, height: o.s, left: `${o.x}%`, top: `${o.y}%`, background: o.c }}
            animate={{ y: [0, -16, 0], x: [0, 8, 0], scale: [1, 1.14, 1] }}
            transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
          />
        ))}
        {SPARKS.map((s, i) => (
          <motion.span
            key={`spark-${i}`}
            className="absolute rounded-full"
            style={{ width: s.r, height: s.r, left: `${s.x}%`, top: `${s.y}%`, background: s.c, boxShadow: `0 0 6px ${s.c}` }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.3, 0.4] }}
            transition={{ duration: 2.4 + i * 0.3, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
          />
        ))}
        <motion.div
          className="absolute inset-0"
          style={{ background: "radial-gradient(circle at 50% 82%, rgba(157,108,255,0.18), transparent 60%)" }}
          animate={{ opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Ambient patrons hanging out at the bar */}
      {AMBIENT_PATRONS.map((p, i) => (
        <motion.div
          key={`amb-${i}`}
          className="absolute text-2xl sm:text-3xl drop-shadow-lg pointer-events-none"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          animate={{ y: [0, -3, 0], rotate: [-3, 3, -3] }}
          transition={{ duration: 3 + p.delay, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
        >
          {p.emoji}
        </motion.div>
      ))}

      {/* Quest-giver NPCs */}
      {missions.map((m, i) => {
        const patron = PATRONS[i % PATRONS.length];
        const x = n === 1 ? 50 : 10 + (i / (n - 1)) * 80;
        const fuelCost = getEffectiveFuelCost(character, m);
        const locked = m.level_requirement > characterLevel;
        const lowFuel = (currentFuel ?? 0) < fuelCost;
        const cannotStart = locked || lowFuel || busy;
        const scouting = busy && !locked && !lowFuel; // open for preview, launch blocked
        const diffColor = DIFFICULTY_COLORS[m.difficulty];

        return (
          <button
            key={i}
            className="absolute bottom-[10%] -translate-x-1/2 flex flex-col items-center group focus:outline-none"
            style={{ left: `${x}%` }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => !locked && !lowFuel && setSelected(i)}
            disabled={locked || lowFuel}
          >
            {/* Quest marker / lock */}
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 }}
              className="mb-1"
            >
              {locked && (
                <span className="text-muted-foreground/70 text-base">
                  <Lock className="w-4 h-4" />
                </span>
              )}
            </motion.div>

            {/* Avatar */}
            <motion.div
              animate={{ y: [0, -5, 0], rotate: [-2, 2, -2] }}
              transition={{ duration: 2.2 + i * 0.3, repeat: Infinity, ease: "easeInOut" }}
              whileHover={locked || lowFuel ? {} : { scale: 1.12 }}
              className="relative"
            >
              <div
                className="w-14 h-11 sm:w-[68px] sm:h-14 rounded-full flex items-center justify-center text-2xl sm:text-3xl border-4 shadow-lg"
                style={{
                  borderColor: locked ? "#555" : patron.color,
                  background: "rgba(10,12,20,0.65)",
                  filter: locked ? "grayscale(1)" : lowFuel ? "saturate(0.4)" : "none",
                  boxShadow: locked || lowFuel ? "none" : `0 0 12px ${patron.color}55`,
                }}
              >
                {patron.emoji}
              </div>
            </motion.div>

            {/* Name plate */}
            <span
              className="mt-1 text-[9px] sm:text-[10px] font-display font-bold px-2 py-0.5 rounded truncate max-w-[78px] bg-background/80 border border-border/40 canvas-grain"
              style={{ color: locked ? "#777" : patron.color }}
            >
              {patron.name}
            </span>

            {/* Hover speech bubble */}
            <AnimatePresence>
              {hovered === i && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.92 }}
                  transition={{ duration: 0.16 }}
                  className="absolute bottom-full mb-3 w-48 p-3 rounded-xl backdrop-blur-md shadow-xl z-20 painted-panel"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-display font-semibold text-xs text-foreground leading-tight">{m.name}</h4>
                    <span
                      className="text-[9px] font-display font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: diffColor + "20", color: diffColor }}
                    >
                      {m.difficulty}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">{m.description}</p>
                  <div className="flex items-center gap-1 mb-1"><RiskGauge risk={m.risk || 1} size={11} /></div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> {formatDuration(getEffectiveMissionDuration(character, m))}</span>
                    <span className="flex items-center gap-0.5"><Star className="w-2.5 h-2.5 text-cyan-400" /><span className="bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent font-bold">{m.rewards?.experience}</span></span>
                    <span className="flex items-center gap-0.5 text-purple-400 font-bold">✨ {m.rewards?.stardust}</span>
                    <span className={`flex items-center gap-0.5 font-bold ${lowFuel ? "text-amber-400" : "text-blue-400"}`}>
                      <Fuel className="w-2.5 h-2.5" /> {fuelCost}
                    </span>
                  </div>
                  {locked && (
                    <p className="text-[10px] text-destructive mt-1.5 font-medium">Lv.{m.level_requirement} required</p>
                  )}
                  {lowFuel && !locked && (
                    <p className="text-[10px] text-amber-400 mt-1.5 font-medium">Not enough fuel</p>
                  )}
                  {scouting && (
                    <p className="text-[10px] text-cyan-300 mt-1.5">🔭 Scouting — finish {mining ? "mining" : "mission"} to launch</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        );
      })}

      {/* Floor line */}
      <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-background/90 to-transparent pointer-events-none" />

      {/* Hint */}
      <p className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-display tracking-widest text-muted-foreground/70 uppercase">
        {busy ? (mining ? "⛏️ Mining in progress" : "🔭 Scout the cantina — mission in progress") : "Tap a patron to hear their tale"}
      </p>

      {selected !== null && missions[selected] && (
        <MissionDetailSheet
          mission={missions[selected]}
          patron={PATRONS[selected % PATRONS.length]}
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