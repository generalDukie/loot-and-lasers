import React, { useState, useEffect } from "react";
import { burstWin, burstBig } from "@/lib/casinoFx";
import { CASINO_MIN_NOVA_BET, CASINO_MAX_NOVA_BET } from "@/lib/gameData";
import { Package } from "lucide-react";

const PRESETS = [100, 250, 500, 750, 1000];
const COMPOSITION = [
  { label: "Worthless Scrap", mult: "0×", chance: "4/6" },
  { label: "Damaged Shipment", mult: "0.5×", chance: "1/6" },
  { label: "Alluring Contraband", mult: "2.5×", chance: "1/6" },
];

function parseNovaBet(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const half = Math.round(n * 2) / 2;
  if (Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) return null;
  return half;
}

export default function SmugglersCache({
  character,
  onSessionStart,
  onSessionAction,
  busy,
  activeSession,
}) {
  const balance = character?.nova_wagerable ?? character?.balances?.nova_wagerable ?? 0;
  const [bet, setBet] = useState(CASINO_MIN_NOVA_BET);
  const [sessionId, setSessionId] = useState("");
  const [sealed, setSealed] = useState(false);
  const [board, setBoard] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const wager = parseNovaBet(bet);
  const wagerOk =
    wager != null &&
    wager >= CASINO_MIN_NOVA_BET &&
    wager <= CASINO_MAX_NOVA_BET &&
    wager <= balance + 1e-9;

  useEffect(() => {
    if (activeSession?.session_id && activeSession?.state?.sealed !== false && activeSession?.status === "active") {
      setSessionId(activeSession.session_id);
      setSealed(true);
      setBoard(null);
      setSelected(null);
      setResult(null);
    }
  }, [activeSession]);

  async function start() {
    if (busy || !wagerOk || sealed) return;
    setResult(null);
    setBoard(null);
    setSelected(null);
    try {
      const res = await onSessionStart("smugglers_cache", wager);
      setSessionId(res.session_id || res.data?.session_id);
      setSealed(true);
    } catch {
      /* */
    }
  }

  async function pick(index) {
    if (busy || revealing || !sealed || !sessionId || selected != null) return;
    setRevealing(true);
    try {
      const res = await onSessionAction(sessionId, "select", { crate_index: index });
      const fullBoard = res.board || res.data?.board || [];
      setSelected(index);
      setBoard(fullBoard);
      const gross = res.gross_payout ?? 0;
      const net = res.net_result ?? 0;
      const label = res.label || res.cargo_id;
      setResult({
        label: `${label} — payout ${gross.toLocaleString()} Nova (net ${net >= 0 ? "+" : ""}${net})`,
        won: !!res.won,
        cargo: res.cargo_id,
      });
      setSealed(false);
      if (res.cargo_id === "alluring_contraband") burstBig();
      else if (gross > 0) burstWin();
    } catch {
      /* */
    } finally {
      setRevealing(false);
    }
  }

  function nextRound() {
    setSessionId("");
    setSealed(false);
    setBoard(null);
    setSelected(null);
    setResult(null);
  }

  return (
    <div className="painted-panel canvas-grain p-4">
      <div className="flex items-center gap-2 mb-1">
        <Package className="w-4 h-4 text-violet-300" />
        <h3 className="font-display font-bold text-sm text-violet-200">Smuggler&apos;s Cache</h3>
        <span className="text-[9px] text-muted-foreground ml-auto">Nova · pick a crate</span>
      </div>
      <div className="text-[10px] text-muted-foreground mb-3 space-y-0.5">
        {COMPOSITION.map((c) => (
          <div key={c.label} className="flex justify-between">
            <span>{c.chance} {c.label}</span>
            <span>{c.mult}</span>
          </div>
        ))}
      </div>
      {!sealed && !result && (
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
              step={0.5}
              value={bet}
              onChange={(e) => setBet(e.target.value)}
              className="w-28 bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm"
            />
            <span className="text-[10px] text-muted-foreground">100–1,000 · steps of 0.5</span>
          </div>
          <button type="button" onClick={start} disabled={busy || !wagerOk} className="w-full painted-btn py-2 text-sm disabled:opacity-40 mb-3">
            Start Round
          </button>
        </>
      )}
      {(sealed || board) && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {Array.from({ length: 6 }, (_, i) => {
            const cell = board?.[i];
            const isSel = selected === i;
            const open = !!cell && (selected != null);
            return (
              <button
                key={i}
                type="button"
                disabled={!sealed || busy || revealing || selected != null}
                onClick={() => pick(i)}
                className={`min-h-[72px] rounded-lg border text-[10px] px-1 py-2 disabled:opacity-70 ${
                  isSel ? "border-amber-300 bg-amber-500/10" : "border-border/50 bg-muted/30"
                }`}
              >
                {open
                  ? `${cell.label}\n${cell.mult}×`
                  : `Crate ${i + 1}\nSealed`}
              </button>
            );
          })}
        </div>
      )}
      {result && (
        <div className="space-y-2">
          <p className={`text-xs font-display ${result.won ? "text-green-400" : "text-muted-foreground"}`}>{result.label}</p>
          <button type="button" onClick={nextRound} className="w-full painted-btn py-1.5 text-xs">
            Next Round
          </button>
        </div>
      )}
    </div>
  );
}
