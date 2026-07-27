import React from "react";
import { motion } from "framer-motion";
import { Shield, Users, LogOut, DoorOpen, Lock, Eye, EyeOff } from "lucide-react";

export default function GuildHeader({ guild, memberCount, onLeave, isLeader, onToggleRecruiting, onTogglePublicListing }) {
  const expPct = Math.min(100, ((guild.experience || 0) / (guild.experience_to_next || 1000)) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 relative overflow-hidden border-glow-cyan"
    >
      <div className="absolute -top-20 -left-10 w-64 h-64 rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(190 90% 50% / 0.18), transparent 70%)" }} />

      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 relative">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-bold text-2xl glow-cyan tracking-wider">{guild.name}</h1>
            {guild.tag && <span className="text-xs font-display text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/30">[{guild.tag}]</span>}
          </div>
          {guild.description && <p className="text-sm text-muted-foreground mt-1.5 max-w-md">{guild.description}</p>}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span className="font-display font-bold text-sm text-primary">LVL {guild.level || 1}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/40 border border-border/40">
              <Users className="w-3.5 h-3.5 text-accent" />
              <span className="font-display font-bold text-sm">{memberCount}</span>
              <span className="text-[10px] text-muted-foreground">MEMBERS</span>
            </span>
            <span className="text-[11px] text-muted-foreground">Led by <span className="text-foreground font-medium">{guild.leader_name}</span></span>
            {isLeader && (
              <button
                onClick={onToggleRecruiting}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border transition-colors ${
                  guild.recruiting !== false
                    ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                    : "bg-muted/40 border-border/40 text-muted-foreground hover:bg-muted/60"
                }`}
                title={guild.recruiting !== false ? "Open Recruitment — click to make Invite Only" : "Invite Only — click to open recruitment"}
              >
                {guild.recruiting !== false ? <DoorOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span className="font-display font-bold text-xs">{guild.recruiting !== false ? "RECRUITING" : "INVITE ONLY"}</span>
              </button>
            )}
            {isLeader && (
              <button
                onClick={onTogglePublicListing}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border transition-colors ${
                  guild.public_listing !== false
                    ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
                    : "bg-muted/40 border-border/40 text-muted-foreground hover:bg-muted/60"
                }`}
                title={guild.public_listing !== false ? "Visible in public listing — click to hide" : "Hidden from public listing — click to show"}
              >
                {guild.public_listing !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="font-display font-bold text-xs">{guild.public_listing !== false ? "PUBLIC" : "HIDDEN"}</span>
              </button>
            )}
          </div>

          <div className="mt-3 max-w-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Guild XP</span>
              <span>{guild.experience || 0} / {guild.experience_to_next || 1000}</span>
            </div>
            <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${expPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-500"
              />
            </div>
          </div>
        </div>

        <button
          onClick={onLeave}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive px-3 py-1.5 rounded-lg border border-border/40 hover:border-destructive/40 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Leave Guild
        </button>
      </div>
    </motion.div>
  );
}