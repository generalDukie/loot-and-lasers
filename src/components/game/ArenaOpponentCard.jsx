import React from "react";
import { motion } from "framer-motion";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import { Swords, Zap, Trophy, Clock, User, Flame } from "lucide-react";
import { avatarPropsFor, previewArenaMatch } from "@/lib/arenaEngine";
import StardustIcon from "@/components/game/StardustIcon";

function lastOnline(mins) {
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const RISK_STYLES = {
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  orange: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  rose: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

function fmtDelta(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

export default function ArenaOpponentCard({
  opponent,
  player,
  playerPower,
  freeBattle = true,
  onChallenge,
  cooldownActive,
  skipCost,
  disabled,
}) {
  const ap = avatarPropsFor(opponent);
  const winRate = (opponent.arena_wins || 0) + (opponent.arena_losses || 0) > 0
    ? Math.round(((opponent.arena_wins || 0) / ((opponent.arena_wins || 0) + (opponent.arena_losses || 0))) * 100)
    : null;

  const { onWin, onLoss, risk } = previewArenaMatch(player, opponent, { free: freeBattle, playerPower });

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      className="relative overflow-hidden rounded-2xl border border-border/60 painted-panel painted-frame canvas-grain flex flex-col"
    >
      {/* Card atmosphere */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: opponent.isBot
          ? "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(34,211,238,0.12), transparent 60%)"
          : "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(52,211,153,0.16), transparent 60%)",
      }} />
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-56 h-56 rounded-full blur-3xl pointer-events-none opacity-40"
        style={{ background: opponent.isBot ? "rgba(34,211,238,0.35)" : "rgba(52,211,153,0.4)" }}
      />

      <div className="relative p-5 sm:p-6 flex flex-col items-center flex-1">
        <div className="relative">
          <div
            className="rounded-2xl overflow-hidden border-2"
            style={{
              borderColor: opponent.isBot ? "rgba(34,211,238,0.45)" : "rgba(52,211,153,0.55)",
              boxShadow: opponent.isBot
                ? "0 0 28px rgba(34,211,238,0.28)"
                : "0 0 28px rgba(52,211,153,0.32)",
            }}
          >
            <CharacterAvatar {...ap} size={148} />
          </div>
          <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 min-w-[2.25rem] px-2 h-6 rounded-full bg-primary text-primary-foreground text-[11px] font-display font-black flex items-center justify-center border-2 border-background shadow">
            {opponent.level}
          </span>
        </div>

        {!opponent.isBot ? (
          <span className="mt-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[9px] font-display font-bold tracking-wide border border-emerald-500/35">
            <User className="w-2.5 h-2.5" /> REAL PLAYER
          </span>
        ) : (
          <span className="mt-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300/80 text-[9px] font-display font-bold tracking-wide border border-cyan-500/25">
            SIMULANT
          </span>
        )}

        <h4 className="font-display font-bold text-lg mt-2 truncate max-w-full tracking-wide">{opponent.name}</h4>
        <p className="text-xs text-muted-foreground">{opponent.race} · {opponent.class}</p>
        {opponent.guild && (
          <p className="text-[11px] text-accent font-display font-semibold mt-0.5 truncate max-w-full">{opponent.guild}</p>
        )}

        <div className="mt-4 w-full grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-background/40 border border-border/40 px-1.5 py-2">
            <Trophy className="w-3.5 h-3.5 mx-auto text-amber-300" />
            <p className="font-display font-bold text-sm text-amber-300 mt-0.5">{opponent.arena_rating}</p>
            <p className="text-[8px] text-muted-foreground uppercase tracking-wide">Rating</p>
          </div>
          <div className="rounded-lg bg-background/40 border border-border/40 px-1.5 py-2">
            <Zap className="w-3.5 h-3.5 mx-auto text-cyan-300" />
            <p className="font-display font-bold text-sm text-cyan-300 mt-0.5">{opponent.power}</p>
            <p className="text-[8px] text-muted-foreground uppercase tracking-wide">Power</p>
          </div>
          <div className="rounded-lg bg-background/40 border border-border/40 px-1.5 py-2">
            <Flame className="w-3.5 h-3.5 mx-auto text-rose-300" />
            <p className="font-display font-bold text-sm mt-0.5">
              <span className="text-green-400">{opponent.arena_wins || 0}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-red-400">{opponent.arena_losses || 0}</span>
            </p>
            <p className="text-[8px] text-muted-foreground uppercase tracking-wide">
              {winRate != null ? `${winRate}%` : "W/L"}
            </p>
          </div>
        </div>

        {/* Risk / reward stakes — Elo payouts, risk from rating+power */}
        <div className="mt-4 w-full rounded-xl border border-border/50 bg-background/35 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border/40">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-display font-black tracking-wider border ${RISK_STYLES[risk.tone]}`}>
              {risk.label}
            </span>
            <span className="text-[9px] text-muted-foreground font-display tracking-wide">
              {freeBattle ? "FREE STAKES" : "RATING ONLY"}
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border/40">
            <div className="px-2.5 py-2 text-center">
              <p className="text-[8px] uppercase tracking-wide text-emerald-400/80 font-display mb-0.5">Win</p>
              <p className="font-display font-black text-sm text-emerald-300">{fmtDelta(onWin.arena_rating_delta)}</p>
              {freeBattle ? (
                <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight inline-flex items-center gap-1">
                  {onWin.experience} XP · {onWin.stardust} <StardustIcon className="w-2.5 h-2.5" glow={false} />
                </p>
              ) : (
                <p className="text-[9px] text-muted-foreground mt-0.5">rating</p>
              )}
            </div>
            <div className="px-2.5 py-2 text-center">
              <p className="text-[8px] uppercase tracking-wide text-rose-400/80 font-display mb-0.5">Lose</p>
              <p className="font-display font-black text-sm text-rose-300">{fmtDelta(onLoss.arena_rating_delta)}</p>
              {freeBattle ? (
                <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">
                  no loot
                </p>
              ) : (
                <p className="text-[9px] text-muted-foreground mt-0.5">rating</p>
              )}
            </div>
          </div>
        </div>

        <p className="mt-3 text-[10px] text-muted-foreground/80 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" /> {lastOnline(opponent.lastOnlineMins)}
        </p>
      </div>

      <div className="relative p-4 pt-0 mt-auto">
        <button
          onClick={() => onChallenge(opponent, { skip: cooldownActive })}
          disabled={disabled}
          className={`w-full py-3 rounded-xl text-sm font-display font-black tracking-wider disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-shadow ${
            cooldownActive
              ? "bg-gradient-to-r from-amber-500 to-orange-500 text-black border-2 border-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.35)] hover:shadow-[0_0_24px_rgba(251,191,36,0.55)]"
              : "painted-btn"
          }`}
        >
          {cooldownActive ? (
            <><Zap className="w-3.5 h-3.5" /> SKIP & FIGHT · {skipCost} 💎</>
          ) : (
            <><Swords className="w-3.5 h-3.5" /> CHALLENGE</>
          )}
        </button>
      </div>
    </motion.div>
  );
}
