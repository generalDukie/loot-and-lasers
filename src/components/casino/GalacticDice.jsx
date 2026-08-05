import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { burstWin, burstBig } from "@/lib/casinoFx";
import { STARDUST_COLOR } from "@/lib/gameData";
import StardustIcon, { STARDUST_GLYPH } from "@/components/game/StardustIcon";

const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const CHOICES = [
  { id: "low", label: "Low — 2×" },
  { id: "seven", label: "Seven — 5×" },
  { id: "high", label: "High — 2×" },
];

function quickAmounts(balance, minBet, maxBet) {
  return [0.1, 0.25, 0.5, 1].map((pct) => {
    const amount = Math.floor(balance * pct);
    const disabled = amount < minBet || amount > maxBet || amount > balance || amount < 1;
    return { pct, amount, disabled, label: `${Math.round(pct * 100)}% — ${amount.toLocaleString()}` };
  });
}

export default function GalacticDice({ character, onSettle, busy, minBet = 1, maxBet = 100 }) {
  const MIN = Math.max(1, Math.floor(minBet) || 1);
  const MAX = Math.max(MIN, Math.floor(maxBet) || MIN);
  const balance = character?.stardust ?? 0;
  const [bet, setBet] = useState(MIN);
  const [choice, setChoice] = useState("");
  const [result, setResult] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState([4, 4]);
  const quads = useMemo(() => quickAmounts(balance, MIN, MAX), [balance, MIN, MAX]);
  const wager = Math.floor(Number(bet) || 0);
  const wagerOk = Number.isInteger(wager) && wager >= MIN && wager <= MAX && wager <= balance;
  const canRoll = !busy && !rolling && wagerOk && !!choice;

  useEffect(() => {
    setBet((prev) => {
      const n = Math.floor(Number(prev) || MIN);
      if (n < MIN) return MIN;
      if (n > MAX) return MAX;
      return n;
    });
  }, [MIN, MAX]);

  useEffect(() => {
    if (!rolling) return;
    const iv = setInterval(() => {
      setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 80);
    return () => clearInterval(iv);
  }, [rolling]);

  async function roll() {
    if (!canRoll) return;
    setRolling(true);
    setResult(null);
    try {
      const res = await onSettle("galactic_dice", wager, { choice });
      const dice = res.dice || res.data?.dice || [1, 1];
      const total = res.total ?? res.data?.total ?? dice[0] + dice[1];
      const won = !!(res.won ?? res.data?.won);
      const gross = res.gross_payout ?? res.data?.gross_payout ?? 0;
      const net = res.net_result ?? res.data?.net_result ?? 0;
      await new Promise((r) => setTimeout(r, 1500));
      setFaces(dice);
      setRolling(false);
      const sevenWin = won && choice === "seven";
      setResult({
        won,
        dice,
        total,
        label: won
          ? `Total ${total} — payout ${gross.toLocaleString()} ${STARDUST_GLYPH} (net ${net >= 0 ? "+" : ""}${net.toLocaleString()})`
          : `Total ${total} — lost ${wager.toLocaleString()} ${STARDUST_GLYPH}`,
        sevenWin,
      });
      if (sevenWin) burstBig();
      else if (won) burstWin();
    } catch {
      setRolling(false);
    }
  }

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center gap-2 mb-1">
        <StardustIcon className="w-4 h-4" />
        <h3 className="font-display font-bold text-sm" style={{ color: STARDUST_COLOR }}>Galactic Dice</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">Stardust · 2d6</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
        Two dice. Bet Low (2–6), Seven, or High (8–12). Payout is total returned including your wager.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {quads.map((q) => (
          <button
            key={q.pct}
            type="button"
            disabled={q.disabled || busy || rolling}
            onClick={() => setBet(q.amount)}
            className="text-[10px] px-2 py-1 rounded bg-muted/40 border border-border/40 disabled:opacity-30"
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="number"
          min={MIN}
          max={MAX}
          value={bet}
          onChange={(e) => setBet(e.target.value)}
          className="w-28 bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm"
        />
        <span className="text-[10px] text-muted-foreground">min {MIN.toLocaleString()} · max {MAX.toLocaleString()}</span>
      </div>
      {!wagerOk && (
        <p className="text-[10px] text-red-400 mb-2">Enter a whole-number wager between {MIN.toLocaleString()} and {MAX.toLocaleString()} within your balance.</p>
      )}
      <div className="flex items-center gap-2 mb-2">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChoice(c.id)}
            disabled={busy || rolling}
            className={`flex-1 painted-btn py-1.5 text-xs disabled:opacity-40 ${choice === c.id ? "ring-1 ring-amber-300/60" : ""}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={roll} disabled={!canRoll} className="w-full painted-btn py-2 text-sm disabled:opacity-40 mb-3">
        {rolling ? "Rolling…" : "Roll"}
      </button>
      <div className="h-20 flex items-center justify-center gap-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={rolling ? "roll" : result ? "res" : "idle"}
            className="flex flex-col items-center"
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
          >
            <div className="flex gap-3 text-4xl">
              <span>{FACES[(faces[0] || 1) - 1]}</span>
              <span>{FACES[(faces[1] || 1) - 1]}</span>
            </div>
            {result && (
              <span className={`font-display font-bold text-sm mt-1 text-center ${result.sevenWin ? "text-amber-300" : result.won ? "text-green-400" : "text-red-400"}`}>
                {result.label}
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
