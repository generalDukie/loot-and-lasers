import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, Flag, Clock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  GUILD_WAR_DECLARE_COST,
  listGuildWars,
  getWarReadies,
  toggleReady,
  isWarReadyExpired,
  resolveGuildWar,
} from "@/lib/guildEngine";
import { api } from "@/api/gameClient";
import GuildWarCard from "@/components/game/GuildWarCard";
import GuildWarPicker from "@/components/game/GuildWarPicker";
import GuildWarReplay from "@/components/game/GuildWarReplay";

export default function GuildWars({ guild, character, membership, onResult }) {
  const [wars, setWars] = useState([]);
  const [readies, setReadies] = useState({});
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [replay, setReplay] = useState(null);
  const { toast } = useToast();

  async function loadWars() {
    const list = await listGuildWars(guild.id);
    setWars(list);
    const readyMap = {};
    await Promise.all(
      list
        .filter((w) => w.status === "readying")
        .map(async (w) => {
          readyMap[w.id] = await getWarReadies(w.id);
        })
    );
    setReadies(readyMap);

    // Lazy auto-resolve: any readying war past its 24h deadline resolves now.
    const expired = list.filter((w) => w.status === "readying" && isWarReadyExpired(w));
    if (expired.length) {
      for (const w of expired) {
        try {
          await resolveGuildWar(w);
        } catch (e) {
          /* already resolved by another player — ignore */
        }
      }
      const refreshed = await listGuildWars(guild.id);
      setWars(refreshed);
      if (onResult) onResult();
    }
  }

  useEffect(() => {
    if (guild) loadWars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guild?.id]);

  // Refresh countdown display every minute.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  async function handleToggleReady(war) {
    setBusy(true);
    try {
      await toggleReady(war, character, membership);
      const r = await getWarReadies(war.id);
      setReadies((prev) => ({ ...prev, [war.id]: r }));
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  }

  async function handleResolve(war) {
    setBusy(true);
    try {
      const resolved = await resolveGuildWar(war);
      setReplay(resolved);
      await loadWars();
      if (onResult) onResult();
    } catch (e) {
      toast({ title: "Battle failed", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  }

  async function handleDeclare(defenderGuild) {
    if ((character.stardust || 0) < GUILD_WAR_DECLARE_COST) {
      toast({
        title: "Not enough stardust",
        description: `Requires ${GUILD_WAR_DECLARE_COST} ✨.`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await api.functions.invoke("DeclareGuildWar", { defender_guild_id: defenderGuild.id });
      setShowPicker(false);
      await loadWars();
      if (onResult) onResult();
      toast({ title: "War declared!", description: `${defenderGuild.name} has 24h to ready up.` });
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setBusy(false);
  }

  const canDeclare = membership && (membership.role === "leader" || membership.role === "officer");
  const warWins = guild.war_wins || 0;
  const warLosses = guild.war_losses || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="painted-panel canvas-grain p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Swords className="w-5 h-5 text-destructive" />
          <div>
            <p className="text-[10px] font-display tracking-widest uppercase text-muted-foreground">Guild Wars</p>
            <h3 className="font-display font-bold text-base">War Council</h3>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-green-400 font-display font-bold">{warWins}W</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-destructive font-display font-bold">{warLosses}L</span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mb-3 flex items-start gap-1.5">
        <Clock className="w-3 h-3 mt-0.5 shrink-0" />
        Declare war on any guild. Both sides have 24h to ready up — only readied members fight in the gauntlet, ranked by level.
      </p>

      {wars.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-6">
          No active wars. {canDeclare ? "Declare one below." : "Ask your leader to declare war."}
        </p>
      ) : (
        <div className="space-y-2.5">
          {wars.map((war) => (
            <GuildWarCard
              key={war.id}
              war={war}
              readies={readies[war.id] || []}
              character={character}
              membership={membership}
              busy={busy}
              onToggleReady={() => handleToggleReady(war)}
              onResolve={() => handleResolve(war)}
              onReplay={() => setReplay(war)}
            />
          ))}
        </div>
      )}

      {canDeclare && (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full mt-4 text-xs px-4 py-2 rounded-lg font-display font-bold painted-btn flex items-center justify-center gap-1.5"
        >
          <Flag className="w-3.5 h-3.5" /> Declare War · {GUILD_WAR_DECLARE_COST} ✨
        </button>
      )}

      <AnimatePresence>
        {showPicker && (
          <GuildWarPicker
            key="picker"
            ownGuildId={guild.id}
            onPick={handleDeclare}
            onClose={() => setShowPicker(false)}
            busy={busy}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {replay && <GuildWarReplay key="replay" war={replay} onClose={() => setReplay(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}