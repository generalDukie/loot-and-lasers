import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import GameplayOverlayPortal from "@/components/game/GameplayOverlayPortal";

const PHASE_MS = 1900;

export default function NexusBattleOverlay({ result, attackerGuild, onDone }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("fight"); // fight | done
  const events = result.events || [];
  const current = events[idx];
  const atkWon = result.winner === "attacker";

  useEffect(() => {
    if (idx >= events.length - 1) {
      const t = setTimeout(() => setPhase("done"), PHASE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIdx((i) => i + 1), PHASE_MS);
    return () => clearTimeout(t);
  }, [idx, events.length]);

  const atkPct = Math.round((result.attacker_strength / (result.attacker_strength + result.defender_strength)) * 100);

  return (
    <GameplayOverlayPortal
      as={motion.div}
      className="z-[60] flex items-center justify-center p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-background/90 backdrop-blur-md" />

      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        className="relative w-full max-w-2xl rounded-2xl border border-border/60 painted-panel canvas-grain p-6 overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none metal-grid opacity-40" />

        <h3 className="relative font-display font-bold text-center text-sm tracking-widest text-amber-300 mb-4">
          ⚔ ASSAULT ON THE NEXUS ⚔
        </h3>

        {/* Combatants + strength bars */}
        <div className="relative grid grid-cols-2 gap-3 mb-4">
          <Combatant name={attackerGuild.name} tag={attackerGuild.tag} side="attacker" won={atkWon} done={phase === "done"} />
          <Combatant name={result.defender_name} tag="" side="defender" won={!atkWon} done={phase === "done"} />
        </div>

        <div className="relative h-2 rounded-full bg-muted/50 overflow-hidden mb-4">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #22D3EE, #A855F7)" }}
            animate={{ width: `${atkPct}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>

        {/* Battle log */}
        <div className="relative min-h-[120px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <motion.div
                className="text-4xl mb-2"
                animate={{ scale: [1, 1.2, 1], rotate: [-4, 4, -4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                {current?.emoji}
              </motion.div>
              <p className="text-sm text-foreground/90 max-w-md mx-auto leading-relaxed">{current?.text}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Phase indicator */}
        <div className="relative flex items-center justify-center gap-1.5 mt-4">
          {events.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i <= idx ? "w-6 bg-primary" : "w-1.5 bg-muted"}`} />
          ))}
        </div>

        {/* Outcome */}
        <AnimatePresence>
          {phase === "done" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
              className="relative mt-5 text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-5xl mb-2"
              >
                {atkWon ? "👑" : "🛡️"}
              </motion.div>
              <p className="font-display font-bold text-lg" style={{ color: atkWon ? "#FFD700" : "#34D399" }}>
                {atkWon ? `${attackerGuild.name} SEIZES THE NEXUS!` : `${result.defender_name} HOLDS THE NEXUS!`}
              </p>
              {result.ownership_changed && result.reign_days > 0 && (
                <p className="text-xs text-muted-foreground mt-1">The Nexus has changed hands after a {result.reign_days}-day reign!</p>
              )}
              <button
                onClick={onDone}
                className="mt-4 px-6 py-2 rounded-lg painted-btn text-sm font-display font-bold"
              >
                CONTINUE
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {phase !== "done" && (
          <button onClick={onDone} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground z-10">
            <X className="w-4 h-4" />
          </button>
        )}
      </motion.div>
    </GameplayOverlayPortal>
  );
}

function Combatant({ name, tag, side, won, done }) {
  const color = side === "attacker" ? "#22D3EE" : "#FB7185";
  return (
    <div className={`text-center p-2 rounded-xl border ${won && done ? "border-amber-400/60 bg-amber-500/5" : "border-border/40 bg-muted/10"}`}>
      <motion.div
        animate={side === "attacker" ? { x: [0, 6, 0] } : { x: [0, -6, 0] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="text-3xl"
      >
        {side === "attacker" ? "🛸" : "🗼"}
      </motion.div>
      <p className="font-display font-bold text-xs mt-1 truncate" style={{ color }}>
        {tag ? `[${tag}] ` : ""}{name}
      </p>
    </div>
  );
}