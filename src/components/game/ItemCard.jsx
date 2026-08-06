import React from "react";
import { RARITY_COLORS, computeStardustValue, gearTypeLabel, STARDUST_COLOR } from "@/lib/gameData";
import GearVisual from "@/components/game/GearVisual";
import StardustIcon from "@/components/game/StardustIcon";
import StatIcon, { GearAttributeChips } from "@/components/game/StatIcon";

export default function ItemCard({ item, onEquip, onSell, onUse, compact = false }) {
  const rarityColor = RARITY_COLORS[item.rarity];

  if (compact) {
    return (
      <div
        className="p-2.5 rounded-lg border bg-card/50 hover:bg-card transition-colors"
        style={{ borderColor: rarityColor + "40" }}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: rarityColor }}>{item.name}</p>
            <p className="text-[10px] text-muted-foreground">{gearTypeLabel(item.type)} · {item.rarity}</p>
          </div>
          {item.is_equipped && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium shrink-0 ml-1">EQ</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-4 rounded-xl border bg-card/60 backdrop-blur-sm"
      style={{ borderColor: rarityColor + "40", boxShadow: `0 0 12px ${rarityColor}10` }}
    >
      <div className="flex items-center justify-center mb-3">
        <GearVisual type={item.type} rarity={item.rarity} name={item.name} baseName={item.base_name} level_requirement={item.level_requirement} />
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-display font-semibold text-sm" style={{ color: rarityColor }}>{item.name}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{gearTypeLabel(item.type)} · Lv.{item.level_requirement}</p>
        </div>
        <span
          className="text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full"
          style={{ backgroundColor: rarityColor + "15", color: rarityColor }}
        >
          {item.rarity}
        </span>
      </div>

      {item.stats && Object.keys(item.stats).length > 0 && (
        <GearAttributeChips stats={item.stats} presentation="itemPane" className="mt-3" />
      )}

      {item.type === "consumable" && item.consumable && (
        <p className="text-xs text-primary mt-3 inline-flex items-center gap-1.5 flex-wrap">
          <StatIcon stat={item.consumable.stat} presentation="itemPane" /> +{Math.round(item.consumable.mult * 100)}% {item.consumable.stat} · {item.consumable.duration_hours}h
        </p>
      )}

      {item.flavor_text && (
        <p className="text-[10px] italic text-muted-foreground mt-2">"{item.flavor_text}"</p>
      )}

      <div className="flex items-center gap-2 mt-3">
        {item.type === "consumable" && onUse && (
          <button
            onClick={() => onUse(item)}
            className="text-xs bg-accent/15 hover:bg-accent/25 text-accent px-3 py-1 rounded-lg font-medium transition-colors"
          >
            Use
          </button>
        )}
        {onEquip && !item.is_equipped && (
          <button
            onClick={() => onEquip(item)}
            className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1 rounded-lg font-medium transition-colors"
          >
            Equip
          </button>
        )}
        {item.is_equipped && (
          <button
            onClick={() => onEquip(item)}
            className="text-xs bg-muted hover:bg-muted/80 text-muted-foreground px-3 py-1 rounded-lg font-medium transition-colors"
          >
            Unequip
          </button>
        )}
        {onSell && !item.is_equipped && (
          <button
            onClick={() => onSell(item)}
            className="text-xs px-3 py-1 rounded-lg font-medium transition-colors hover:opacity-90"
            style={{ color: STARDUST_COLOR, backgroundColor: `${STARDUST_COLOR}26` }}
          >
            Dissolve (<StardustIcon className="w-3 h-3 inline align-text-bottom" glow={false} /> {computeStardustValue(item)})
          </button>
        )}
      </div>
    </div>
  );
}