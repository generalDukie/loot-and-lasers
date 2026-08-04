import React from "react";
import { formatCombatLogLine } from "@/lib/combatPresentation";

/**
 * Dev-only combat diagnostics. Never shown to production players unless
 * explicitly enabled via localStorage ll_combat_dev_diagnostics=1 (dev builds / ?combatDev=1).
 */
export default function CombatDevDiagnostics({ events = [], currentIdx = -1, status }) {
  const ev = currentIdx >= 0 ? events[currentIdx] : null;
  return (
    <div className="absolute top-14 left-2 z-[50] max-w-[280px] rounded border border-amber-400/40 bg-black/80 p-2 text-[10px] font-mono text-amber-100/90 pointer-events-none">
      <p className="font-display font-bold text-amber-300 tracking-wider mb-1">COMBAT DEV</p>
      <p>idx {currentIdx}/{Math.max(0, events.length - 1)}</p>
      {ev && (
        <>
          <p>type={String(ev.type)} kind={String(ev.kind || ev.missKind || "—")}</p>
          <p>
            dmg={String(ev.damage ?? 0)} crit={String(!!ev.crit)} dtype={String(ev.damageType || "—")}
          </p>
          <p>
            dodge={String(!!ev.dodged)} miss={String(!!ev.missed)} shield={String(!!ev.shieldHit)}
          </p>
          <p className="truncate opacity-80">{formatCombatLogLine(ev, currentIdx)}</p>
        </>
      )}
      {status && (
        <div className="mt-1 pt-1 border-t border-amber-400/20 space-y-0.5">
          <p>
            P 🛡{status.player?.barrier || 0} 👻{status.player?.phantomCharges || 0} ⚡
            {status.player?.overclockStacks || 0} KT={status.player?.kineticTantrum || "—"}
          </p>
          <p>
            E 🛡{status.opponent?.barrier || 0} 👻{status.opponent?.phantomCharges || 0} ⚡
            {status.opponent?.overclockStacks || 0} KT={status.opponent?.kineticTantrum || "—"}
          </p>
        </div>
      )}
    </div>
  );
}
