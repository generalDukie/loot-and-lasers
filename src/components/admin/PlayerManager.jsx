import React, { useState, useEffect, useRef } from "react";
import { api } from "@/api/gameClient";
import { Search } from "lucide-react";
import PlayerDetail from "./PlayerDetail";
import { normalizeForSearch } from "@/lib/utils";

export default function PlayerManager({ onAction }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [target, setTarget] = useState(null);
  const searchRef = useRef(search);

  async function search(q = query) {
    const all = await api.entities.Character.list("-created_date", 200);
    const nq = normalizeForSearch(q);
    setResults(all.filter((c) => normalizeForSearch(c.name).includes(nq)).slice(0, 20));
  }
  searchRef.current = search;

  async function refreshCharacter(charId) {
    if (!charId) return;
    try {
      const fresh = await api.entities.Character.get(charId);
      setTarget((t) => (t?.id === charId ? fresh : t));
      setResults((prev) => prev.map((c) => (c.id === charId ? fresh : c)));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => searchRef.current(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-muted/30 border border-border/40 rounded-lg px-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search player name..." className="flex-1 bg-transparent py-2 text-sm outline-none" />
        </div>
      </div>
      <div className="space-y-1.5">
        {results.map((c) => (
          <button key={c.id} onClick={() => setTarget(c)} className={`w-full flex items-center gap-2 p-2 rounded-xl border text-left transition-colors ${target?.id === c.id ? "bg-primary/15 border-primary/40" : "bg-muted/15 border-border/20 hover:bg-muted/25"}`}>
            <span className="flex-1 text-sm font-display font-semibold">{c.name}</span>
            <span className="text-[10px] text-muted-foreground">Lv{c.level} · {c.class}</span>
          </button>
        ))}
        {results.length === 0 && query.trim() && <p className="text-xs text-muted-foreground italic text-center py-4">No players found.</p>}
        {results.length === 0 && !query.trim() && <p className="text-xs text-muted-foreground italic text-center py-4">Type a name to search players.</p>}
      </div>
      {target && <PlayerDetail character={target} onAction={onAction} onRefresh={() => refreshCharacter(target.id)} />}
    </div>
  );
}