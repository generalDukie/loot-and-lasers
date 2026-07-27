import React, { useState } from "react";
import { motion } from "framer-motion";
import { searchCharacters } from "@/lib/socialEngine";
import { invitePlayerToGuild } from "@/lib/guildUtils";
import { UserPlus, Search } from "lucide-react";

export default function GuildInvitePanel({ character, guild }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setNotice("");
    setSearched(false);
    try {
      const chars = await searchCharacters(query.trim(), character.id);
      setResults(chars);
      setSearched(true);
    } catch (err) {
      setResults([]);
      setSearched(true);
    }
  }

  async function handleInvite(target) {
    setBusy(true);
    setNotice("");
    try {
      await invitePlayerToGuild(character, guild, target);
      setNotice(`Invitation sent to ${target.name}.`);
      setResults(results.filter((r) => r.id !== target.id));
    } catch (e) {
      setNotice(e.message || "Could not send invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <UserPlus className="w-4 h-4 text-primary" />
        <h3 className="font-display font-bold text-sm tracking-wide">Invite Player</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Send a personal guild invitation</span>
      </div>
      <form onSubmit={handleSearch} className="flex gap-2 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player by name..."
          maxLength={32}
          className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
        <button type="submit" disabled={!query.trim()}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-display font-semibold disabled:opacity-40">
          <Search className="w-3.5 h-3.5" /> Search
        </button>
      </form>

      {results.length > 0 && (
        <div className="space-y-1.5 mb-2 max-h-[200px] overflow-y-auto">
          {results.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/20 border border-border/30">
              <div className="min-w-0">
                <p className="text-sm font-display font-semibold truncate">{r.name}</p>
                <p className="text-[10px] text-muted-foreground">Level {r.level || 1} · {r.race || "Unknown"}</p>
              </div>
              <button
                onClick={() => handleInvite(r)}
                disabled={busy}
                className="text-xs px-2.5 py-1 rounded-lg painted-btn disabled:opacity-40"
              >
                Invite
              </button>
            </div>
          ))}
        </div>
      )}

      {searched && results.length === 0 && (
        <p className="text-xs text-muted-foreground italic text-center py-2">No players found.</p>
      )}

      {notice && <p className="text-xs text-green-400 text-center">{notice}</p>}
    </motion.div>
  );
}