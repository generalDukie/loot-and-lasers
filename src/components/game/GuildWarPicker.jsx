import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Search, Flag } from "lucide-react";
import { api } from "@/api/gameClient";
import { GUILD_WAR_DECLARE_COST } from "@/lib/guildEngine";
import GameplayOverlayPortal from "@/components/game/GameplayOverlayPortal";

export default function GuildWarPicker({ ownGuildId, onPick, onClose, busy }) {
  const [guilds, setGuilds] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.entities.Guild.list("-created_date", 100).then((list) => {
      setGuilds((list || []).filter((g) => g.id !== ownGuildId));
      setLoading(false);
    });
  }, [ownGuildId]);

  const filtered = guilds.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <GameplayOverlayPortal
      as={motion.div}
      className="z-50 flex items-center justify-center p-3"
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
        className="relative w-full max-w-md rounded-2xl border border-border/60 shadow-2xl painted-panel canvas-grain p-5 max-h-[80%] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 mb-3">
          <Flag className="w-5 h-5 text-destructive" />
          <h3 className="font-display font-bold text-base">Declare War</h3>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Choose a rival guild. Both sides have 24h to ready up before battle begins. Costs {GUILD_WAR_DECLARE_COST} ✨.
        </p>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search guilds..."
            className="w-full text-xs pl-8 pr-3 py-2 rounded-lg bg-muted/30 border border-border/50 focus:border-primary/50 outline-none"
          />
        </div>
        {loading ? (
          <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mx-auto" />
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">No guilds found.</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((g) => (
              <button
                key={g.id}
                onClick={() => onPick(g)}
                disabled={busy}
                className="w-full flex items-center justify-between text-left px-3 py-2 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border/30 transition-colors disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="font-display font-bold text-sm truncate">{g.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Lv. {g.level || 1} · {g.member_count || 0} members
                  </p>
                </div>
                <Flag className="w-3.5 h-3.5 text-destructive shrink-0" />
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </GameplayOverlayPortal>
  );
}