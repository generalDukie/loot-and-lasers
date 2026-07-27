import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/gameClient";
import { useToast } from "@/components/ui/use-toast";
import {
  getMyCharacter, searchCharacters, getFriends, getIncomingRequests, getOutgoingRequests,
  getBlocks, getCharactersByIds, getPresenceMap, sendFriendRequest, acceptRequest,
  declineRequest, removeFriend, blockPlayer, unblockPlayer, getCharacterById, reportPlayer,
} from "@/lib/socialEngine";
import FriendRow from "@/components/social/FriendRow";
import PublicProfileSheet from "@/components/social/PublicProfileSheet";
import { Users, UserPlus, Ban, Search, Check, X as XIcon, Send, UserCircle } from "lucide-react";

const TABS = [
  { key: "friends", label: "Friends", icon: Users },
  { key: "requests", label: "Requests", icon: UserPlus },
  { key: "blocked", label: "Blocked", icon: Ban },
];

export default function FriendsPage() {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("friends");
  const [friends, setFriends] = useState([]);
  const [friendChars, setFriendChars] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [presence, setPresence] = useState({});
  const [guildTags, setGuildTags] = useState({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [profile, setProfile] = useState(null);
  const [friendFilter, setFriendFilter] = useState("all");
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = useCallback(async () => {
    const me = await getMyCharacter();
    if (!me) return;
    setMe(me);
    const [fr, inc, outg, blk] = await Promise.all([
      getFriends(me.id), getIncomingRequests(me.id), getOutgoingRequests(me.id), getBlocks(me.id),
    ]);
    setFriends(fr); setIncoming(inc); setOutgoing(outg); setBlocked(blk);
    const otherIds = fr.flatMap((f) => f.participant_ids || []).filter((id) => id !== me.id);
    const chars = await getCharactersByIds(otherIds);
    setFriendChars(chars);
    const pmap = await getPresenceMap(otherIds);
    setPresence(pmap);
    // guild tags
    const members = await api.entities.GuildMember.list("-created_date", 200);
    const guildIds = [...new Set(members.map((m) => m.guild_id))];
    const guilds = await Promise.all(guildIds.map((gid) => api.entities.Guild.get(gid).catch(() => null)));
    const gMap = {}; guilds.filter(Boolean).forEach((g) => { gMap[g.id] = g.tag || ""; });
    const tagByChar = {}; members.forEach((m) => { tagByChar[m.character_id] = gMap[m.guild_id] || ""; });
    setGuildTags(tagByChar);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!me) return;
    const unsub = api.entities.FriendRequest.subscribe((event) => {
      const d = event.data;
      if (d?.from_character_id === me.id || d?.to_character_id === me.id) load();
    });
    return () => unsub?.();
  }, [me, load]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => { searchCharacters(query, me?.id).then(setResults); }, 350);
    return () => clearTimeout(t);
  }, [query, me]);

  async function message(friend) {
    navigate(`/messages?to=${friend.id}`);
  }

  async function handleSearchAction(result) {
    try {
      await sendFriendRequest(me, result);
      toast({ title: "Friend request sent", description: `To ${result.name}` });
      load();
    } catch (e) {
      toast({ title: "Could not send", description: e.message, variant: "destructive" });
    }
  }

  async function handleCancelRequest(result) {
    const req = outgoing.find((r) => r.to_character_id === result.id);
    if (!req) return;
    try {
      await api.entities.FriendRequest.delete(req.id);
      toast({ title: "Friend request canceled" });
      load();
    } catch (e) {
      toast({ title: "Could not cancel", description: e.message, variant: "destructive" });
    }
  }

  const outgoingIds = new Set(outgoing.map((r) => r.to_character_id));
  const friendIds = new Set(friendChars.map((c) => c.id));

  const friendsWithInfo = friendChars.map((c) => ({ ...c, guild_tag: guildTags[c.id] || "" }));

  const isFriendOnline = (id) => {
    const p = presence[id];
    return !!(p && (Date.now() - new Date(p.last_seen_at).getTime()) < 90000);
  };

  const onlineCount = friendsWithInfo.filter((f) => isFriendOnline(f.id)).length;

  const sortedFriends = [...friendsWithInfo].sort((a, b) => {
    const ao = isFriendOnline(a.id) ? 0 : 1;
    const bo = isFriendOnline(b.id) ? 0 : 1;
    return ao - bo;
  });
  const filteredFriends = friendFilter === "all"
    ? sortedFriends
    : friendFilter === "online"
      ? sortedFriends.filter((f) => isFriendOnline(f.id))
      : sortedFriends.filter((f) => !isFriendOnline(f.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        <h1 className="font-display font-bold text-xl tracking-wider">Friends</h1>
        <span className="ml-auto text-xs text-muted-foreground">{friendChars.length} friends · {onlineCount} online</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pilots by name..."
          className="w-full bg-muted/30 border border-border/40 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-primary/50" />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-border/40 bg-card/95 backdrop-blur-md shadow-xl overflow-hidden">
            {results.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/20 border-b border-border/10 last:border-0">
                <span className="w-7 h-7 rounded-full bg-muted/40 flex items-center justify-center text-xs font-bold" style={{ color: "#22D3EE" }}>{(r.name)[0]?.toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-semibold truncate">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground">Lv {r.level || 1} · {r.class}</p>
                </div>
                <button onClick={() => setProfile(r)} className="p-1.5 rounded-lg hover:bg-muted/30 text-muted-foreground" title="View profile">
                  <UserCircle className="w-4 h-4" />
                </button>
                {friendIds.has(r.id) ? (
                  <span className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400" title="Already friends"><Check className="w-4 h-4" /></span>
                ) : outgoingIds.has(r.id) ? (
                  <button onClick={() => handleCancelRequest(r)} className="p-1.5 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25" title="Cancel request"><XIcon className="w-4 h-4" /></button>
                ) : (
                  <button onClick={() => handleSearchAction(r)} className="p-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25" title="Add friend"><UserPlus className="w-4 h-4" /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/20 border border-border/30">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-display font-semibold transition-colors ${tab === t.key ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
            {t.key === "requests" && incoming.length > 0 && <span className="neon-badge bg-destructive">{incoming.length}</span>}
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
        {tab === "friends" && (
          friendsWithInfo.length === 0
            ? <Empty text="No friends yet. Search for pilots to add!" />
            : (
              <>
                <div className="flex gap-1 p-1 rounded-xl bg-muted/20 border border-border/30">
                  {[["all", "All"], ["online", "Online"], ["offline", "Offline"]].map(([key, label]) => (
                    <button key={key} onClick={() => setFriendFilter(key)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-display font-semibold transition-colors ${friendFilter === key ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
                      {label}{key === "online" && onlineCount > 0 ? ` (${onlineCount})` : ""}
                    </button>
                  ))}
                </div>
                {filteredFriends.length === 0
                  ? <Empty text={friendFilter === "online" ? "No friends online." : "No offline friends."} />
                  : filteredFriends.map((f) => (
                      <FriendRow key={f.id} friend={f} presence={presence[f.id]}
                        onMessage={message} onProfile={setProfile}
                        onRemove={async (fr) => { await removeFriend(me.id, fr.id); toast({ title: "Friend removed" }); load(); }} />
                    ))}
              </>
            )
        )}

        {tab === "requests" && (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-display tracking-wide text-muted-foreground uppercase mb-1">Incoming</p>
              {incoming.length === 0 ? <Empty text="No incoming requests." /> : incoming.map((r) => (
                <RequestRow key={r.id} name={r.from_name} subtitle="wants to be friends"
                  actions={[
                    { icon: Check, color: "#34D399", onClick: async () => { await acceptRequest(r, me); toast({ title: "Friend added" }); load(); } },
                    { icon: XIcon, color: "#EF4444", onClick: async () => { await declineRequest(r); load(); } },
                  ]} />
              ))}
            </div>
            <div>
              <p className="text-[10px] font-display tracking-wide text-muted-foreground uppercase mb-1">Outgoing</p>
              {outgoing.length === 0 ? <Empty text="No outgoing requests." /> : outgoing.map((r) => (
                <RequestRow key={r.id} name={r.to_name} subtitle="request pending" actions={[]} />
              ))}
            </div>
          </div>
        )}

        {tab === "blocked" && (
          blocked.length === 0
            ? <Empty text="No blocked players." />
            : blocked.map((b) => (
                <RequestRow key={b.id} name={b.blocked_name} subtitle="blocked"
                  actions={[{ icon: XIcon, color: "#34D399", onClick: async () => { await unblockPlayer(me.id, b.blocked_id); toast({ title: "Unblocked" }); load(); } }]} />
              ))
        )}
      </motion.div>

      {profile && (
        <PublicProfileSheet target={profile} myChar={me} onClose={() => setProfile(null)}
          onMessage={(t) => { setProfile(null); message(t); }}
          onBlock={async (t) => { await blockPlayer(me, t); toast({ title: "Player blocked" }); setProfile(null); load(); }}
          onReport={async (t) => { await reportPlayer(me.id, t, "Inappropriate profile", "profile"); toast({ title: "Report submitted" }); setProfile(null); }} />
      )}
    </div>
  );
}

function Empty({ text }) {
  return <p className="text-center text-xs text-muted-foreground italic py-8">{text}</p>;
}

function RequestRow({ name, subtitle, actions }) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/15 border border-border/20">
      <div className="w-9 h-9 rounded-lg bg-muted/40 flex items-center justify-center text-sm font-bold" style={{ color: "#22D3EE" }}>{(name || "?")[0]?.toUpperCase()}</div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold text-sm truncate">{name}</p>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      {actions.map((a, i) => (
        <button key={i} onClick={a.onClick} className="p-1.5 rounded-lg hover:bg-muted/30" style={{ color: a.color }}><a.icon className="w-4 h-4" /></button>
      ))}
    </div>
  );
}