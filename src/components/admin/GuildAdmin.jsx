import React, { useState, useEffect } from "react";
import { api } from "@/api/gameClient";
import { Crown, Users, ArrowRightLeft } from "lucide-react";

export default function GuildAdmin({ onAction }) {
  const [guilds, setGuilds] = useState([]);
  const [guild, setGuild] = useState(null);
  const [members, setMembers] = useState([]);
  const [newLeader, setNewLeader] = useState("");

  async function loadGuilds() {
    setGuilds(await api.entities.Guild.list("-created_date", 100));
  }
  useEffect(() => { loadGuilds(); }, []);

  async function selectGuild(g) {
    setGuild(g);
    setNewLeader("");
    setMembers(await api.entities.GuildMember.filter({ guild_id: g.id }));
  }

  async function transfer() {
    if (!guild || !newLeader) return;
    if (!confirm(`Transfer leadership of ${guild.name} to the selected member?`)) return;
    await onAction({ action: "transfer_guild", guild_id: guild.id, new_leader_id: newLeader });
    await selectGuild(guild);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {guilds.map((g) => (
          <button key={g.id} onClick={() => selectGuild(g)} className={`w-full flex items-center gap-2 p-2 rounded-xl border text-left ${guild?.id === g.id ? "bg-primary/15 border-primary/40" : "bg-muted/15 border-border/20"}`}>
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            <span className="flex-1 text-sm font-display font-semibold">{g.name}</span>
            <span className="text-[10px] text-muted-foreground">[{g.tag}] · {g.member_count}m</span>
          </button>
        ))}
        {guilds.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">No guilds.</p>}
      </div>
      {guild && (
        <div className="space-y-2 p-3 rounded-xl bg-muted/10 border border-border/30">
          <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" />{guild.name}</h3>
          <p className="text-[11px] text-muted-foreground">Current leader: {guild.leader_name}</p>
          <select value={newLeader} onChange={(e) => setNewLeader(e.target.value)} className="w-full bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-xs">
            <option value="">Select new leader...</option>
            {members.map((m) => <option key={m.id} value={m.character_id}>{m.character_name} ({m.role})</option>)}
          </select>
          <button onClick={transfer} disabled={!newLeader} className="w-full painted-btn text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"><ArrowRightLeft className="w-3.5 h-3.5" />Force Transfer</button>
        </div>
      )}
    </div>
  );
}