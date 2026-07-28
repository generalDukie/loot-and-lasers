import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gem } from "lucide-react";
import { burstWin } from "@/lib/casinoFx";

const MAX = 100;

// Bet Nova Crystals on a coin flip — server rolls (25% to double).
export default function CrystalFlip({ character, onSettle, busy }) {
  const [bet, setBet] = useState(10);
  const [result, setResult] = useState(null);
  const [flipping, setFlipping] = useState(false);
  const balance = character?.nova_crystals ?? 0;
  const b = Math.min(MAX, Math.max(1, Math.floor(bet) || 1));

  async function play() {
    if (busy || flipping) return;
    if (balance < b) { setResult({ won: false, label: "Not enough crystals" }); return; }
    setFlipping(true); setResult(null);
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await onSettle("flip", b);
      const outcome = res.outcome || res.data?.outcome || {};
      const won = !!outcome.won;
      setFlipping(false);
      setResult({ won, label: won ? `Doubled! +${b} 💎` : `Lost ${b} 💎` });
      if (won) burstWin();
    } catch (e) {
      setFlipping(false);
      setResult({ won: false, label: e?.message || "Sealed" });
    }
  }

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center gap-2 mb-1">
        <Gem className="w-4 h-4 text-amber-300" />
        <h3 className="font-display font-bold text-sm">Crystal Flip</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">25% · 2× · max {MAX}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">Flip the coin. 25% chance to double your Nova Crystals.</p>
      <div className="flex items-center gap-2 mb-3">
        <input type="number" min={1} max={MAX} value={bet} onChange={(e) => setBet(e.target.value)} className="w-20 bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm" />
        <button onClick={() => setBet(Math.min(MAX, balance))} className="text-[10px] px-2 py-1 rounded bg-muted/40 border border-border/40">Max</button>
        <button onClick={play} disabled={busy || flipping} className="ml-auto painted-btn px-3 py-1.5 text-xs disabled:opacity-40">Flip</button>
      </div>
      <div className="h-14 flex items-center justify-center">
        <AnimatePresence>
          {result && !flipping && (
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.2, 1], opacity: 1 }}
              className={`font-display font-bold text-sm ${result.won ? "text-green-400" : "text-red-400"}`}
            >{result.label}</motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
