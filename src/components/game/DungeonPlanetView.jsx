import React from "react";
import { motion } from "framer-motion";
import { Skull, Crown, Swords, Gem, Lock, Check, Clock, Zap, Radar } from "lucide-react";
import { DUNGEON_PATROL_REWARD_MULT } from "@/lib/dungeonEngine";

function fmtMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function EncounterCell({ idx, isBoss, isCurrent, isCleared, locked, patrol }) {
  const accent = isBoss
    ? "border-amber-400/55 bg-gradient-to-b from-amber-500/20 to-amber-950/30"
    : patrol
    ? "border-amber-500/30 bg-amber-500/8"
    : isCurrent
    ? "border-primary/70 bg-gradient-to-b from-primary/20 to-primary/5"
    : isCleared
    ? "border-emerald-500/35 bg-emerald-500/8"
    : locked
    ? "border-border/35 bg-muted/15 opacity-45"
    : "border-border/45 bg-muted/25";

  return (
    <div
      className={`relative min-h-0 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors ${accent} ${
        isCurrent && !patrol ? "shadow-[0_0_14px_hsl(190_90%_50%/0.22)]" : ""
      }`}
    >
      {isCurrent && !patrol && (
        <motion.span
          className="absolute inset-0 rounded-xl border border-primary/40 pointer-events-none"
          animate={{ opacity: [0.35, 0.9, 0.35] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {isBoss ? (
        <Crown className="w-3.5 h-3.5 text-amber-300 relative z-[1]" />
      ) : isCleared ? (
        <Check className="w-3.5 h-3.5 text-emerald-400 relative z-[1]" />
      ) : locked ? (
        <Lock className="w-3 h-3 text-muted-foreground relative z-[1]" />
      ) : (
        <Swords className={`w-3.5 h-3.5 relative z-[1] ${patrol ? "text-amber-300" : "text-primary"}`} />
      )}
      <span
        className={`relative z-[1] text-[8px] font-display font-bold tracking-wide ${
          isBoss ? "text-amber-200" : isCleared ? "text-emerald-300/90" : "text-foreground/80"
        }`}
      >
        {isBoss ? "BOSS" : idx}
      </span>
      {isCurrent && !patrol && (
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-[2] text-[7px] font-display font-bold tracking-wider px-1.5 py-px rounded-full bg-primary text-primary-foreground shadow-sm">
          NEXT
        </span>
      )}
    </div>
  );
}

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
  const cleared = patrol ? 10 : Math.max(0, currentEnemy - 1);
  const progressPct = (cleared / 10) * 100;
  const isWormhole = planet.id > 10 || planet.name?.includes("Wormhole");
  const sectorLabel = patrol ? "Patrol Route" : isWormhole ? "∞ Wormhole" : `Sector ${planet.id}`;
  const tint = planet.color || "#22D3EE";

  return (
    <div
      className="relative h-full min-h-0 rounded-2xl border border-border/60 overflow-hidden flex flex-col"
      style={{
        background: `linear-gradient(180deg, hsl(230 24% 12%) 0%, hsl(232 32% 7%) 100%)`,
        boxShadow: `inset 0 1px 0 hsl(0 0% 100% / 0.06), 0 10px 28px hsl(232 40% 2% / 0.55), 0 0 0 1px ${tint}18`,
      }}
    >
      {/* Planet-tinted wash */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background: `radial-gradient(ellipse at 50% -10%, ${tint}28 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, ${tint}10 0%, transparent 40%)`,
        }}
      />

      {/* Top accent rail */}
      <div
        className="absolute top-0 inset-x-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${tint}, transparent)` }}
      />

      <div className="relative z-[1] flex-1 min-h-0 flex flex-col p-3 sm:p-3.5">
        {/* Header */}
        <header className="shrink-0 mb-2.5">
          <div className="flex items-start gap-2.5">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 border"
              style={{
                borderColor: `${tint}66`,
                background: `linear-gradient(160deg, ${tint}33, ${tint}10)`,
                boxShadow: `0 0 18px ${tint}22, inset 0 1px 0 hsl(0 0% 100% / 0.12)`,
              }}
            >
              {planet.icon}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[9px] font-display tracking-[0.2em] uppercase text-muted-foreground/90">
                {sectorLabel}
              </p>
              <h3 className="font-display font-bold text-[15px] leading-tight truncate" style={{ color: tint }}>
                {planet.name}
              </h3>
              {!patrol && planet.bossName && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  <span className="text-amber-300/80">{planet.bossEmoji || "♛"}</span>{" "}
                  {planet.bossName}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right pt-0.5">
              {patrol ? (
                <>
                  <p className="text-[9px] uppercase tracking-wider text-amber-300/80 font-display">Farm</p>
                  <p className="font-display font-bold text-sm text-amber-200 leading-none">~{patrolPct}%</p>
                </>
              ) : (
                <>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-display">Cleared</p>
                  <p className="font-display font-bold text-base leading-none tabular-nums">
                    <span style={{ color: tint }}>{cleared}</span>
                    <span className="text-muted-foreground/70 text-xs font-semibold">/10</span>
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Progress track */}
          <div className="mt-2.5 h-1 rounded-full bg-muted/40 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{
                background: patrol
                  ? "linear-gradient(90deg, #F59E0B88, #FBBF24)"
                  : `linear-gradient(90deg, ${tint}88, ${tint})`,
              }}
            />
          </div>
        </header>

        <p className="shrink-0 text-[11px] text-muted-foreground/90 leading-snug mb-2 line-clamp-2">
          {planet.description}
        </p>

        {patrol && (
          <div className="shrink-0 mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-2.5 py-1.5">
            <span className="text-[10px] text-amber-100/90 flex items-center gap-1.5 min-w-0">
              <Radar className="w-3.5 h-3.5 shrink-0 text-amber-300" />
              <span className="truncate">Cleared world — farm without advancing.</span>
            </span>
            {onReturnToFront && (
              <button
                type="button"
                onClick={onReturnToFront}
                className="text-[10px] font-display font-bold text-primary shrink-0 hover:underline underline-offset-2"
              >
                Front
              </button>
            )}
          </div>
        )}

        {!patrol && planet.shipMod && (
          <div
            className="shrink-0 mb-2 flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
            style={{ borderColor: `${tint}33`, background: `${tint}0d` }}
          >
            <Gem className="w-3.5 h-3.5 shrink-0 text-amber-300" />
            <p className="text-[10px] text-muted-foreground min-w-0 truncate">
              Boss reward · <span className="font-display font-bold text-amber-200/95">{planet.shipMod}</span>
            </p>
          </div>
        )}

        {/* Encounter roster */}
        <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border/40 bg-background/25 p-2">
          <div className="shrink-0 flex items-center justify-between mb-1.5 px-0.5">
            <p className="text-[9px] font-display uppercase tracking-[0.18em] text-muted-foreground">
              Encounter path
            </p>
            <p className="text-[9px] text-muted-foreground/80">1–9 · Boss</p>
          </div>
          <div className="grid grid-cols-5 grid-rows-2 gap-1.5 flex-1 min-h-0">
            {enemies.map((idx) => {
              const isBoss = idx === 10;
              const isCurrent = !patrol && idx === currentEnemy;
              const isCleared = !patrol && idx < currentEnemy;
              const locked = !patrol && idx > currentEnemy;
              return (
                <EncounterCell
                  key={idx}
                  idx={idx}
                  isBoss={isBoss}
                  isCurrent={isCurrent}
                  isCleared={isCleared}
                  locked={locked}
                  patrol={patrol}
                />
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 mt-2.5 space-y-2">
          {cooldownActive && (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/8 px-2.5 py-1.5 gap-2">
              <span className="text-[11px] text-amber-200 flex items-center gap-1.5 font-display min-w-0 tabular-nums">
                <Clock className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                <span className="truncate">Cooldown {fmtMs(cooldownRemaining)}</span>
              </span>
              <button
                type="button"
                onClick={onSkipCooldown}
                className="text-[10px] px-2 py-1 rounded-lg border border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 font-display font-bold flex items-center gap-1 shrink-0"
              >
                <Zap className="w-3 h-3" /> Skip · {cooldownSkipCost}💎
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onFight}
            disabled={cooldownActive}
            className={`w-full text-xs sm:text-sm px-3 py-2.5 rounded-xl font-display font-bold tracking-wide flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              paidContinue
                ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/40"
                : patrol
                ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-100 border border-amber-500/35"
                : "painted-btn"
            }`}
          >
            {paidContinue ? (
              <><Gem className="w-4 h-4" /> Fight · {continueCost} 💎</>
            ) : patrol ? (
              <><Radar className="w-4 h-4" /> Patrol · {patrolPct}%</>
            ) : (
              <><Swords className="w-4 h-4" /> Fight {currentEnemy}{currentEnemy === 10 ? " · BOSS" : ""}</>
            )}
          </button>

          {paidContinue && (
            <p className="text-center text-[9px] text-amber-400/80 flex items-center justify-center gap-1">
              <Skull className="w-3 h-3" /> Free lives spent — pay to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
