import React from "react";
import { motion } from "framer-motion";
import { Target, Clock, CheckCircle2 } from "lucide-react";

export default function GuildWeeklyChallenge({ challenge, guild }) {
  if (!challenge) return null;
  const progress = challenge.progress || 0;
  const goal = challenge.goal || 1;
  const pct = Math.min(100, Math.round((progress / goal) * 100));
  const completed = challenge.status === "completed";
  const endsAt = challenge.ends_at ? new Date(challenge.ends_at) : null;
  const timeLeft = endsAt ? Math.max(0, endsAt - Date.now()) : 0;
  const daysLeft = Math.floor(timeLeft / 86400000);
  const hoursLeft = Math.floor((timeLeft % 86400000) / 3600000);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="painted-panel canvas-grain p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <div>
            <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Weekly Challenge</p>
            <h3 className="font-display font-bold text-base">{challenge.title}</h3>
          </div>
        </div>
        {completed ? (
          <span className="text-[10px] font-display font-bold uppercase px-2 py-1 rounded-full bg-green-500/15 text-green-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Done
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" /> {daysLeft}d {hoursLeft}h left
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="relative h-6 bg-muted/50 rounded-full overflow-hidden border border-border/40">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/80 to-accent/80"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-display font-bold">
          {progress} / {goal} <span className="text-muted-foreground ml-1">({pct}%)</span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mt-2">
        Complete missions and win Arena duels to fill the bar.
      </p>

      {/* Rewards */}
      <div className="flex items-center gap-2 mt-3">
        <div className="flex items-center gap-1 text-xs bg-accent/10 text-accent px-2.5 py-1 rounded-full font-medium">
          ✨ {challenge.reward_stardust}
        </div>
        <div className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
          <Target className="w-3 h-3" /> {challenge.reward_guild_xp} Guild XP
        </div>
        <div className="ml-auto text-[11px] text-muted-foreground">
          Guild Lv. <span className="text-foreground font-display font-bold">{guild?.level || 1}</span>
        </div>
      </div>
    </motion.div>
  );
}