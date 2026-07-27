import React from "react";
import { motion } from "framer-motion";
import CharacterAvatar from "@/components/game/CharacterAvatar";
import { Swords, Zap, Trophy, Clock, User } from "lucide-react";
import { avatarPropsFor, getDivision } from "@/lib/arenaEngine";

function lastOnline(mins) {
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ArenaOpponentCard({ opponent, onChallenge, cooldownActive, skipCost, disabled }) {
  const div = getDivision(opponent.arena_rating);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="p-3 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm flex flex-col items-center"
    >
      <CharacterAvatar {...avatarPropsFor(opponent)} size={84} />
      {!opponent.isBot && (
        <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[9px] font-display font-bold tracking-wide border border-emerald-500/30">
          <User className="w-2.5 h-2.5" /> REAL PLAYER
        </span>
      )}
      <h4 className="font-display font-bold text-sm mt-2 truncate max-w-full">{opponent.name}</h4>
      <p className="text-[10px] text-muted-foreground">{opponent.race} · {opponent.class}</p>

      <div className="flex items-center gap-2 text-[11px] mt-1">
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-display font-bold">Lv {opponent.level}</span>
        <span className="text-amber-300 font-display font-bold">{div.label}</span>
      </div>
      {opponent.guild && <p className="text-[10px] text-accent mt-0.5">{opponent.guild}</p>}

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground mt-2 w-full">
        <span className="flex items-center gap-1"><Trophy className="w-2.5 h-2.5" /> {opponent.arena_rating}</span>
        <span className="flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> {opponent.power} PWR</span>
        <span className="text-green-400">{opponent.arena_wins}W</span>
        <span className="text-red-400">{opponent.arena_losses}L</span>
        <span className="flex items-center gap-1 col-span-2"><Clock className="w-2.5 h-2.5" /> {lastOnline(opponent.lastOnlineMins)}</span>
      </div>

      <button
        onClick={() => onChallenge(opponent, { skip: cooldownActive })}
        disabled={disabled}
        className="mt-2 w-full py-2 rounded-lg painted-btn text-xs font-display font-bold tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {cooldownActive ? (
          <><Zap className="w-3.5 h-3.5 inline mr-1" /> Skip & Challenge · {skipCost} 💎</>
        ) : (
          <><Swords className="w-3.5 h-3.5 inline mr-1" /> Challenge</>
        )}
      </button>
    </motion.div>
  );
}