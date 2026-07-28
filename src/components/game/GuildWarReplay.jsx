import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Swords, ChevronRight } from "lucide-react";

export default function GuildWarReplay({ war, onClose }) {
  const duels = war.battle_log || [];
  const [openDuel, setOpenDuel] = useState(null);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-border/60 shadow-2xl painted-panel canvas-grain p-5 max-h-[85%] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground z-10">
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
            className="w-14 h-14 mx-auto rounded-full flex items-center justify-center text-2xl mb-2"
            style={{
              background: war.winner_side === "attacker" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              border: `2px solid ${war.winner_side === "attacker" ? "#22c55e" : "#ef4444"}`,
            }}
          >
            {war.winner_side === "attacker" ? "🏆" : "🛡️"}
          </motion.div>
          <h3 className="font-display font-bold text-base">
            {war.winner_side === "attacker" ? war.attacker_guild_name : war.defender_guild_name} WINS
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {war.attacker_guild_name} vs {war.defender_guild_name}
          </p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-[10px] bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-full">+{war.reward_stardust} ✨</span>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">+{war.reward_guild_xp} Guild XP</span>
          </div>
        </div>

        {duels.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">
            No battles were fought (one side had no ready members).
          </p>
        ) : (
          <div className="space-y-1.5">
            {duels.map((d, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenDuel(openDuel === i ? null : i)}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border transition-colors ${
                    d.winner === "attacker" ? "bg-primary/5 border-primary/20" : "bg-destructive/5 border-destructive/20"
                  }`}
                >
                  <span className="font-display font-bold text-[10px] text-muted-foreground w-5">#{i + 1}</span>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[11px]">
                    <span className={`font-display font-bold truncate ${d.winner === "attacker" ? "text-primary" : ""}`}>
                      {d.attacker_name}
                    </span>
                    <span className="text-muted-foreground text-[9px]">Lv{d.attacker_level}</span>
                    <Swords className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className={`font-display font-bold truncate ${d.winner === "defender" ? "text-destructive" : ""}`}>
                      {d.defender_name}
                    </span>
                    <span className="text-muted-foreground text-[9px]">Lv{d.defender_level}</span>
                  </div>
                  <span
                    className={`text-[10px] font-display font-bold shrink-0 ${
                      d.winner === "attacker" ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {d.winner === "attacker" ? "WIN" : "LOSS"}
                  </span>
                  <ChevronRight
                    className={`w-3 h-3 text-muted-foreground transition-transform ${openDuel === i ? "rotate-90" : ""}`}
                  />
                </button>
                <AnimatePresence>
                  {openDuel === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pl-8 pr-2 py-1.5 space-y-1 max-h-40 overflow-y-auto">
                        {d.events.slice(0, 15).map((ev, ei) => {
                          const atkName = ev.attacker === "player" ? d.attacker_name : d.defender_name;
                          const defName = ev.defender === "player" ? d.attacker_name : d.defender_name;
                          let text;
                          if (ev.type === "dodge") text = `💨 ${defName} dodges ${atkName}'s attack`;
                          else if (ev.type === "regen") text = `💚 ${defName} regenerates ${ev.heal} HP`;
                          else if (ev.type === "drone") text = `🛩️ Combat Drone hits ${defName} for ${ev.damage}`;
                          else
                            text = `${ev.crit ? "💥 " : "⚔️ "}${atkName} hits ${defName} for ${ev.damage}${
                              ev.ability ? ` (${ev.ability})` : ""
                            }`;
                          return (
                            <div key={ei} className="text-[10px] text-muted-foreground leading-tight">
                              {text}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full text-sm px-4 py-2.5 rounded-lg font-display font-bold painted-btn mt-4">
          Continue
        </button>
      </motion.div>
    </motion.div>
  );
}