import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { burstWin } from "@/lib/casinoFx";
import { STARDUST_COLOR } from "@/lib/gameData";
import StardustIcon, { STARDUST_GLYPH } from "@/components/game/StardustIcon";

const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

// Bet Stardust on a d6 roll — pick High (4–6) or Low (1–3). Server rolls.
export default function StardustDice({ character, onSettle, busy, maxBet = 100 }) {
  const MAX = Math.max(1, Math.floor(maxBet) || 100);
  const [bet, setBet] = useState(Math.min(100, MAX));
  const [result, setResult] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(0);
  const balance = character?.stardust ?? 0;
  const b = Math.min(MAX, Math.max(1, Math.floor(Number(bet)) || 1));

  useEffect(() => {
    setBet((prev) => Math.min(MAX, Math.max(1, Math.floor(Number(prev)) || 1)));
  }, [MAX]);

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
    try {
      const res = await onSettle("dice", b, { choice });
      const outcome = res.outcome || res.data?.outcome || {};
      const dice = outcome.dice || 1;
      const won = !!outcome.won;
      const delta = res.delta_stardust ?? res.data?.delta_stardust ?? (won ? b : -b);
      setFace(dice - 1);
      setRolling(false);
      const label = won
        ? `Rolled ${dice} — +${Math.abs(delta).toLocaleString()} ${STARDUST_GLYPH}`
        : `Rolled ${dice} — −${b.toLocaleString()} ${STARDUST_GLYPH}`;
      setResult({ won, dice, label });
      if (won) burstWin();
    } catch {
      setRolling(false);
    }
  }

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center gap-2 mb-1">
        <StardustIcon className="w-4 h-4" />
        <h3 className="font-display font-bold text-sm" style={{ color: STARDUST_COLOR }}>Stardust Dice</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">50% · 2× · max {MAX.toLocaleString()}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">Roll a die. Call High (4–6) or Low (1–3) — call it right to double your stardust.</p>
      <div className="flex items-center gap-2 mb-3">
        <input type="number" min={1} max={MAX} value={bet} onChange={(e) => setBet(e.target.value)} className="w-24 bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm" />
        <button type="button" onClick={() => setBet(Math.min(MAX, balance))} className="text-[10px] px-2 py-1 rounded bg-muted/40 border border-border/40">Max</button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <button type="button" onClick={() => roll("low")} disabled={busy || rolling} className="flex-1 painted-btn py-1.5 text-xs disabled:opacity-40">Low (1–3)</button>
        <button type="button" onClick={() => roll("high")} disabled={busy || rolling} className="flex-1 painted-btn py-1.5 text-xs disabled:opacity-40">High (4–6)</button>
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
