import React from "react";
import { motion } from "framer-motion";
import { Crown, Star, Coins, Target } from "lucide-react";

const ROLE_STYLE = {
  leader: { icon: Crown, color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30", label: "Leader" },
  officer: { icon: Star, color: "text-primary", bg: "bg-primary/10", border: "border-primary/30", label: "Officer" },
  member: { icon: Star, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border/40", label: "Member" },
};

export default function GuildMembers({ members, currentCharacterId }) {
  const sorted = [...members].sort((a, b) => {
    const order = { leader: 0, officer: 1, member: 2 };
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    return (b.contributed_missions || 0) - (a.contributed_missions || 0);
  });

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5">
      <h2 className="font-display font-semibold text-sm tracking-wide text-muted-foreground mb-4">MEMBER ROSTER</h2>
      <div className="space-y-2">
        {sorted.map((m, i) => {
          const role = ROLE_STYLE[m.role] || ROLE_STYLE.member;
          const RoleIcon = role.icon;
          const isYou = m.character_id === currentCharacterId;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`flex items-center gap-3 p-2.5 rounded-xl border ${isYou ? "bg-primary/5 border-primary/30" : "bg-muted/20 border-border/30"}`}
            >
              <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${role.bg} ${role.border} border`}>
                <RoleIcon className={`w-4 h-4 ${role.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{m.character_name}</span>
                  {isYou && <span className="text-[9px] font-display text-primary">YOU</span>}
                  <span className="text-[10px] text-muted-foreground capitalize">{role.label}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1"><Star className="w-3 h-3" /> Lvl {m.character_level || 1}</span>
                  <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {m.contributed_missions || 0}</span>
                  <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> {(m.contributed_stardust || 0).toLocaleString()}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}