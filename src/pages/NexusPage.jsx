import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/api/gameClient";
import { useNavigate } from "react-router-dom";
import { getGuildMembership } from "@/lib/guildUtils";
import { getNexusState, isNexusVulnerable, ownsNexus } from "@/lib/nexusEngine";
import { getMyCharacter } from "@/lib/socialEngine";
import NexusOwnerPanel from "@/components/game/NexusOwnerPanel";
import NexusDeclarePanel from "@/components/game/NexusDeclarePanel";
import NexusBattleOverlay from "@/components/game/NexusBattleOverlay";
import NexusHallOfFame from "@/components/game/NexusHallOfFame";
import NexusChatter from "@/components/game/NexusChatter";
import { Orbit } from "lucide-react";

export default function NexusPage() {
  const [character, setCharacter] = useState(null);
  const [guild, setGuild] = useState(null);
  const [members, setMembers] = useState([]);
  const [nexus, setNexus] = useState(null);
  const [battle, setBattle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const char = await getMyCharacter();
    if (!char) { navigate("/create-character"); return; }
    setCharacter(char);
    setLoading(false);
    // Guild + Nexus state load best-effort so a single failed fetch never
    // blocks the page from rendering.
    try {
      const membership = await getGuildMembership(char.id);
      if (membership) {
        const g = await api.entities.Guild.get(membership.guild_id);
        const ms = await api.entities.GuildMember.filter({ guild_id: g.id });
        setGuild(g);
        setMembers(ms || []);
      }
    } catch (e) {}
    try { setNexus(await getNexusState()); } catch (e) {}
  }, [navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function onResolved(result) {
    setBattle(result);
    setNexus(await getNexusState());
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const vuln = isNexusVulnerable(nexus, now);
  const isOwner = ownsNexus(nexus, guild?.id);

  return (
    <div className="space-y-6">
      {battle && (
        <NexusBattleOverlay
          result={battle}
          attackerGuild={guild}
          onDone={() => { setBattle(null); load(); }}
        />
      )}

      <div className="flex items-center gap-2">
        <Orbit className="w-5 h-5 text-amber-300" />
        <h1 className="font-display font-bold text-xl tracking-wider">Galactic Command Nexus</h1>
      </div>

      <NexusChatter />

      <NexusOwnerPanel nexus={nexus} now={now} />

      {guild ? (
        <NexusDeclarePanel
          character={character}
          guild={guild}
          members={members}
          nexus={nexus}
          now={now}
          onResolved={onResolved}
        />
      ) : (
        <div className="rounded-2xl border border-border/60 painted-panel p-6 text-center text-xs text-muted-foreground">
          Join or create a guild to contest the Nexus.
        </div>
      )}

      {isOwner && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-center">
          <p className="text-xs text-amber-200">
            👑 Your guild holds the Nexus — members enjoy <span className="font-bold">+5% mission rewards</span> and <span className="font-bold">+5% guild experience</span>.
          </p>
        </div>
      )}

      <NexusHallOfFame />
    </div>
  );
}