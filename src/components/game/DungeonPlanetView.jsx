import React from "react";
import { motion } from "framer-motion";
import { Skull, Crown, Swords, Gem, Lock, Check, Clock, Zap, Radar } from "lucide-react";
import { DUNGEON_PATROL_REWARD_MULT } from "@/lib/dungeonEngine";

function fmtMs(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

export default function DungeonPlanetView({
  planet,
  currentEnemy,
  paidContinue,
  continueCost,
  onFight,
  cooldownActive,
  cooldownRemaining,
  cooldownSkipCost,
  onSkipCooldown,
  patrol = false,
  onReturnToFront,
}) {
  const enemies = Array.from({ length: 10 }, (_, i) => i + 1);
  const patrolPct = Math.round(DUNGEON_PATROL_REWARD_MULT * 100);

  return (
    <div className="painted-panel canvas-grain p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl border-2" style={{ borderColor: planet.color, background: planet.color + "22" }}>
          {planet.icon}
        </div>
        <div>
          <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">
            {patrol ? "Patrol Route" : planet.id > 10 || planet.name?.includes("Wormhole") ? "∞ Wormhole" : `Planet ${planet.id}`}
          </p>
          <h3 className="font-display font-bold text-base" style={{ color: planet.color }}>{planet.name}</h3>
        </div>
        <div className="ml-auto text-right">
          {patrol ? (
            <>
              <p className="text-[10px] text-amber-300/90 font-display">~{patrolPct}% rewards</p>
              <p className="text-[10px] text-muted-foreground">No ship mods</p>
            </>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground">Progress</p>
              <p className="font-display font-bold text-lg">{currentEnemy - 1}/10</p>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{planet.description}</p>

      {patrol && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <span className="text-[11px] text-amber-200/90 flex items-center gap-1.5">
            <Radar className="w-3.5 h-3.5" /> Cleared world — farm encounters without advancing the crawl.
          </span>
          {onReturnToFront && (
            <button type="button" onClick={onReturnToFront} className="text-[10px] font-display font-bold text-primary shrink-0 underline-offset-2 hover:underline">
              Back to front
            </button>
          )}
        </div>
      )}

      {/* Enemy path */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {enemies.map((idx) => {
          const isBoss = idx === 10;
          const isCurrent = !patrol && idx === currentEnemy;
          const isCleared = !patrol && idx < currentEnemy;
          return (
            <div
              key={idx}
              className={`relative aspect-square rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                patrol
                  ? "border-amber-500/35 bg-amber-500/5 opacity-80"
                  : isCurrent
                  ? "border-primary bg-primary/10 border-glow-cyan"
                  : isCleared
                  ? "border-green-500/30 bg-green-500/5 opacity-60"
                  : "border-border/40 bg-muted/20 opacity-50"
              }`}
            >
              {isBoss ? (
                <Crown className="w-4 h-4 text-amber-300" />
              ) : isCleared ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : !patrol && idx > currentEnemy ? (
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <Swords className={`w-4 h-4 ${patrol ? "text-amber-300" : "text-primary"}`} />
              )}
              <span className="text-[9px] font-display font-bold mt-0.5">{isBoss ? "BOSS" : idx}</span>
              {isCurrent && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 text-[8px] bg-primary text-primary-foreground px-1 rounded font-bold"
                >
                  NEXT
                </motion.span>
              )}
            </div>
          );
        })}
      </div>

      {cooldownActive && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <span className="text-xs text-amber-300 flex items-center gap-1.5 font-display">
            <Clock className="w-3.5 h-3.5" /> Next battle in {fmtMs(cooldownRemaining)}
          </span>
          <button
            onClick={onSkipCooldown}
            className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-display font-bold flex items-center gap-1"
          >
            <Zap className="w-3 h-3" /> Skip · {cooldownSkipCost} 💎
          </button>
        </div>
      )}

      <button
        onClick={onFight}
        disabled={cooldownActive}
        className={`w-full text-sm px-4 py-2.5 rounded-lg font-display font-bold tracking-wide flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          paidContinue
            ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40"
            : patrol
            ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/35"
            : "painted-btn"
        }`}
      >
        {paidContinue ? (
          <><Gem className="w-4 h-4" /> Fight Again · {continueCost} 💎</>
        ) : patrol ? (
          <><Radar className="w-4 h-4" /> Patrol Encounter · {patrolPct}% loot</>
        ) : (
          <><Swords className="w-4 h-4" /> Fight Enemy {currentEnemy}{currentEnemy === 10 ? " (BOSS)" : ""}</>
        )}
      </button>
      {paidContinue && (
        <p className="mt-2 text-center text-[10px] text-amber-400/80 flex items-center justify-center gap-1">
          <Skull className="w-3 h-3" /> Free lives spent — pay to keep going. Wins cool down faster than losses.
        </p>
      )}
    </div>
  );
}
