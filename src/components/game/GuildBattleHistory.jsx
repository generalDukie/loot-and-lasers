import React from "react";
import { motion } from "framer-motion";
import { Swords, Trophy, Skull } from "lucide-react";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function GuildBattleHistory({ battles, guildId }) {
  const rows = battles.map((b) => {
    const weAttacked = b.attacker_guild_id === guildId;
    const opponent = weAttacked ? b.defender_guild_name : b.attacker_guild_name;
    const won = b.winner_side === (weAttacked ? "attacker" : "defender");
    return { ...b, opponent, won };
  });

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5">
      <h2 className="font-display font-semibold text-sm tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
        <Swords className="w-4 h-4 text-destructive" /> BATTLE HISTORY
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-6">
          No battles recorded yet. Declare war to start building your legacy.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {rows.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${b.won ? "bg-green-500/15" : "bg-red-500/15"}`}>
                {b.won ? <Trophy className="w-3.5 h-3.5 text-green-400" /> : <Skull className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-snug">
                  <span className="text-muted-foreground">vs </span>
                  <span className="font-semibold text-foreground">{b.opponent || "Unknown"}</span>
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{formatDate(b.created_date)}</p>
              </div>
              <span className={`text-[10px] font-display font-bold px-2 py-0.5 rounded-full shrink-0 ${b.won ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                {b.won ? "WIN" : "LOSS"}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}