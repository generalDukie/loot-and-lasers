import React from "react";
import { motion } from "framer-motion";
import { Rocket, TrendingUp, UserPlus, UserMinus, Flag, Scroll, Swords, Trophy } from "lucide-react";

const TYPE_STYLE = {
  mission: { icon: Rocket, color: "text-primary" },
  levelup: { icon: TrendingUp, color: "text-yellow-400" },
  join: { icon: UserPlus, color: "text-green-400" },
  leave: { icon: UserMinus, color: "text-red-400" },
  create: { icon: Flag, color: "text-accent" },
  recruit: { icon: UserPlus, color: "text-green-400" },
  arena: { icon: Trophy, color: "text-amber-400" },
  war: { icon: Swords, color: "text-destructive" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function GuildLog({ entries }) {
  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5">
      <h2 className="font-display font-semibold text-sm tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
        <Scroll className="w-4 h-4 text-accent" /> SHARED MISSION LOG
      </h2>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-6">No activity yet. Complete missions to populate the log.</p>
      ) : (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {entries.map((e, i) => {
            const style = TYPE_STYLE[e.entry_type] || TYPE_STYLE.mission;
            const Icon = style.icon;
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug">
                    <span className="font-semibold text-foreground">{e.character_name}</span>{" "}
                    <span className="text-muted-foreground">{e.message}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(e.created_date)}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}