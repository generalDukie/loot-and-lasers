import React from "react";
import { motion } from "framer-motion";
import { Lock, Check } from "lucide-react";

// Snake-layout positions for the 10-planet dungeon path (percent).
const NODE_POS = [];
for (let i = 0; i < 10; i++) {
  if (i < 5) NODE_POS.push({ x: 10 + i * 20, y: 32 });
  else NODE_POS.push({ x: 90 - (i - 5) * 20, y: 70 });
}

export default function DungeonMap({ planets, currentPlanetId }) {
  return (
    <div className="relative rounded-2xl p-3 border border-border/60 bg-gradient-to-b from-card/70 to-background/40 backdrop-blur-sm">
      <div
        className="relative w-full rounded-xl overflow-hidden border border-primary/20"
        style={{
          aspectRatio: "16/7",
          minHeight: 240,
          background:
            "radial-gradient(ellipse at 50% 60%, hsl(190 90% 20% / 0.18), transparent 70%), hsl(230 30% 6%)",
        }}
      >
        {/* Holographic grid */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(hsl(190 90% 60% / 0.25) 1px, transparent 1px), linear-gradient(90deg, hsl(190 90% 60% / 0.25) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Scanline sweep */}
        <motion.div
          className="absolute inset-x-0 h-16 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, hsl(190 90% 60% / 0.08), transparent)" }}
          animate={{ y: ["-20%", "120%"] }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
        />

        {/* Connection lanes */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {NODE_POS.slice(0, -1).map((a, i) => {
            const b = NODE_POS[i + 1];
            const unlocked = planets[i + 1].id <= currentPlanetId;
            return (
              <motion.line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={unlocked ? planets[i].color : "#444"}
                strokeWidth={0.5}
                strokeDasharray="2 2"
                strokeOpacity={unlocked ? 0.5 : 0.2}
                animate={{ strokeDashoffset: [0, -8] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            );
          })}
        </svg>

        {/* Planet nodes */}
        {planets.map((p, i) => {
          const pos = NODE_POS[i];
          const state = p.id < currentPlanetId ? "cleared" : p.id === currentPlanetId ? "current" : "locked";
          return (
            <div key={p.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
              {state === "current" && (
                <motion.span
                  className="absolute w-10 h-10 rounded-full border-2"
                  style={{ borderColor: p.color }}
                  animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <motion.div
                className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-base sm:text-xl border-2"
                style={{
                  borderColor: state === "locked" ? "#444" : p.color,
                  backgroundColor: state === "locked" ? "rgba(20,20,30,0.6)" : p.color + "22",
                  boxShadow: state === "locked" ? "none" : `0 0 14px ${p.color}66`,
                  filter: state === "locked" ? "grayscale(1)" : "none",
                }}
                animate={{ y: [0, -5, 0], rotate: [-3, 3, -3] }}
                transition={{ duration: 2.4 + i * 0.3, repeat: Infinity, ease: "easeInOut" }}
              >
                {state === "locked" ? <Lock className="w-4 h-4 text-muted-foreground" /> : state === "cleared" ? <Check className="w-4 h-4 text-green-400" /> : p.icon}
              </motion.div>
              <p
                className="mt-1 text-[8px] sm:text-[9px] font-display font-bold tracking-wide px-1 py-0.5 rounded bg-background/80 border border-border/40 whitespace-nowrap"
                style={{ color: state === "locked" ? "#777" : p.color }}
              >
                {p.id}. {p.name}
              </p>
              {state === "current" && <p className="text-[8px] text-primary font-display mt-0.5 tracking-wider">HERE</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}