import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { burstWin, burstBig } from "@/lib/casinoFx";

const MAX = 1000;

// Weighted wheel tiers — [probability, multiplier, label]. House edge ~15%.
const TIERS = [
  { p: 0.50, mult: 0, label: "Nothing", color: "#6B7280" },
  { p: 0.30, mult: 1, label: "Push", color: "#9CA3AF" },
  { p: 0.12, mult: 2, label: "2×", color: "#22C55E" },
  { p: 0.06, mult: 3, label: "3×", color: "#3B82F6" },
  { p: 0.018, mult: 5, label: "5×", color: "#A855F7" },
  { p: 0.002, mult: 20, label: "20×", color: "#F59E0B" },
];
const SEG = 360 / TIERS.length;

function spin() {
  const r = Math.random();
  let acc = 0;
  for (const t of TIERS) { acc += t.p; if (r <= acc) return t; }
  return TIERS[0];
}

// Spin the wheel for a stardust multiplier — mostly lose, rare big hit.
export default function StardustWheel({ character, onSettle, busy }) {
  const [bet, setBet] = useState(100);
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const balance = character?.stardust ?? 0;
  const b = Math.min(MAX, Math.max(1, Math.floor(bet) || 1));

  async function play() {
    if (busy || spinning) return;
    if (balance < b) { setResult({ tier: TIERS[0], label: "Not enough stardust" }); return; }
    setSpinning(true); setResult(null);

    const tier = spin();
    const idx = TIERS.indexOf(tier);
    // Bring the winning segment's center to the top pointer.
    const targetMod = (360 - (idx * SEG + SEG / 2) + 360) % 360;
    const delta = (targetMod - (rotation % 360) + 360) % 360;
    const newRotation = rotation + 360 * 5 + delta;
    setRotation(newRotation);

    await new Promise((r) => setTimeout(r, 1050));
    const net = b * (tier.mult - 1);
    if (net !== 0) await onSettle(0, net);
    setSpinning(false);
    const label = tier.mult === 0 ? `Lost ${b} ✨` : tier.mult === 1 ? "Push" : `+${net} ✨ (${tier.label})`;
    setResult({ tier, label });
    if (tier.mult >= 5) burstBig();
    else if (tier.mult >= 2) burstWin();
  }

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold text-sm">Stardust Wheel</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">up to 20× · max {MAX.toLocaleString()}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">Spin for a multiplier. Most spins lose, but a rare 20× awaits.</p>
      <div className="flex items-center gap-2 mb-3">
        <input type="number" min={1} max={MAX} value={bet} onChange={(e) => setBet(e.target.value)} className="w-20 bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm" />
        <button onClick={() => setBet(Math.min(MAX, balance))} className="text-[10px] px-2 py-1 rounded bg-muted/40 border border-border/40">Max</button>
        <button onClick={play} disabled={busy || spinning} className="ml-auto painted-btn painted-btn-accent px-3 py-1.5 text-xs disabled:opacity-40">Spin</button>
      </div>
      <div className="h-28 flex flex-col items-center justify-center gap-2">
        <div className="relative">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 text-amber-300 text-base" style={{ filter: "drop-shadow(0 0 4px #fbbf24)" }}>▼</div>
          <motion.div
            animate={{ rotate: rotation }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="w-20 h-20 rounded-full border-2 border-amber-400/40"
            style={{
              background: `conic-gradient(from 0deg, ${TIERS.map((t, i) => `${t.color} ${i * SEG}deg ${(i + 1) * SEG}deg`).join(",")})`,
              boxShadow: "0 0 18px rgba(251,191,36,0.25)",
            }}
          />
        </div>
        <AnimatePresence>
          {result && !spinning && (
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={result.tier.mult >= 2
                ? { scale: [0.3, 1.3, 1], opacity: 1 }
                : { scale: [0.3, 1.05, 1], opacity: 1, x: [0, -6, 6, 0] }
              }
              transition={{ duration: 0.5 }}
              className="font-display font-bold text-sm"
              style={{ color: result.tier.color }}
            >{result.label}</motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}