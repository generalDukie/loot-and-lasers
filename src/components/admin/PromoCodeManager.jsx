import React, { useState, useEffect } from "react";
import { api } from "@/api/gameClient";
import { CONSUMABLES } from "@/lib/gameData";
import { Ticket, Trash2, Plus, Power } from "lucide-react";

export default function PromoCodeManager({ onAction }) {
  const [codes, setCodes] = useState([]);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [maxRed, setMaxRed] = useState(0);
  const [rewards, setRewards] = useState({ stardust: 0, nova_crystals: 0, experience: 0, item_rarity: "", consumable: "" });

  async function load() { setCodes(await api.entities.PromoCode.list("-created_date", 100)); }
  useEffect(() => { load(); }, []);

  async function create() {
    const r = {};
    if (rewards.stardust) r.stardust = +rewards.stardust;
    if (rewards.nova_crystals) r.nova_crystals = +rewards.nova_crystals;
    if (rewards.experience) r.experience = +rewards.experience;
    if (rewards.item_rarity) r.item_rarity = rewards.item_rarity;
    if (rewards.consumable) {
      const c = CONSUMABLES[Math.floor(Math.random() * CONSUMABLES.length)];
      r.collectible = { name: c.name, type: "consumable", consumable: c.consumable, rarity: c.rarity, flavor_text: c.flavor_text };
    }
    const res = await onAction({ action: "create_promo_code", code, label, rewards: r, max_redemptions: +maxRed });
    if (res) {
      setCode(""); setLabel(""); setMaxRed(0);
      setRewards({ stardust: 0, nova_crystals: 0, experience: 0, item_rarity: "", consumable: "" });
      load();
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 max-h-56 overflow-y-auto">
        {codes.map((c) => (
          <div key={c.id} className="flex items-center gap-2 p-2 rounded-xl bg-muted/15 border border-border/20">
            <Ticket className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-display font-semibold truncate">{c.code} <span className="text-[10px] text-muted-foreground">· {c.label}</span></p>
              <p className="text-[10px] text-muted-foreground truncate">{c.active ? "Active" : "Inactive"} · {(c.redeemed_by || []).length}/{c.max_redemptions || "∞"} redeemed · {JSON.stringify(c.rewards || {})}</p>
            </div>
            <button onClick={() => onAction({ action: "toggle_promo_code", promo_code_id: c.id, active: !c.active }).then(load)} className="p-1 rounded text-amber-400 hover:bg-amber-500/10"><Power className="w-3.5 h-3.5" /></button>
            <button onClick={() => { if (confirm("Delete this promo code?")) onAction({ action: "delete_promo_code", promo_code_id: c.id }).then(load); }} className="p-1 rounded text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        {codes.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">No promo codes yet.</p>}
      </div>

      <div className="space-y-2 p-3 rounded-xl bg-muted/10 border border-border/30">
        <h3 className="text-xs font-display font-semibold text-muted-foreground flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />CREATE PROMO CODE</h3>
        <div className="grid grid-cols-2 gap-1.5">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE (e.g. SUMMER50)" className="bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[10px] text-muted-foreground">✨ Stardust<input type="number" value={rewards.stardust} onChange={(e) => setRewards({ ...rewards, stardust: +e.target.value })} className="w-full bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs mt-0.5" /></label>
          <label className="text-[10px] text-muted-foreground">💎 Nova Crystals<input type="number" value={rewards.nova_crystals} onChange={(e) => setRewards({ ...rewards, nova_crystals: +e.target.value })} className="w-full bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs mt-0.5" /></label>
          <label className="text-[10px] text-muted-foreground">⭐ Experience<input type="number" value={rewards.experience} onChange={(e) => setRewards({ ...rewards, experience: +e.target.value })} className="w-full bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs mt-0.5" /></label>
          <label className="text-[10px] text-muted-foreground">🔁 Max Uses (0=∞)<input type="number" value={maxRed} onChange={(e) => setMaxRed(+e.target.value)} className="w-full bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs mt-0.5" /></label>
        </div>
        <select value={rewards.consumable} onChange={(e) => setRewards({ ...rewards, consumable: e.target.value })} className="w-full bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs">
          <option value="">No consumable</option>
          <option value="random">Random Consumable</option>
        </select>
        <select value={rewards.item_rarity} onChange={(e) => setRewards({ ...rewards, item_rarity: e.target.value })} className="w-full bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs">
          <option value="">No item reward</option>
          <option value="uncommon">Uncommon Item</option>
          <option value="rare">Rare Item</option>
          <option value="epic">Epic Item</option>
          <option value="legendary">Legendary Item</option>
        </select>
        <button onClick={create} disabled={!code.trim()} className="w-full painted-btn text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"><Plus className="w-3.5 h-3.5" />Create Code</button>
      </div>
    </div>
  );
}