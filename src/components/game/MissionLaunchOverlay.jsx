import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Clock } from "lucide-react";

function formatTime(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const GOOFY_LINES = [
  "Calibrating the flux capacitor... again.",
  "Captain forgot the keys. Found them. In the ignition.",
  "Stowing space raccoons in the cargo hold.",
  "Checking if we have enough snacks. (We don't.)",
  "Flipping the 'GO FAST' switch to 'YES'.",
  "Telling the pilot a bedtime story for the jump.",
  "Bribing the hyperspace tollbooth operator.",
  "Wishing the pilot had slept more.",
];

export default function MissionLaunchOverlay({ mission, onDone }) {
  const [phase, setPhase] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  // Keep the latest callback without re-triggering the timers on every parent render.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 1700);
    const t3 = setTimeout(() => onDoneRef.current?.(), 3000);
    const lineTimer = setInterval(() => setLineIdx(i => (i + 1) % GOOFY_LINES.length), 700);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearInterval(lineTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Nebula background */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, hsl(270 60% 20% / 0.6), hsl(230 25% 6%) 70%)" }} />
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(280 70% 40% / 0.4), transparent 60%)", top: "10%", left: "-10%" }}
          animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(190 90% 45% / 0.35), transparent 60%)", bottom: "5%", right: "-5%" }}
          animate={{ x: [0, -50, 0], y: [0, -30, 0], scale: [1.1, 1, 1.1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(320 70% 50% / 0.25), transparent 60%)", top: "40%", right: "20%" }}
          animate={{ x: [0, 30, 0], y: [0, 50, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Nebula dust specks */}
        <div className="absolute inset-0">
          {Array.from({ length: 40 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 1 + Math.random() * 3,
                height: 1 + Math.random() * 3,
                background: i % 3 === 0 ? "hsl(190 90% 80%)" : i % 3 === 1 ? "hsl(280 60% 80%)" : "white",
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{ opacity: [0.2, 0.8, 0.2], scale: [1, 1.5, 1] }}
              transition={{ duration: 2 + Math.random() * 3, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>

        {/* Hyperspace star streaks */}
        <div className="absolute inset-0">
          {Array.from({ length: 50 }).map((_, i) => {
            const angle = (i / 50) * Math.PI * 2;
            const dist = 200 + Math.random() * 400;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            return (
              <motion.div
                key={i}
                className="absolute left-1/2 top-1/2 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
                style={{ width: 30 + Math.random() * 50 }}
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={phase >= 1 ? { x, y, opacity: [0, 1, 0] } : { opacity: 0 }}
                transition={{ duration: 1.2, delay: Math.random() * 0.3, ease: "easeOut" }}
              />
            );
          })}
        </div>

        {/* Expanding ring */}
        {phase >= 1 && (
          <motion.div
            className="absolute left-1/2 top-1/2 rounded-full border-2 border-primary/40"
            initial={{ width: 0, height: 0, x: "-50%", y: "-50%", opacity: 1 }}
            animate={{ width: 600, height: 600, opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        )}

        {/* Liftoff spark burst */}
        {phase >= 2 && (
          <div className="absolute left-1/2 top-1/2 z-20 pointer-events-none">
            {Array.from({ length: 18 }).map((_, i) => {
              const angle = (i / 18) * Math.PI * 2;
              const dist = 80 + Math.random() * 120;
              return (
                <motion.span
                  key={i}
                  className="absolute text-lg"
                  initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                  animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, scale: [0, 1.4, 0] }}
                  transition={{ duration: 1, ease: "easeOut", delay: Math.random() * 0.1 }}
                >
                  {["✨", "⭐", "💫", "🎉"][i % 4]}
                </motion.span>
              );
            })}
          </div>
        )}

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center">
          {/* Goofy ship with wobble */}
          <motion.div
            className="relative"
            initial={{ y: 20, scale: 0.6, opacity: 0 }}
            animate={
              phase === 0 ? { y: 20, scale: 0.6, opacity: 1 } :
              phase === 1 ? { y: -20, scale: 1, opacity: 1 } :
              { y: -170, scale: [1, 1.3, 0.4], opacity: [1, 1, 0] }
            }
            transition={{ type: "spring", stiffness: 200, damping: 14 }}
          >
            {/* Thrust glow */}
            <motion.div
              className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-12 h-16 rounded-full blur-xl"
              style={{ background: "radial-gradient(circle, hsl(190 90% 60%), hsl(270 60% 55%) 50%, transparent 70%)" }}
              initial={{ opacity: 0, scaleY: 0.5 }}
              animate={phase >= 1 ? { opacity: [0.5, 1, 0.6, 0.9], scaleY: [0.5, 1.3, 0.7, 1.1] } : { opacity: 0 }}
              transition={{ duration: 0.4, repeat: phase >= 1 && phase < 2 ? Infinity : 0, repeatType: "reverse" }}
            />
            {/* Ship body — wobbly */}
            <motion.div
              className="relative flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border-2 border-primary border-glow-cyan"
              animate={{ rotate: [-4, 4, -4] }}
              transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="text-4xl">🚀</span>
            </motion.div>
            {/* Little floating buddy */}
            {phase >= 1 && (
              <motion.div
                className="absolute -right-6 -top-2 text-2xl"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1, y: [0, -6, 0] }}
                transition={{ opacity: { duration: 0.3 }, scale: { duration: 0.3 }, y: { duration: 1.5, repeat: Infinity } }}
              >
                🐙
              </motion.div>
            )}
          </motion.div>

          {/* Text */}
          <motion.div
            className="mt-8 text-center px-4"
            initial={{ opacity: 0, y: 10 }}
            animate={phase >= 0 ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
          >
            {/* Goofy status line — cycles */}
            <motion.p
              key={lineIdx}
              className="font-body italic text-xs text-muted-foreground mb-3 h-4"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: [0, 1, 1, 0], y: 0 }}
              transition={{ duration: 0.7, times: [0, 0.15, 0.85, 1] }}
            >
              {GOOFY_LINES[lineIdx]}
            </motion.p>

            {/* Phase label */}
            <motion.p
              className="font-display font-bold text-sm tracking-[0.3em] text-primary glow-cyan mb-2"
              animate={phase < 2 ? { opacity: [0.4, 1, 0.4] } : { opacity: 0 }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              {phase === 0 ? "INITIATING LAUNCH SEQUENCE" : phase === 1 ? "JUMPING TO HYPERSPACE" : "WE HAVE LIFTOFF 🎉"}
            </motion.p>

            <h2 className="font-display font-bold text-2xl glow-cyan tracking-wide max-w-xs">{mission.name}</h2>
            <div className="flex items-center gap-4 justify-center mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {mission.location}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatTime(mission.duration_seconds)}</span>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}