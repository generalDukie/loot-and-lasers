import React, { useState, useEffect } from "react";
import { burstWin, burstBig } from "@/lib/casinoFx";
import { CASINO_MIN_NOVA_BET, CASINO_MAX_NOVA_BET } from "@/lib/gameData";
import { Gem } from "lucide-react";

const LADDER = [
  { stage: 1, cumulative_pct: 40, mult: 1.25 },
  { stage: 2, cumulative_pct: 16, mult: 3 },
  { stage: 3, cumulative_pct: 6.5, mult: 8 },
  { stage: 4, cumulative_pct: 2.5, mult: 20 },
  { stage: 5, cumulative_pct: 1, mult: 50 },
];
const PRESETS = [100, 250, 500, 750, 1000];

export default function CrystalRefining({
  character,
  onSessionStart,
  onSessionAction,
  busy,
  activeSession,
}) {
  const balance = character?.nova_wagerable ?? character?.balances?.nova_wagerable ?? 0;
  const [bet, setBet] = useState(CASINO_MIN_NOVA_BET);
  const [session, setSession] = useState(null);
  const [result, setResult] = useState(null);
  const wager = Math.floor(Number(bet) || 0);
  const wagerOk =
    Number.isInteger(wager) &&
    wager >= CASINO_MIN_NOVA_BET &&
    wager <= CASINO_MAX_NOVA_BET &&
    wager <= balance;

  useEffect(() => {
    if (activeSession?.session_id) {
      setSession({
        session_id: activeSession.session_id,
        ...(activeSession.state || activeSession),
      });
    }
  }, [activeSession]);

  const stage = session?.stage || 0;
  const active = session && !session.completed && !session.shattered && session.status !== "completed";

  async function start() {
    if (busy || !wagerOk || active) return;
    setResult(null);
    try {
      const res = await onSessionStart("crystal_refining", wager);
      const s = res.session || res.data?.session;
      setSession({ session_id: res.session_id || res.data?.session_id, ...s });
      if (res.event === "crystal_shattered") {
        setResult({
          kind: "shatter",
          label: `Crystal shattered — lost ${wager.toLocaleString()} Nova`,
        });
      }
    } catch {
      /* toast upstream */
    }
  }

  async function refine() {
    if (busy || !session?.session_id || !session.can_refine) return;
    try {
      const res = await onSessionAction(session.session_id, "refine");
      const s = res.session || res.data?.session;
      setSession({ session_id: session.session_id, ...s });
      if (res.event === "crystal_shattered") {
        setResult({ kind: "shatter", label: "Crystal shattered — payout 0" });
      } else if (res.event === "final_refinement_completed") {
        const gross = res.gross_payout ?? 0;
        const net = res.net_result ?? 0;
        setResult({
          kind: "jackpot",
          label: `Stage 5 complete — payout ${gross.toLocaleString()} Nova (net ${net >= 0 ? "+" : ""}${net})`,
        });
        burstBig();
      } else {
        burstWin();
      }
    } catch {
      /* */
    }
  }

  async function collect() {
    if (busy || !session?.session_id || !session.can_collect) return;
    try {
      const res = await onSessionAction(session.session_id, "collect");
      const s = res.session || res.data?.session;
      setSession({ session_id: session.session_id, ...s });
      const gross = res.gross_payout ?? 0;
      const net = res.net_result ?? 0;
      setResult({
        kind: "collect",
        label: `Collected — payout ${gross.toLocaleString()} Nova (net ${net >= 0 ? "+" : ""}${net})`,
      });
      burstWin();
    } catch {
      /* */
    }
  }

  function resetLocal() {
    setSession(null);
    setResult(null);
  }

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center gap-2 mb-1">
        <Gem className="w-4 h-4 text-amber-300" />
        <h3 className="font-display font-bold text-sm text-amber-200">Crystal Refining</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">Nova · push your luck</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
        Refine up to five times. Percentages below are cumulative chances to reach each stage from a new session.
      </p>
      <div className="space-y-1 mb-3 text-[10px] text-muted-foreground">
        {LADDER.map((r) => (
          <div key={r.stage} className={`flex justify-between ${stage === r.stage ? "text-amber-200" : ""}`}>
            <span>Stage {r.stage} · {r.cumulative_pct}% reach</span>
            <span>{r.mult}× payout</span>
          </div>
        ))}
      </div>
      {!active && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={p > balance || busy}
                onClick={() => setBet(p)}
                className="text-[10px] px-2 py-1 rounded bg-muted/40 border border-border/40 disabled:opacity-30"
              >
                {p.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              min={CASINO_MIN_NOVA_BET}
              max={CASINO_MAX_NOVA_BET}
              value={bet}
              onChange={(e) => setBet(e.target.value)}
              className="w-28 bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm"
            />
            <span className="text-[10px] text-muted-foreground">100–1,000 Nova</span>
          </div>
          <button type="button" onClick={start} disabled={busy || !wagerOk} className="w-full painted-btn py-2 text-sm disabled:opacity-40">
            Start Refining
          </button>
        </>
      )}
      {active && (
        <div className="space-y-2">
          <p className="text-xs text-amber-100">Stage {stage} · collectible {session.collectible_mult}×</p>
          <div className="flex gap-2">
            {session.can_collect && (
              <button type="button" onClick={collect} disabled={busy} className="flex-1 painted-btn py-2 text-xs disabled:opacity-40">
                Collect
              </button>
            )}
            {session.can_refine && stage < 5 && (
              <button type="button" onClick={refine} disabled={busy} className="flex-1 painted-btn py-2 text-xs disabled:opacity-40">
                Refine Again
              </button>
            )}
          </div>
        </div>
      )}
      {result && (
        <div className="mt-3 space-y-2">
          <p className={`text-xs font-display ${result.kind === "shatter" ? "text-red-400" : "text-green-400"}`}>{result.label}</p>
          <button type="button" onClick={resetLocal} className="w-full painted-btn py-1.5 text-xs">
            Start New Session
          </button>
        </div>
      )}
    </div>
  );
}
