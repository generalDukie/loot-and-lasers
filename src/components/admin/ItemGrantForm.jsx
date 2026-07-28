import React, { useState } from "react";
import { Gift, FlaskConical, Sliders } from "lucide-react";
import { generateItem, CONSUMABLES, consumableItem, weaponEmojiFor } from "@/lib/gameData";

const TYPES = ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const STAT_KEYS = [["strength", "STR"], ["agility", "AGI"], ["intellect", "INT"], ["vitality", "VIT"], ["luck", "LUK"]];

export default function ItemGrantForm({ character, onAction, onGranted }) {
  const [mode, setMode] = useState("gear");
  const [type, setType] = useState("weapon");
  const [rarity, setRarity] = useState("rare");
  const [level, setLevel] = useState(character.level || 1);
  const [consumableIdx, setConsumableIdx] = useState(0);
  const [custom, setCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customStats, setCustomStats] = useState({ strength: 0, agility: 0, intellect: 0, vitality: 0, luck: 0 });
  const [busy, setBusy] = useState(false);

  async function grantGear() {
    if (!character?.id || busy) return;
    setBusy(true);
    try {
      let item;
      if (custom) {
        item = {
          name: customName.trim() || `${rarity} ${type}`,
          type,
          rarity,
          level_requirement: Math.max(1, level),
          stats: Object.fromEntries(Object.entries(customStats).filter(([, v]) => v && v !== 0)),
          flavor_text: "Admin-crafted gear.",
          sell_value: Math.max(10, level * 20),
          is_equipped: false,
          ...(type === "weapon" ? { emoji: weaponEmojiFor(customName.trim() || `${rarity} ${type}`) } : {}),
        };
      } else {
        item = generateItem(rarity, Math.max(1, level), type);
      }
      const res = await onAction({ action: "give_item", character_id: character.id, item });
      if (res?.item) onGranted?.(res.item);
    } finally {
      setBusy(false);
    }
  }
  async function grantConsumable() {
    if (!character?.id || busy) return;
    const def = CONSUMABLES[consumableIdx];
    if (!def) return;
    setBusy(true);
    try {
      const item = consumableItem(def);
      const res = await onAction({ action: "give_item", character_id: character.id, item });
      if (res?.item) onGranted?.(res.item);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 p-2.5 rounded-lg bg-muted/15 border border-border/20">
      <div className="flex gap-1">
        <button onClick={() => setMode("gear")} className={`flex-1 text-xs py-1 rounded-lg ${mode === "gear" ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"}`}>Gear</button>
        <button onClick={() => setMode("consumable")} className={`flex-1 text-xs py-1 rounded-lg ${mode === "consumable" ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"}`}>Consumable</button>
      </div>
      {mode === "gear" ? (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            <select value={type} onChange={(e) => setType(e.target.value)} className="bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs capitalize">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs capitalize">
              {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input type="number" value={level} onChange={(e) => setLevel(+e.target.value)} min={1} className="bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs" title="Item level" />
          </div>
          <button onClick={() => setCustom(!custom)} className={`w-full text-xs py-1 rounded-lg flex items-center justify-center gap-1.5 ${custom ? "bg-accent/20 text-accent border border-accent/40" : "bg-muted/30 text-muted-foreground"}`}>
            <Sliders className="w-3.5 h-3.5" />{custom ? "Custom Stats: ON" : "Custom Stats: OFF"}
          </button>
          {custom && (
            <div className="space-y-1.5 p-2 rounded-lg bg-muted/20 border border-border/20">
              <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Custom name (optional)" className="w-full bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs" />
              <div className="grid grid-cols-5 gap-1">
                {STAT_KEYS.map(([k, label]) => (
                  <div key={k}>
                    <p className="text-[9px] text-muted-foreground font-bold mb-0.5 text-center">{label}</p>
                    <input type="number" value={customStats[k]} onChange={(e) => setCustomStats({ ...customStats, [k]: +e.target.value })} className="w-full bg-muted/40 border border-border/40 rounded px-1 py-1 text-xs text-center" />
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center">
            Granting to <span className="text-foreground font-semibold">{character.name}</span>
          </p>
          <button
            type="button"
            onClick={grantGear}
            disabled={busy}
            className="w-full painted-btn text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Gift className="w-3.5 h-3.5" />{busy ? "Granting…" : "Grant Gear"}
          </button>
        </>
      ) : (
        <>
          <select value={consumableIdx} onChange={(e) => setConsumableIdx(+e.target.value)} className="w-full bg-muted/40 border border-border/40 rounded px-2 py-1.5 text-xs">
            {CONSUMABLES.map((c, i) => <option key={i} value={i}>{c.name}</option>)}
          </select>
          <button
            type="button"
            onClick={grantConsumable}
            disabled={busy}
            className="w-full painted-btn painted-btn-accent text-xs py-1.5 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <FlaskConical className="w-3.5 h-3.5" />{busy ? "Spawning…" : "Spawn Consumable"}
          </button>
        </>
      )}
    </div>
  );
}