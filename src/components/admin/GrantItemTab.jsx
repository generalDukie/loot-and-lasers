import React, { useState, useEffect } from "react";
import { Search, Gift, Coins, Gem, Fuel, Swords, User, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "@/api/gameClient";
import { getMyCharacter, getMyCharacters } from "@/lib/socialEngine";
import ItemGrantForm from "@/components/admin/ItemGrantForm";

export default function GrantItemTab({ onAction }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searching, setSearching] = useState(false);
  const [myChars, setMyChars] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // currency / xp deltas
  const [deltas, setDeltas] = useState({ stardust: 0, nova_crystals: 0, fuel: 0, arena_attempts: 0, experience: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [active, all] = await Promise.all([getMyCharacter({ force: true }), getMyCharacters()]);
        setMyChars(all || []);
        setActiveId(active?.id || null);
        // Default recipient = active operative so self-grants work without searching.
        if (active) setSelected(active);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const chars = await api.entities.Character.list("-created_date", 2000);
        const q = query.trim().toLowerCase();
        setResults(chars.filter((c) => (c.name || "").toLowerCase().includes(q)));
      } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function applyCurrency(sign) {
    if (!selected) return;
    const clean = Object.fromEntries(
      Object.entries(deltas)
        .map(([k, v]) => [k, Math.abs(Number(v) || 0) * sign])
        .filter(([, v]) => v !== 0),
    );
    if (!Object.keys(clean).length) return;
    const res = await onAction({ action: "adjust_currency", character_id: selected.id, deltas: clean });
    if (res?.character) setSelected(res.character);
    setDeltas({ stardust: 0, nova_crystals: 0, fuel: 0, arena_attempts: 0, experience: 0 });
  }

  return (
    <div className="space-y-4">
      {/* Character search */}
      <div className="painted-panel canvas-grain p-3 space-y-2">
        <label className="text-xs font-display font-semibold text-muted-foreground">RECIPIENT</label>
        {myChars.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {myChars.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setSelected(c); setQuery(""); setResults([]); }}
                className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                  selected?.id === c.id
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-muted/25 border-border/30 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <User className="w-3 h-3" />
                {c.name}
                {c.id === activeId && <span className="text-[9px] opacity-70">(active)</span>}
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search character name..."
            className="w-full bg-muted/30 border border-border/40 rounded-lg pl-9 pr-3 py-2 text-sm outline-none"
          />
        </div>
        {searching && <p className="text-xs text-muted-foreground">Searching...</p>}
        {!searching && query.trim() && results.length === 0 && <p className="text-xs text-muted-foreground italic">No matches.</p>}
        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1">
            {results.slice(0, 20).map((c) => (
              <button
                key={c.id}
                onClick={() => { setSelected(c); setQuery(""); setResults([]); }}
                className={`w-full text-left flex items-center justify-between p-2 rounded-lg border ${selected?.id === c.id ? "bg-primary/15 border-primary/40" : "bg-muted/20 border-border/20 hover:bg-muted/30"}`}
              >
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-[10px] text-muted-foreground">Lv {c.level} · {c.class}</span>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/30">
            <div>
              <p className="text-sm font-display font-semibold text-primary">{selected.name}</p>
              <p className="text-[10px] text-muted-foreground">Lv {selected.level} · {selected.race} {selected.class}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-destructive">Change</button>
          </div>
        )}
      </div>

      {!selected ? (
        <p className="text-center text-xs text-muted-foreground italic py-6">Select a recipient above to grant items or currency.</p>
      ) : (
        <>
          {/* Item grant */}
          <div className="painted-panel canvas-grain p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              <h2 className="font-display font-semibold text-sm">Grant Item</h2>
            </div>
            <ItemGrantForm
              character={selected}
              onAction={onAction}
              onGranted={() => {
                /* inventory refreshes on character sheet focus */
              }}
            />
            <p className="text-[10px] text-muted-foreground text-center">
              Gear goes to <span className="text-foreground font-medium">{selected.name}</span>
              {selected.id === activeId ? " (your active operative)" : ""}. Open their character sheet to see it.
            </p>
          </div>

          {/* Currency adjust */}
          <div className="painted-panel canvas-grain p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <h2 className="font-display font-semibold text-sm">Adjust Currency / XP</h2>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <CurrencyRow icon="✨" color="text-purple-400" label="Stardust" value={deltas.stardust} onChange={(v) => setDeltas({ ...deltas, stardust: v })} />
              <CurrencyRow icon={Gem} color="text-amber-400" label="Nova Crystals" value={deltas.nova_crystals} onChange={(v) => setDeltas({ ...deltas, nova_crystals: v })} />
              <CurrencyRow icon={Fuel} color="text-lime-400" label="Fuel" value={deltas.fuel} onChange={(v) => setDeltas({ ...deltas, fuel: v })} />
              <CurrencyRow icon={Swords} color="text-rose-400" label="Arena Attempts" value={deltas.arena_attempts} onChange={(v) => setDeltas({ ...deltas, arena_attempts: v })} />
              <CurrencyRow icon="⭐" color="text-amber-300" label="Experience" value={deltas.experience} onChange={(v) => setDeltas({ ...deltas, experience: v })} />
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => applyCurrency(1)} className="flex-1 painted-btn painted-btn-accent text-sm py-2 rounded-lg flex items-center justify-center gap-1.5">
                <ArrowUp className="w-3.5 h-3.5" /> Add
              </button>
              <button onClick={() => applyCurrency(-1)} className="flex-1 text-sm py-2 rounded-lg flex items-center justify-center gap-1.5 bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-colors">
                <ArrowDown className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CurrencyRow({ icon, color, label, value, onChange }) {
  const isEmoji = typeof icon === 'string';
  const Icon = isEmoji ? null : icon;
  return (
    <div className="flex items-center gap-2">
      {isEmoji ? <span className={`text-base ${color} shrink-0`}>{icon}</span> : <Icon className={`w-4 h-4 ${color} shrink-0`} />}
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(Math.max(0, +e.target.value || 0))}
        className="flex-1 bg-muted/30 border border-border/40 rounded-lg px-2 py-1.5 text-sm text-center"
      />
    </div>
  );
}