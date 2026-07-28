import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { burstWin, burstBig } from "@/lib/casinoFx";
import { CASINO_WHEEL_TIERS, STARDUST_COLOR } from "@/lib/gameData";
import StardustIcon, { STARDUST_GLYPH } from "@/components/game/StardustIcon";

const TIER_COLORS = {
  0: "#6B7280",
  1: "#9CA3AF",
  2: "#22C55E",
  3: "#3B82F6",
  5: "#A855F7",
  10: "#F59E0B",
  25: "#F97316",
};

/** Full spin length — long enough to build suspense before the crawl to a stop. */
const SPIN_DURATION_S = 5.4;
/** Extra full turns before landing on the winning segment. */
const SPIN_EXTRA_TURNS = 7;
/**
 * Cubic-bezier: snappy takeoff, then a long coast that eases into a dead stop
 * (classic wheel “will it… will it…” finish).
 */
const SPIN_EASE = [0.08, 0.82, 0.05, 1];

const TIERS = CASINO_WHEEL_TIERS.map((t) => ({
  ...t,
  color: t.color || TIER_COLORS[t.mult] || "#9CA3AF",
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

// Spin the wheel for a stardust multiplier — server rolls outcome & pays bet×(mult−1).
export default function StardustWheel({ character, onSettle, busy, maxBet = 100 }) {
  const MAX = Math.max(1, Math.floor(maxBet) || 100);
  const [bet, setBet] = useState(Math.min(100, MAX));
  const [result, setResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const balance = character?.stardust ?? 0;
  const b = Math.min(MAX, Math.max(1, Math.floor(Number(bet)) || 1));
  const segments = useMemo(() => buildSegments(TIERS), []);

  useEffect(() => {
    setBet((prev) => Math.min(MAX, Math.max(1, Math.floor(Number(prev)) || 1)));
  }, [MAX]);

  const gradient = useMemo(
    () => `conic-gradient(from 0deg, ${segments.map((s) => `${s.color} ${s.start}deg ${s.start + s.span}deg`).join(",")})`,
    [segments],
  );

  async function play() {
    if (busy || spinning) return;
    if (balance < b) { setResult({ tier: TIERS[0], label: "Not enough stardust" }); return; }
    setSpinning(true); setResult(null);

    try {
      const res = await onSettle("wheel", b);
      const outcome = res.outcome || res.data?.outcome || {};
      const mult = outcome.mult ?? outcome.payout_mult ?? 0;
      const tier = TIERS.find((t) => t.mult === mult) || TIERS[0];
      const seg = segments.find((s) => s.mult === mult) || segments[0];
      // Land a touch inside the segment so the pointer doesn't sit on a seam.
      const jitter = (Math.random() * 0.5 - 0.25) * Math.min(seg.span * 0.6, 12);
      const targetMod = (360 - (seg.mid + jitter) + 360) % 360;
      const delta = (targetMod - (rotation % 360) + 360) % 360;
      const newRotation = rotation + 360 * SPIN_EXTRA_TURNS + delta;
      setRotation(newRotation);

      await new Promise((r) => setTimeout(r, Math.round(SPIN_DURATION_S * 1000) + 80));
      const net = res.delta_stardust ?? res.data?.delta_stardust ?? Math.round(b * (mult - 1));
      setSpinning(false);
      const label = mult === 0
        ? `Lost ${b.toLocaleString()} ${STARDUST_GLYPH}`
        : mult === 1
          ? "Push — stake returned"
          : `+${Math.abs(net).toLocaleString()} ${STARDUST_GLYPH} (${tier.label})`;
      setResult({ tier, label });
      if (mult >= 10) burstBig();
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
        <span className="text-[9px] text-muted-foreground ml-auto">up to 25× · max {MAX.toLocaleString()}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
        Spin for a multiplier. Bust loses your stake; 2×–25× pays net profit of (mult−1)×bet.
      </p>
      <div className="flex items-center gap-2 mb-3">
        <input type="number" min={1} max={MAX} value={bet} onChange={(e) => setBet(e.target.value)} className="w-24 bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm" disabled={spinning} />
        <button type="button" onClick={() => setBet(Math.min(MAX, balance))} disabled={spinning} className="text-[10px] px-2 py-1 rounded bg-muted/40 border border-border/40 disabled:opacity-40">Max</button>
        <button type="button" onClick={play} disabled={busy || spinning} className="ml-auto painted-btn painted-btn-accent px-3 py-1.5 text-xs disabled:opacity-40">
          {spinning ? "Spinning…" : "Spin"}
        </button>
      </div>
      <div className="h-32 flex flex-col items-center justify-center gap-2">
        <div className="relative">
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 text-amber-300 text-base" style={{ filter: "drop-shadow(0 0 4px #fbbf24)" }}>▼</div>
          <motion.div
            animate={{ rotate: rotation }}
            transition={{ duration: SPIN_DURATION_S, ease: SPIN_EASE }}
            className="w-24 h-24 rounded-full border-2 border-amber-400/40"
            style={{
              background: gradient,
              boxShadow: spinning
                ? "0 0 22px rgba(251,191,36,0.45), 0 0 40px rgba(232,121,249,0.2)"
                : "0 0 18px rgba(251,191,36,0.25)",
            }}
          />
        </div>
        <div className="flex flex-wrap justify-center gap-1 px-1">
          {TIERS.filter((t) => t.mult >= 2).map((t) => (
            <span key={t.mult} className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded border border-border/40" style={{ color: t.color }}>
              {t.label}
            </span>
          ))}
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
