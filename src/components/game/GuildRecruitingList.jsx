import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { Users, Crown, RefreshCw, Lock, DoorOpen } from "lucide-react";
import { GUILD_MAX_MEMBERS } from "@/lib/gameData";

// Random subset of guilds with capacity, both recruiting and invite-only.
function pickRandom(guilds, n) {
  const eligible = guilds.filter((g) => (g.member_count || 0) < GUILD_MAX_MEMBERS);
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export default function GuildRecruitingList({ character, onPick, onRequest }) {
  const [guilds, setGuilds] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const all = await api.entities.Guild.list("-created_date", 100);
      const visible = all.filter((g) => g.public_listing !== false);
      setGuilds(pickRandom(visible, 5));
    } catch (e) {
      setGuilds([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!guilds || guilds.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground italic mb-3">No guilds available right now.</p>
        <button onClick={load} className="text-xs text-primary flex items-center gap-1 mx-auto hover:underline">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          <Users className="w-3 h-3" /> Available Guilds
        </p>
        <button onClick={load} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Shuffle
        </button>
      </div>

      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {guilds.map((g, i) => {
          const count = g.member_count || 0;
          const full = count >= GUILD_MAX_MEMBERS;
          const pct = Math.min(100, (count / GUILD_MAX_MEMBERS) * 100);
          const inviteOnly = g.recruiting === false;
          return (
            <motion.button
              key={g.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => full ? null : (inviteOnly ? onRequest(g) : onPick(g))}
              disabled={full}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                full
                  ? "bg-muted/10 border-border/20 opacity-50 cursor-not-allowed"
                  : "bg-muted/15 border-border/30 hover:bg-primary/10 hover:border-primary/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-sm truncate flex items-center gap-1.5">
                    {g.tag && <span className="text-[10px] text-accent border border-accent/30 rounded px-1 py-px">[{g.tag}]</span>}
                    {g.name}
                  </p>
                  {g.description ? (
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{g.description}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic mt-0.5">No description</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-display font-bold text-muted-foreground flex items-center gap-1 justify-end">
                    <Crown className="w-2.5 h-2.5 text-yellow-400" /> Lv{g.level || 1}
                  </span>
                  <span className={`text-[8px] font-display font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-0.5 ${
                    inviteOnly
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-green-500/10 border-green-500/30 text-green-400"
                  }`}>
                    {inviteOnly ? <Lock className="w-2.5 h-2.5" /> : <DoorOpen className="w-2.5 h-2.5" />}
                    {inviteOnly ? "INVITE ONLY" : "RECRUITING"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: full ? "hsl(0 70% 55%)" : "linear-gradient(90deg, hsl(190 90% 50%), hsl(150 60% 50%))",
                    }}
                  />
                </div>
                <span className={`text-[10px] font-display font-bold ${full ? "text-destructive" : "text-primary"}`}>
                  {count}/{GUILD_MAX_MEMBERS}
                </span>
              </div>
              {full ? (
                <p className="text-[9px] text-destructive mt-1">Guild full</p>
              ) : (
                <p className={`text-[9px] mt-1 ${inviteOnly ? "text-amber-300" : "text-primary"}`}>
                  {inviteOnly ? "Request to Join →" : "Join Guild →"}
                </p>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}