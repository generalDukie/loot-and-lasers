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
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      className="relative overflow-hidden rounded-xl border border-border/60 painted-panel painted-frame canvas-grain flex flex-col h-full"
    >
      <div className="absolute inset-0 pointer-events-none" style={{
        background: opponent.isBot
          ? "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(34,211,238,0.12), transparent 60%)"
          : "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(52,211,153,0.16), transparent 60%)",
      }} />

      <div className="relative px-3 pt-3 pb-2 flex flex-col items-center flex-1 min-h-0">
        <div className="relative shrink-0">
          <div
            className="rounded-xl overflow-hidden border-2"
            style={{
              borderColor: opponent.isBot ? "rgba(34,211,238,0.45)" : "rgba(52,211,153,0.55)",
              boxShadow: opponent.isBot
                ? "0 0 16px rgba(34,211,238,0.22)"
                : "0 0 16px rgba(52,211,153,0.26)",
            }}
          >
            <CharacterAvatar {...ap} size={88} />
          </div>
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 min-w-[1.75rem] px-1.5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-display font-black flex items-center justify-center border-2 border-background shadow">
            {opponent.level}
          </span>
        </div>

        {!opponent.isBot ? (
          <span className="mt-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[8px] font-display font-bold tracking-wide border border-emerald-500/35">
            <User className="w-2.5 h-2.5" /> REAL
          </span>
        ) : (
          <span className="mt-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300/80 text-[8px] font-display font-bold tracking-wide border border-cyan-500/25">
            SIMULANT
          </span>
        )}

        <h4 className="font-display font-bold text-sm mt-1 truncate max-w-full tracking-wide">{opponent.name}</h4>
        <p className="text-[10px] text-muted-foreground truncate max-w-full">{opponent.race} · {opponent.class}</p>
        {opponent.guild && (
          <p className="text-[9px] text-accent font-display font-semibold truncate max-w-full">{opponent.guild}</p>
        )}

        <div className="mt-2 w-full grid grid-cols-3 gap-1 text-center">
          <div className="rounded-md bg-background/40 border border-border/40 px-1 py-1">
            <Trophy className="w-3 h-3 mx-auto text-amber-300" />
            <p className="font-display font-bold text-xs text-amber-300 leading-tight">{opponent.arena_rating}</p>
            <p className="text-[7px] text-muted-foreground uppercase tracking-wide">Rating</p>
          </div>
          <div className="rounded-md bg-background/40 border border-border/40 px-1 py-1">
            <Zap className="w-3 h-3 mx-auto text-cyan-300" />
            <p className="font-display font-bold text-xs text-cyan-300 leading-tight">{opponent.power}</p>
            <p className="text-[7px] text-muted-foreground uppercase tracking-wide">Power</p>
          </div>
          <div className="rounded-md bg-background/40 border border-border/40 px-1 py-1">
            <Flame className="w-3 h-3 mx-auto text-rose-300" />
            <p className="font-display font-bold text-xs leading-tight">
              <span className="text-green-400">{opponent.arena_wins || 0}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="text-red-400">{opponent.arena_losses || 0}</span>
            </p>
            <p className="text-[7px] text-muted-foreground uppercase tracking-wide">
              {winRate != null ? `${winRate}%` : "W/L"}
            </p>
          </div>
        </div>

        <div className="mt-2 w-full rounded-lg border border-border/50 bg-background/35 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border/40">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-display font-black tracking-wider border ${RISK_STYLES[risk.tone]}`}>
              {risk.label}
            </span>
            <span className="text-[8px] text-muted-foreground font-display tracking-wide">
              {freeBattle ? "FREE" : "RATING"}
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border/40">
            <div className="px-2 py-1.5 text-center">
              <p className="text-[7px] uppercase tracking-wide text-emerald-400/80 font-display">Win</p>
              <p className="font-display font-black text-xs text-emerald-300">{fmtDelta(onWin.arena_rating_delta)}</p>
              {freeBattle ? (
                <p className="text-[8px] text-muted-foreground leading-tight inline-flex items-center gap-0.5">
                  {onWin.experience} XP · {onWin.stardust} <StardustIcon className="w-2 h-2" glow={false} />
                </p>
              ) : (
                <p className="text-[8px] text-muted-foreground">rating</p>
              )}
            </div>
            <div className="px-2 py-1.5 text-center">
              <p className="text-[7px] uppercase tracking-wide text-rose-400/80 font-display">Lose</p>
              <p className="font-display font-black text-xs text-rose-300">{fmtDelta(onLoss.arena_rating_delta)}</p>
              <p className="text-[8px] text-muted-foreground">{freeBattle ? "no loot" : "rating"}</p>
            </div>
          </div>
        </div>

        <p className="mt-1.5 text-[9px] text-muted-foreground/80 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" /> {lastOnline(opponent.lastOnlineMins)}
        </p>
      </div>

      <div className="relative px-3 pb-3 pt-0 mt-auto shrink-0">
        <button
          onClick={() => onChallenge(opponent, { skip: cooldownActive })}
          disabled={disabled}
          className={`w-full py-2 rounded-lg text-xs font-display font-black tracking-wider disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-shadow ${
            cooldownActive
              ? "bg-gradient-to-r from-amber-500 to-orange-500 text-black border border-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)]"
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
