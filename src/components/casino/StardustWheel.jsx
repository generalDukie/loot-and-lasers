import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { burstWin, burstBig } from "@/lib/casinoFx";
import { CASINO_WHEEL_TIERS, STARDUST_COLOR } from "@/lib/gameData";
import StardustIcon, { STARDUST_GLYPH } from "@/components/game/StardustIcon";

const SPIN_DURATION_S = 2.0;
const SPIN_EXTRA_TURNS = 4;
const SPIN_EASE = [0.08, 0.82, 0.05, 1];

const TIERS = CASINO_WHEEL_TIERS.map((t) => ({
  ...t,
  color: t.color || "#9CA3AF",
}));

function buildSegments(tiers) {
  let angle = 0;
  return tiers.map((t) => {
    const span = t.p * 360;
    const start = angle;
    const mid = angle + span / 2;
    angle += span;
    return { ...t, start, mid, span };
  });
}

function quickAmounts(balance, minBet, maxBet) {
  return [0.1, 0.25, 0.5, 1].map((pct) => {
    const amount = Math.floor(balance * pct);
    const disabled = amount < minBet || amount > maxBet || amount > balance || amount < 1;
    return { pct, amount, disabled, label: `${Math.round(pct * 100)}% — ${amount.toLocaleString()}` };
  });
}

export default function StardustWheel({ character, onSettle, busy, minBet = 1, maxBet = 100 }) {
  const MIN = Math.max(1, Math.floor(minBet) || 1);
  const MAX = Math.max(MIN, Math.floor(maxBet) || MIN);
  const [bet, setBet] = useState(MIN);
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const balance = character?.stardust ?? 0;
  const wager = Math.floor(Number(bet) || 0);
  const wagerOk = Number.isInteger(wager) && wager >= MIN && wager <= MAX && wager <= balance;
  const segments = useMemo(() => buildSegments(TIERS), []);
  const quads = useMemo(() => quickAmounts(balance, MIN, MAX), [balance, MIN, MAX]);

  useEffect(() => {
    setBet((prev) => {
      const n = Math.floor(Number(prev) || MIN);
      if (n < MIN) return MIN;
      if (n > MAX) return MAX;
      return n;
    });
  }, [MIN, MAX]);

  const gradient = useMemo(
    () => `conic-gradient(from 0deg, ${segments.map((s) => `${s.color} ${s.start}deg ${s.start + s.span}deg`).join(",")})`,
    [segments],
  );

  async function play() {
    if (busy || spinning || !wagerOk) return;
    setSpinning(true);
    setResult(null);
    try {
      const res = await onSettle("stardust_wheel", wager);
      const tierId = res.tier_id || res.data?.tier_id;
      const mult = res.payout_mult ?? res.data?.payout_mult ?? 0;
      const seg =
        segments.find((s) => s.id === tierId) ||
        segments.find((s) => s.mult === mult) ||
        segments[0];
      const mid01 = res.segment?.mid ?? res.data?.segment?.mid;
      const midDeg = mid01 != null ? ((mid01 % 1) + 1) % 1 * 360 : seg.mid;
      const jitter = (Math.random() * 0.4 - 0.2) * Math.min(seg.span * 0.5, 8);
      const targetMod = (360 - (midDeg + jitter) + 360) % 360;
      const delta = (targetMod - (rotation % 360) + 360) % 360;
      const newRotation = rotation + 360 * SPIN_EXTRA_TURNS + delta;
      setRotation(newRotation);

      await new Promise((r) => setTimeout(r, Math.round(SPIN_DURATION_S * 1000) + 40));
      const gross = res.gross_payout ?? res.data?.gross_payout ?? 0;
      const net = res.net_result ?? res.data?.net_result ?? 0;
      const shove = !!(res.shove ?? res.data?.shove);
      setSpinning(false);
      let label;
      if (mult === 0) label = `Lose — ${wager.toLocaleString()} ${STARDUST_GLYPH}`;
      else if (shove || mult === 1) label = `Shove — stake returned (net 0)`;
      else label = `${seg.label} — payout ${gross.toLocaleString()} ${STARDUST_GLYPH} (net ${net >= 0 ? "+" : ""}${net.toLocaleString()})`;
      setResult({ tier: seg, label, mult });
      if (mult >= 10) burstBig();
      else if (mult >= 5) burstWin();
      else if (mult >= 2) burstWin();
    } catch {
      setSpinning(false);
    }
  }

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center gap-2 mb-1">
        <StardustIcon className="w-4 h-4" />
        <h3 className="font-display font-bold text-sm" style={{ color: STARDUST_COLOR }}>Stardust Wheel</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">Stardust · weighted</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
        Segment sizes match odds. Shove returns your wager (net zero).
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {quads.map((q) => (
          <button
            key={q.pct}
            type="button"
            disabled={q.disabled || busy || spinning}
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
        <button
          type="button"
          onClick={play}
          disabled={busy || spinning || !wagerOk}
          className="painted-btn px-4 py-1.5 text-xs disabled:opacity-40"
        >
          {spinning ? "Spinning…" : "Spin"}
        </button>
      </div>
      <div className="relative mx-auto w-36 h-36 mb-2">
        <div className="absolute left-1/2 -top-1 -translate-x-1/2 text-amber-300 z-10 text-sm">▼</div>
        <motion.div
          className="w-full h-full rounded-full border border-amber-400/40"
          style={{ background: gradient }}
          animate={{ rotate: rotation }}
          transition={{ duration: SPIN_DURATION_S, ease: SPIN_EASE }}
        />
      </div>
      <div className="flex flex-wrap justify-center gap-1 mb-2">
        {TIERS.filter((t) => t.mult >= 2).map((t) => (
          <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded border border-border/40" style={{ color: t.color }}>
            {t.label}
          </span>
        ))}
      </div>
      {result && (
        <p className={`text-center text-xs font-display ${result.mult >= 2 ? "text-green-400" : "text-muted-foreground"}`}>
          {result.label}
        </p>
      )}
    </div>
  );
}
