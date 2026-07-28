import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { useNavigate } from "react-router-dom";
import { getGuildMembership } from "@/lib/guildUtils";
import { ensureWeeklyChallenge } from "@/lib/guildEngine";
import { getMyCharacter } from "@/lib/socialEngine";
import GuildHeader from "@/components/game/GuildHeader";
import GuildMembers from "@/components/game/GuildMembers";
import GuildLog from "@/components/game/GuildLog";
import GuildCreation from "@/components/game/GuildCreation";
import GuildInvitePanel from "@/components/game/GuildInvitePanel";
import GuildWeeklyChallenge from "@/components/game/GuildWeeklyChallenge";
import GuildWars from "@/components/game/GuildWars";
import GuildBattleHistory from "@/components/game/GuildBattleHistory";
import { Users, Target, TrendingUp } from "lucide-react";
import PageStage from "@/components/game/PageStage";
import StardustIcon from "@/components/game/StardustIcon";

export default function GuildPage() {
  const [character, setCharacter] = useState(null);
  const [membership, setMembership] = useState(null);
  const [guild, setGuild] = useState(null);
  const [members, setMembers] = useState([]);
  const [log, setLog] = useState([]);
  const [challenge, setChallenge] = useState(null);
  const [battles, setBattles] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function loadAll(char) {
    let m;
    try { m = await getGuildMembership(char.id); } catch (e) {}
    if (!m) {
      setMembership(null); setGuild(null); setMembers([]); setLog([]); setChallenge(null); setBattles([]);
      setLoading(false);
      return;
    }
    let g;
    try { g = await api.entities.Guild.get(m.guild_id); } catch (e) {}
    setMembership(m);
    setGuild(g);
    setLoading(false);
    // Members, log, challenge, and war history load best-effort so a single
    // failed fetch never blocks the page from rendering.
    try {
      const [mems, logs, ch, asAttacker, asDefender] = await Promise.all([
        api.entities.GuildMember.filter({ guild_id: g.id }),
        api.entities.GuildLog.filter({ guild_id: g.id }, "-created_date", 30),
        ensureWeeklyChallenge(g),
        api.entities.GuildBattle.filter({ attacker_guild_id: g.id }, "-created_date", 10),
        api.entities.GuildBattle.filter({ defender_guild_id: g.id }, "-created_date", 10),
      ]);
      const wars = [...(asAttacker || []), ...(asDefender || [])]
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
        .slice(0, 15);
      setMembers(mems || []);
      setLog(logs || []);
      setChallenge(ch || null);
      setBattles(wars);
    } catch (e) {}
  }

  useEffect(() => {
    async function init() {
      const char = await getMyCharacter();
      if (!char) { navigate("/create-character"); return; }
      setCharacter(char);
      await loadAll(char);
    }
    init();
  }, [navigate]);

  async function handleLeave() {
    if (!membership || !guild) return;
    await api.entities.GuildLog.create({
      guild_id: guild.id,
      entry_type: "leave",
      message: "left the guild",
      character_name: character.name,
    });
    await api.entities.GuildMember.delete(membership.id);
    const remaining = members.filter((m) => m.id !== membership.id);
    if (membership.role === "leader" && remaining.length) {
      const next = [...remaining].sort((a, b) => new Date(a.joined_date) - new Date(b.joined_date))[0];
      await api.entities.GuildMember.update(next.id, { role: "leader" });
      await api.entities.Guild.update(guild.id, {
        leader_id: next.character_id,
        leader_name: next.character_name,
        member_count: remaining.length,
      });
    } else {
      await api.entities.Guild.update(guild.id, { member_count: remaining.length });
    }
    setMembership(null);
    setGuild(null);
    setMembers([]);
    setLog([]);
    setChallenge(null);
    setBattles([]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!character) return null;

  if (!membership) {
    return (
      <PageStage className="items-center justify-center py-6 px-2">
        <GuildCreation character={character} onJoined={() => loadAll(character)} />
      </PageStage>
    );
  }

  const totalMissions = members.reduce((a, m) => a + (m.contributed_missions || 0), 0);
  const totalStardust = members.reduce((a, m) => a + (m.contributed_stardust || 0), 0);
  const avgLevel = members.length ? Math.round(members.reduce((a, m) => a + (m.character_level || 1), 0) / members.length) : 1;

  const stats = [
    { icon: Target, label: "Missions Run", value: totalMissions, color: "text-primary" },
    { icon: StardustIcon, label: "Stardust Earned", value: totalStardust.toLocaleString(), color: "text-purple-400" },
    { icon: TrendingUp, label: "Avg Level", value: avgLevel, color: "text-accent" },
    { icon: Users, label: "Members", value: members.length, color: "text-green-400" },
  ];

  const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay },
  });

  const refresh = () => loadAll(character);

  return (
    <PageStage className="space-y-6">
      <GuildHeader
        guild={guild}
        memberCount={members.length}
        onLeave={handleLeave}
        isLeader={membership?.role === "leader"}
        onToggleRecruiting={async () => {
          const next = guild.recruiting === false;
          await api.entities.Guild.update(guild.id, { recruiting: next });
          setGuild({ ...guild, recruiting: next });
        }}
        onTogglePublicListing={async () => {
          const next = guild.public_listing === false;
          await api.entities.Guild.update(guild.id, { public_listing: next });
          setGuild({ ...guild, public_listing: next });
        }}
      />

      {(membership?.role === "leader" || membership?.role === "officer") && (
        <GuildInvitePanel character={character} guild={guild} />
      )}

      {/* Weekly Challenge */}
      <GuildWeeklyChallenge challenge={challenge} guild={guild} />

      {/* Collective progression */}
      <motion.div {...fadeUp(0.1)} className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {stats.map((s) => {
          const isEmoji = typeof s.icon === 'string';
          const Icon = isEmoji ? null : s.icon;
          return (
            <div key={s.label} className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4 text-center">
              {isEmoji ? <span className={`text-lg block mx-auto mb-1.5 ${s.color}`}>{s.icon}</span> : <Icon className={`w-5 h-5 mx-auto mb-1.5 ${s.color}`} />}
              <p className="font-display font-bold text-xl glow-cyan">{s.value}</p>
              <p className="text-[10px] text-muted-foreground tracking-wide mt-0.5">{s.label.toUpperCase()}</p>
            </div>
          );
        })}
      </motion.div>

      {/* Guild Wars */}
      <GuildWars guild={guild} character={character} membership={membership} onResult={refresh} />

      {/* Battle History */}
      <motion.div {...fadeUp(0.2)}>
        <GuildBattleHistory battles={battles} guildId={guild.id} />
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div {...fadeUp(0.25)}>
          <GuildMembers members={members} currentCharacterId={character.id} />
        </motion.div>
        <motion.div {...fadeUp(0.3)}>
          <GuildLog entries={log} />
        </motion.div>
      </div>
    </PageStage>
  );
}