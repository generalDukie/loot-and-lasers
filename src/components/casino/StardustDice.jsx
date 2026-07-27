import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { burstWin } from "@/lib/casinoFx";

const MAX = 1000;
const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

// Bet Stardust on a d6 roll — pick High (4–6) or Low (1–3). 50% to double.
export default function StardustDice({ character, onSettle, busy }) {
  const [bet, setBet] = useState(100);
  const [result, setResult] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(0);
  const balance = character?.stardust ?? 0;
  const b = Math.min(MAX, Math.max(1, Math.floor(bet) || 1));

  // Tumble the die face rapidly while rolling for a real "rolling" feel.
  useEffect(() => {
    if (!rolling) return;
    const iv = setInterval(() => setFace(Math.floor(Math.random() * 6)), 90);
    return () => clearInterval(iv);
  }, [rolling]);

  async function roll(choice) {
    if (busy || rolling) return;
    if (balance < b) { setResult({ won: false, dice: 1, label: "Not enough stardust" }); return; }
    setRolling(true); setResult(null);
    await new Promise((r) => setTimeout(r, 900));
    const dice = 1 + Math.floor(Math.random() * 6);
    const high = dice >= 4;
    const won = (choice === "high" && high) || (choice === "low" && !high);
    await onSettle(0, won ? b : -b);
    setFace(dice - 1);
    setRolling(false);
    const label = won ? `Rolled ${dice} — +${b} ✨` : `Rolled ${dice} — -${b} ✨`;
    setResult({ won, dice, label });
    if (won) burstWin();
  }

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold text-sm">Stardust Dice</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">50% · 2× · max {MAX.toLocaleString()}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">Roll a die. Call High (4–6) or Low (1–3) — call it right to double your stardust.</p>
      <div className="flex items-center gap-2 mb-3">
        <input type="number" min={1} max={MAX} value={bet} onChange={(e) => setBet(e.target.value)} className="w-20 bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm" />
        <button onClick={() => setBet(Math.min(MAX, balance))} className="text-[10px] px-2 py-1 rounded bg-muted/40 border border-border/40">Max</button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => roll("low")} disabled={busy || rolling} className="flex-1 painted-btn py-1.5 text-xs disabled:opacity-40">Low (1–3)</button>
        <button onClick={() => roll("high")} disabled={busy || rolling} className="flex-1 painted-btn py-1.5 text-xs disabled:opacity-40">High (4–6)</button>
      </div>
      <div className="h-16 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {rolling ? (
            <motion.div
              key="roll"
              animate={{ rotate: [0, -30, 30, -20, 20, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 0.45, repeat: Infinity }}
              className="text-4xl text-foreground"
            >{FACES[face]}</motion.div>
          ) : result ? (
            <motion.div
              key="res"
              className="flex flex-col items-center"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={result.won
                ? { scale: [0.3, 1.3, 1], opacity: 1 }
                : { scale: [0.3, 1.1, 1], opacity: 1, x: [0, -8, 8, -5, 5, 0] }
              }
              transition={{ duration: result.won ? 0.6 : 0.5 }}
            >
              <span className={`text-3xl ${result.won ? "text-green-400 glow-green" : "text-red-400"}`}>{FACES[result.dice - 1]}</span>
              <span className={`font-display font-bold text-sm mt-1 ${result.won ? "text-green-400" : "text-red-400"}`}>{result.label}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}