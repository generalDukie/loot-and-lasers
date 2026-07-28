import React from "react";
import { motion } from "framer-motion";
import { Crown, Users, Clock, Shield, Trophy, Flag } from "lucide-react";
import { formatReign } from "@/lib/nexusEngine";

export default function NexusOwnerPanel({ nexus, now }) {
  const unclaimed = !nexus || !nexus.owner_guild_id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
      className="relative overflow-hidden rounded-2xl border border-border/60 painted-panel canvas-grain p-6"
    >
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 rounded-full blur-3xl pointer-events-none"
        style={{ background: unclaimed ? "radial-gradient(circle, hsl(0 70% 50% / 0.25), transparent 70%)" : "radial-gradient(circle, hsl(45 90% 55% / 0.3), transparent 70%)" }} />

      <div className="relative flex items-center gap-2 mb-4">
        <Crown className="w-5 h-5 text-amber-300" />
        <h2 className="font-display font-bold text-sm tracking-widest text-amber-300">GALACTIC COMMAND NEXUS</h2>
      </div>

      {unclaimed ? (
        <div className="relative text-center py-6">
          <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }} className="text-5xl mb-3">⛩️</motion.div>
          <h3 className="font-display font-bold text-lg text-destructive glow-cyan">UNCLAIMED — VULNERABLE</h3>
          <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
            No guild holds the Nexus. The automated garrison stands ready. Any eligible guild may strike to claim dominion over the galaxy.
          </p>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl border-2 shrink-0"
              style={{ borderColor: nexus.banner_color || "#FFD700", background: "rgba(10,12,20,0.6)", boxShadow: `0 0 16px ${nexus.banner_color || "#FFD700"}55` }}>
              <Flag className="w-6 h-6" style={{ color: nexus.banner_color || "#FFD700" }} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-xl tracking-wide" style={{ color: nexus.banner_color || "#FFD700", textShadow: `0 0 12px ${(nexus.banner_color || "#FFD700")}66` }}>
                [{nexus.owner_guild_tag}] {nexus.owner_guild_name}
              </h3>
              <p className="text-xs text-muted-foreground">Led by {nexus.owner_guild_leader || "—"}</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40">
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
              <span className="font-display font-bold text-xs text-amber-300">RANK #1</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <Stat icon={Users} label="Members" value={nexus.owner_member_count || 0} color="#22D3EE" />
            <Stat icon={Clock} label="Time Held" value={formatReign(nexus.captured_at, now)} color="#A855F7" />
            <Stat icon={Shield} label="Defenses" value={nexus.defense_streak || 0} color="#34D399" />
            <Stat icon={Trophy} label="Server Rank" value="#1" color="#FFD700" />
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-display font-semibold ${isVuln(nexus, now) ? "bg-destructive/15 text-destructive" : "bg-green-500/15 text-green-400"}`}>
              {isVuln(nexus, now) ? "⚠ VULNERABLE" : "🛡 FORTIFIED"}
            </span>
            <span className="text-muted-foreground">
              {isVuln(nexus, now) ? "Open to assault from eligible guilds." : "Defenses hold — becomes vulnerable after 24h."}
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function isVuln(nexus, now) {
  if (!nexus || !nexus.owner_guild_id) return true;
  const heldMs = now - new Date(nexus.captured_at).getTime();
  return heldMs >= 24 * 3600 * 1000;
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="p-3 rounded-xl bg-muted/20 border border-border/30 flex items-center gap-2">
      <Icon className="w-4 h-4 shrink-0" style={{ color }} />
      <div className="min-w-0">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="font-display font-bold text-sm truncate" style={{ color }}>{value}</p>
      </div>
    </div>
  );
}