import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gem } from "lucide-react";
import { burstJackpot } from "@/lib/casinoFx";

const MAX = 100;
const JACKPOT_MULT = 25;
const JACKPOT_CHANCE = 0.01; // 1% — very low chance to win big
const SYMBOLS = ["💎", "7️⃣", "⭐", "🔔", "🍒", "🔮"];

// Stake Nova Crystals for a shot at a 25× jackpot. Capped at 100/bet so big
// wins can't be sustained for free.
export default function CrystalJackpot({ character, onSettle, busy }) {
  const [bet, setBet] = useState(MAX);
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState(["7️⃣", "⭐", "🔔"]);
  const balance = character?.nova_crystals ?? 0;
  const b = Math.min(MAX, Math.max(1, Math.floor(bet) || 1));

  // Cycle the reels rapidly while the lever is pulled.
  useEffect(() => {
    if (!spinning) return;
    const iv = setInterval(() => {
      setReels([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ]);
    }, 110);
    return () => clearInterval(iv);
  }, [spinning]);

  async function play() {
    if (busy || spinning) return;
    if (balance < b) { setResult({ won: false, label: "Not enough crystals" }); return; }
    setSpinning(true); setResult(null);
    await new Promise((r) => setTimeout(r, 1200));
    try {
      const res = await onSettle("jackpot", b);
      const outcome = res.outcome || res.data?.outcome || {};
      const won = !!outcome.won;
      const finalReels = won
        ? ["💎", "💎", "💎"]
        : [
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
          ];
      setReels(finalReels);
      setSpinning(false);
      const label = won ? `JACKPOT! +${b * JACKPOT_MULT} 💎` : `Lost ${b} 💎`;
      setResult({ won, label });
      if (won) burstJackpot();
    } catch (e) {
      setSpinning(false);
      setResult({ won: false, label: e?.message || "Sealed" });
    }
  }

  return (
    <div className="painted-panel canvas-grain p-4 relative">
      <div className="flex items-center gap-2 mb-1">
        <Gem className="w-4 h-4 text-amber-300" />
        <h3 className="font-display font-bold text-sm">Crystal Jackpot</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">1% · 25× · max {MAX}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">A 1% shot at 25× your bet in Nova Crystals. Long odds, huge payout.</p>
      <div className="flex items-center gap-2 mb-3">
        <input type="number" min={1} max={MAX} value={bet} onChange={(e) => setBet(e.target.value)} className="w-20 bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm" />
        <button onClick={() => setBet(Math.min(MAX, balance))} className="text-[10px] px-2 py-1 rounded bg-muted/40 border border-border/40">Max</button>
        <button onClick={play} disabled={busy || spinning} className="ml-auto painted-btn painted-btn-accent px-3 py-1.5 text-xs disabled:opacity-40">Pull</button>
      </div>
      <div className="h-20 flex flex-col items-center justify-center gap-1.5">
        <div className="flex gap-2 text-3xl">
          {reels.map((s, i) => (
            <motion.span
              key={i}
              animate={spinning
                ? { y: [0, -7, 0], opacity: [0.5, 1, 0.5], filter: ["blur(1px)", "blur(0px)", "blur(1px)"] }
                : { y: 0, opacity: 1, filter: "blur(0px)" }
              }
              transition={spinning ? { duration: 0.28, repeat: Infinity, delay: i * 0.06 } : { duration: 0.2 }}
              className={result && !result.won && !spinning ? "grayscale opacity-60" : ""}
            >{s}</motion.span>
          ))}
        </div>
        <AnimatePresence>
          {result && !spinning && (
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={result.won
                ? { scale: [0.3, 1.4, 1], opacity: 1 }
                : { scale: [0.3, 1.05, 1], opacity: 1, x: [0, -6, 6, -4, 4, 0] }
              }
              transition={{ duration: result.won ? 0.7 : 0.5 }}
              className={`font-display font-bold text-sm ${result.won ? "text-amber-300 glow-orange" : "text-red-400"}`}
            >{result.label}</motion.div>
          )}
        </AnimatePresence>
      </div>
      {result?.won && (
        <motion.div
          initial={{ opacity: 0.8 }} animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ boxShadow: "inset 0 0 60px rgba(251,191,36,0.5)" }}
        />
      )}
    </div>
  );
}