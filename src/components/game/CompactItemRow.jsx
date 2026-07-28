import React from "react";
import { RARITY_COLORS, STAT_ICONS, computeStardustValue, STARDUST_COLOR } from "@/lib/gameData";
import GearVisual from "@/components/game/GearVisual";
import { Check } from "lucide-react";

// Condensed single-line inventory row — keeps name, rarity, top stats, and
// quick actions visible so many items fit in the scroll area at once.
export default function CompactItemRow({ item, onEquip, onSell, onUse, selectable, selected, onToggleSelect }) {
  const color = RARITY_COLORS[item.rarity] || "#9CA3AF";
  return (
    <div
      className={`flex items-center gap-2 p-1.5 rounded-lg border bg-card/60 hover:bg-card/80 transition-colors ${selected ? "ring-1 ring-primary" : ""}`}
      style={{ borderColor: color + "40" }}
    >
      {selectable && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected ? "bg-primary border-primary" : "border-border/60 hover:border-primary"}`}
        >
          {selected && <Check className="w-3 h-3 text-primary-foreground" />}
        </button>
      )}
      <GearVisual type={item.type} rarity={item.rarity} name={item.name} baseName={item.base_name} level_requirement={item.level_requirement} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold break-words leading-tight" style={{ color }}>{item.name}</p>
          {item.is_equipped && <span className="text-[9px] bg-primary/20 text-primary px-1 rounded shrink-0">EQ</span>}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="capitalize">{item.rarity}</span>
          {item.stats && Object.entries(item.stats).filter(([, v]) => v > 0).slice(0, 4).map(([s, v]) => (
            <span key={s}>{STAT_ICONS[s]}{v}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {item.type === "consumable" && onUse && (
          <button onClick={(e) => { e.stopPropagation(); onUse(item); }} className="text-[10px] bg-accent/15 hover:bg-accent/25 text-accent px-1.5 py-0.5 rounded font-medium transition-colors">Use</button>
        )}
        {onEquip && !item.is_equipped && (
          <button onClick={(e) => { e.stopPropagation(); onEquip(item); }} className="text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium transition-colors">Equip</button>
        )}
        {item.is_equipped && onEquip && (
          <button onClick={(e) => { e.stopPropagation(); onEquip(item); }} className="text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded font-medium transition-colors">Off</button>
        )}
        {onSell && !item.is_equipped && (
          <button
            onClick={(e) => { e.stopPropagation(); onSell(item); }}
            title={`Dissolve for ${computeStardustValue(item)} stardust`}
            className="text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors hover:opacity-90"
            style={{ color: STARDUST_COLOR, backgroundColor: `${STARDUST_COLOR}26` }}
          >
            ✨{computeStardustValue(item)}
          </button>
        )}
      </div>
    </div>
  );
}