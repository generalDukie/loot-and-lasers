import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Clock } from "lucide-react";

function formatTime(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const GOOFY_LINES = [
  "Calibrating the jump drive coils... again.",
  "Captain forgot the keys. Found them. In the ignition.",
  "Stowing space raccoons in the cargo hold.",
  "Checking if we have enough snacks. (We don't.)",
  "Flipping the 'GO FAST' switch to 'YES'.",
  "Telling the pilot a bedtime story for the jump.",
  "Bribing the FTL lane tollbooth operator.",
  "Wishing the pilot had slept more.",
];

/**
 * Decorative launch sequence — sits over the mission explore image only.
 * pointer-events-none so the active mission bar / skip stay usable immediately.
 */
export default function MissionLaunchOverlay({ mission, onDone }) {
  const [phase, setPhase] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 1700);
    const t3 = setTimeout(() => onDoneRef.current?.(), 3000);
    const lineTimer = setInterval(() => setLineIdx((i) => (i + 1) % GOOFY_LINES.length), 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearInterval(lineTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden rounded-2xl pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        aria-hidden
      >
        {/* Soft veil — keep the explore art visible underneath */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(270 55% 18% / 0.45), hsl(230 25% 6% / 0.55) 75%)",
          }}
        />
        <motion.div
          className="absolute w-[420px] h-[420px] rounded-full blur-3xl"
          style={{
            background: "radial-gradient(circle, hsl(280 70% 40% / 0.35), transparent 60%)",
            top: "5%",
            left: "-8%",
          }}
          animate={{ x: [0, 40, 0], y: [0, 28, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[360px] h-[360px] rounded-full blur-3xl"
          style={{
            background: "radial-gradient(circle, hsl(190 90% 45% / 0.3), transparent 60%)",
            bottom: "0%",
            right: "-5%",
          }}
          animate={{ x: [0, -36, 0], y: [0, -22, 0], scale: [1.08, 1, 1.08] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Nebula dust */}
        <div className="absolute inset-0">
          {Array.from({ length: 28 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 1 + (i % 3),
                height: 1 + (i % 3),
                background: i % 3 === 0 ? "hsl(190 90% 80%)" : i % 3 === 1 ? "hsl(280 60% 80%)" : "white",
                left: `${(i * 37) % 100}%`,
                top: `${(i * 53) % 100}%`,
              }}
              animate={{ opacity: [0.2, 0.75, 0.2], scale: [1, 1.4, 1] }}
              transition={{ duration: 2 + (i % 4), repeat: Infinity, delay: (i % 5) * 0.2 }}
            />
          ))}
        </div>

        {/* Hyperspace streaks */}
        <div className="absolute inset-0">
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i / 36) * Math.PI * 2;
            const dist = 140 + (i % 5) * 55;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            return (
              <motion.div
                key={i}
                className="absolute left-1/2 top-1/2 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
                style={{ width: 24 + (i % 4) * 12 }}
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={phase >= 1 ? { x, y, opacity: [0, 1, 0] } : { opacity: 0 }}
                transition={{ duration: 1.1, delay: (i % 8) * 0.04, ease: "easeOut" }}
              />
            );
          })}
        </div>

        {phase >= 1 && (
          <motion.div
            className="absolute left-1/2 top-1/2 rounded-full border-2 border-primary/35"
            initial={{ width: 0, height: 0, x: "-50%", y: "-50%", opacity: 1 }}
            animate={{ width: 480, height: 480, opacity: 0 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          />
        )}

        {phase >= 2 && (
          <div className="absolute left-1/2 top-1/2 z-20">
            {Array.from({ length: 14 }).map((_, i) => {
              const angle = (i / 14) * Math.PI * 2;
              const dist = 70 + (i % 4) * 28;
              return (
                <motion.span
                  key={i}
                  className="absolute text-base"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                  animate={{
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist,
                    opacity: 0,
                    scale: [0, 1.3, 0],
                  }}
                  transition={{ duration: 0.9, ease: "easeOut", delay: (i % 5) * 0.02 }}
                >
                  {["✨", "⭐", "💫", "🎉"][i % 4]}
                </motion.span>
              );
            })}
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center px-3">
          <motion.div
            className="relative"
            initial={{ y: 16, scale: 0.65, opacity: 0 }}
            animate={
              phase === 0
                ? { y: 16, scale: 0.65, opacity: 1 }
                : phase === 1
                  ? { y: -12, scale: 1, opacity: 1 }
                  : { y: -120, scale: [1, 1.25, 0.35], opacity: [1, 1, 0] }
            }
            transition={{ type: "spring", stiffness: 200, damping: 14 }}
          >
            <motion.div
              className="absolute -bottom-5 left-1/2 -translate-x-1/2 w-10 h-14 rounded-full blur-xl"
              style={{
                background:
                  "radial-gradient(circle, hsl(190 90% 60%), hsl(270 60% 55%) 50%, transparent 70%)",
              }}
              initial={{ opacity: 0, scaleY: 0.5 }}
              animate={
                phase >= 1
                  ? { opacity: [0.5, 1, 0.6, 0.9], scaleY: [0.5, 1.25, 0.7, 1.05] }
                  : { opacity: 0 }
              }
              transition={{
                duration: 0.4,
                repeat: phase >= 1 && phase < 2 ? Infinity : 0,
                repeatType: "reverse",
              }}
            />
            <motion.div
              className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/15 border-2 border-primary border-glow-cyan backdrop-blur-sm"
              animate={{ rotate: [-4, 4, -4] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="text-3xl">🚀</span>
            </motion.div>
            {phase >= 1 && (
              <motion.div
                className="absolute -right-5 -top-1 text-xl"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1, y: [0, -5, 0] }}
                transition={{
                  opacity: { duration: 0.3 },
                  scale: { duration: 0.3 },
                  y: { duration: 1.5, repeat: Infinity },
                }}
              >
                🐙
              </motion.div>
            )}
          </motion.div>

          <motion.div
            className="mt-5 text-center max-w-sm"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <motion.p
              key={lineIdx}
              className="font-body italic text-[11px] text-muted-foreground mb-2 h-4 drop-shadow"
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: [0, 1, 1, 0], y: 0 }}
              transition={{ duration: 0.7, times: [0, 0.15, 0.85, 1] }}
            >
              {GOOFY_LINES[lineIdx]}
            </motion.p>

            <motion.p
              className="font-display font-bold text-[11px] tracking-[0.28em] text-primary glow-cyan mb-1.5"
              animate={phase < 2 ? { opacity: [0.45, 1, 0.45] } : { opacity: 0 }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              {phase === 0
                ? "INITIATING LAUNCH SEQUENCE"
                : phase === 1
                  ? "ENGAGING WARP DRIVE"
                  : "WE HAVE LIFTOFF 🎉"}
            </motion.p>

            <h2 className="font-display font-bold text-lg sm:text-xl glow-cyan tracking-wide drop-shadow-md">
              {mission.name}
            </h2>
            <div className="flex items-center gap-3 justify-center mt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {mission.location}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatTime(mission.duration_seconds)}
              </span>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
