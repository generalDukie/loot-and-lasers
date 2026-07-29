import React, { useState, useEffect } from "react";
import { api } from "@/api/gameClient";
import { Ban, Volume2, RotateCcw, RefreshCw, Pencil, Check, X } from "lucide-react";
import CurrencyAdjustForm from "./CurrencyAdjustForm";
import ItemGrantForm from "./ItemGrantForm";
import PromoteAdminButton from "./PromoteAdminButton";
import { stripDigitsFromName, nameHasDigits, NAME_NO_DIGITS_MSG } from "@/lib/nameRules";
import StardustIcon from "@/components/game/StardustIcon";

const RARITY_COLORS = { common: "#9CA3AF", uncommon: "#22C55E", rare: "#3B82F6", epic: "#A855F7", legendary: "#F59E0B" };

function ItemChip({ it }) {
  const c = RARITY_COLORS[it.rarity] || "#9CA3AF";
  return (
    <div className="p-1.5 rounded-lg border bg-muted/20 text-center" style={{ borderColor: c + "55" }}>
      <p className="text-[10px] font-medium truncate" style={{ color: c }}>{it.name}</p>
      <p className="text-[9px] text-muted-foreground capitalize">{it.rarity}</p>
    </div>
  );
}

export default function PlayerDetail({ character, onAction, onRefresh }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [muteMin, setMuteMin] = useState(30);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(character.name);
  const [savingName, setSavingName] = useState(false);
  const [accountEmail, setAccountEmail] = useState(null);

  useEffect(() => { setNameDraft(character.name); setEditingName(false); }, [character.id, character.name]);

  useEffect(() => {
    setAccountEmail(null);
    if (!character?.created_by_id) return;
    api.entities.User.get(character.created_by_id)
      .then((u) => setAccountEmail(u?.email || null))
      .catch(() => setAccountEmail(null));
  }, [character?.id, character?.created_by_id]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === character.name) { setEditingName(false); return; }
    if (nameHasDigits(trimmed)) {
      onAction?.({ action: "toast", message: NAME_NO_DIGITS_MSG, variant: "destructive" });
      return;
    }
    setSavingName(true);
    try {
      await api.entities.Character.update(character.id, { name: trimmed });
      onRefresh();
    } catch (e) {
      onAction?.({ action: "toast", message: e?.message || "Failed to rename player.", variant: "destructive" });
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  }

  async function loadInv() {
    setLoading(true);
    const list = await api.entities.Item.filter({ character_id: character.id }, "-created_date", 100);
    setItems(list);
    setLoading(false);
  }
  useEffect(() => { loadInv(); }, [character.id]);

  return (
    <div className="space-y-4 p-3 rounded-xl bg-muted/10 border border-border/30">
      <div className="flex items-center justify-between">
        <div>
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(stripDigitsFromName(e.target.value))}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                maxLength={32}
                className="bg-muted/40 border border-primary/50 rounded px-2 py-0.5 text-sm font-display font-bold outline-none w-44"
              />
              <button onClick={saveName} disabled={savingName} className="p-1 rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setEditingName(false); setNameDraft(character.name); }} className="p-1 rounded-lg bg-muted/30 text-muted-foreground hover:bg-muted/50"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h3 className="font-display font-bold text-base glow-cyan">{character.name}</h3>
              <button onClick={() => setEditingName(true)} className="p-1 rounded-lg text-primary/70 hover:text-primary hover:bg-primary/10" title="Rename player"><Pencil className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Lv{character.level} · {character.race} {character.class}</p>
          {accountEmail && (
            <p className="text-[10px] text-muted-foreground/70 truncate" title={accountEmail}>Account · {accountEmail}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-right">
          <span className="inline-flex items-center justify-end gap-1"><StardustIcon className="w-3 h-3" glow={false} /> {(character.stardust || 0).toLocaleString()}</span>
          <span>💎 {(character.nova_crystals || 0).toLocaleString()}</span>

          <span>⛽ {character.fuel || 0}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1">
          <input type="number" value={muteMin} onChange={(e) => setMuteMin(+e.target.value)} className="w-16 bg-muted/40 border border-border/40 rounded px-1.5 py-1 text-xs" />
          <button onClick={() => onAction({ action: "mute", character_id: character.id, minutes: muteMin, reason: "admin" })} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300"><Volume2 className="w-3 h-3" />Mute</button>
        </div>
        <button onClick={() => onAction({ action: "ban", character_id: character.id, reason: "admin" })} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-destructive/15 text-destructive"><Ban className="w-3 h-3" />Ban</button>
        <button onClick={() => onAction({ action: "unban", character_id: character.id })} className="text-xs px-2 py-1 rounded-lg bg-green-500/15 text-green-300">Unban</button>
        <button onClick={async () => { if (confirm(`Reset ${character.name} to level 1? This wipes their inventory and progress.`)) { const reason = window.prompt("Reason for player reset?"); if (!reason) return; await onAction({ action: "reset_player", character_id: character.id, reason }); onRefresh(); loadInv(); } }} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-500/15 text-red-300"><RotateCcw className="w-3 h-3" />Reset</button>
      </div>

      <PromoteAdminButton character={character} onAction={onAction} />
      <CurrencyAdjustForm character={character} onAction={onAction} onDone={onRefresh} />
      <ItemGrantForm character={character} onAction={onAction} onGranted={loadInv} />

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-xs font-display font-semibold text-muted-foreground">INVENTORY ({items.length})</h4>
          <button onClick={loadInv} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"><RefreshCw className="w-3 h-3" />Refresh</button>
        </div>
        {loading ? <p className="text-xs text-muted-foreground">Loading...</p> : items.length === 0 ? <p className="text-xs text-muted-foreground italic">No items.</p> : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">{items.map((it) => <ItemChip key={it.id} it={it} />)}</div>
        )}
      </div>
    </div>
  );
}