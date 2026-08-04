import React, { useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/api/gameClient";
import { Flag, Search, Users } from "lucide-react";
import { GUILD_MAX_MEMBERS } from "@/lib/gameData";
import GuildRecruitingList from "@/components/game/GuildRecruitingList";
import { requestToJoinGuild, joinGuildById } from "@/lib/guildUtils";
import { stripDigitsFromName, nameHasDigits, NAME_NO_DIGITS_MSG } from "@/lib/nameRules";
import StardustIcon from "@/components/game/StardustIcon";
import { trackStardustSpend } from "@/lib/stardustTracker";

const GUILD_CREATE_COST = 5000;

export default function GuildCreation({ character, onJoined }) {
  const [mode, setMode] = useState("create");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [joinName, setJoinName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleCreate() {
    if (!name.trim()) { setError("Guild needs a name."); return; }
    if (nameHasDigits(name)) { setError(NAME_NO_DIGITS_MSG); return; }
    if ((character.stardust || 0) < GUILD_CREATE_COST) {
      setError(`You need ${GUILD_CREATE_COST} stardust to found a guild.`);
      return;
    }
    setBusy(true); setError("");
    try {
      await api.functions.invoke("CreateGuild", {
        name: name.trim(),
        tag: tag.trim().toUpperCase().slice(0, 4),
        description: description.trim(),
      });
      void trackStardustSpend(character, GUILD_CREATE_COST, "guild_create");
      onJoined();
    } catch (e) {
      setError(e?.message || "Could not create guild. That name may be taken.");
      setBusy(false);
    }
  }

  async function joinGuild(g) {
    if ((g.member_count || 0) >= GUILD_MAX_MEMBERS) {
      setError("That guild is full.");
      return;
    }
    setBusy(true); setError("");
    try {
      await joinGuildById(character, g.id);
      onJoined();
    } catch (e) {
      setError(e?.message || "Could not join that guild.");
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!joinName.trim()) { setError("Enter a guild name to join."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const found = await api.entities.Guild.filter({ name: joinName.trim() });
      if (!found.length) { setError("No guild found with that name."); setBusy(false); return; }
      if (found[0].recruiting === false) {
        await requestToJoinGuild(character, found[0]);
        setBusy(false);
        setNotice(`Request sent to join ${found[0].name}. An officer will review it.`);
        return;
      }
      await joinGuild(found[0]);
    } catch (e) {
      setError(e.message || "Could not join that guild.");
      setBusy(false);
    }
  }

  async function requestJoin(g) {
    if ((g.member_count || 0) >= GUILD_MAX_MEMBERS) { setError("That guild is full."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await requestToJoinGuild(character, g);
      setBusy(false);
      setNotice(`Request sent to join ${g.name}. An officer will review it.`);
    } catch (e) {
      setError(e.message || "Could not send request.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl w-full mx-auto">
      <div className="text-center mb-6">
        <h1 className="font-display font-bold text-2xl glow-cyan tracking-wider flex items-center justify-center gap-2">
          <Users className="w-6 h-6 text-primary" /> FORM A GUILD
        </h1>
        <p className="text-muted-foreground text-sm mt-1.5">Band together to share progression and mission glory.</p>
      </div>

      <div className="flex gap-2 mb-5">
        {["create", "join"].map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(""); setNotice(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-display font-semibold tracking-wide capitalize transition-colors border ${
              mode === m ? "bg-primary/15 text-primary border-primary/40" : "bg-muted/20 text-muted-foreground border-border/40"
            }`}
          >
            {m === "create" ? "Found New" : "Join Existing"}
          </button>
        ))}
      </div>

      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 space-y-4"
      >
        {mode === "create" ? (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Guild Name</label>
              <input value={name} onChange={(e) => setName(stripDigitsFromName(e.target.value))} placeholder="e.g. Nova Syndicate" maxLength={32}
                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tag (optional)</label>
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="NOVA" maxLength={4}
                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your guild stand for?" maxLength={160} rows={3}
                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
            </div>
            <button onClick={handleCreate} disabled={busy || (character.stardust || 0) < GUILD_CREATE_COST}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-lg font-display font-bold tracking-wide disabled:opacity-50 transition-colors">
              {busy ? <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : <Flag className="w-4 h-4" />}
              FOUND GUILD <span className="opacity-80 inline-flex items-center gap-1">· <StardustIcon className="w-3 h-3" glow={false} />{GUILD_CREATE_COST}</span>
            </button>
          </>
        ) : (
          <>
            <GuildRecruitingList character={character} onPick={(g) => joinGuild(g)} onRequest={(g) => requestJoin(g)} />

            <div className="pt-2 border-t border-border/30">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Or join by name</label>
              <input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Enter the exact guild name" maxLength={32}
                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
              <button onClick={handleJoin} disabled={busy}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-lg font-display font-bold tracking-wide disabled:opacity-50 transition-colors">
                {busy ? <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                JOIN GUILD
              </button>
            </div>
          </>
        )}
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        {notice && <p className="text-xs text-green-400 text-center">{notice}</p>}
      </motion.div>
    </div>
  );
}