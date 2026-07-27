import React from "react";
import { RARITY_COLORS, STAT_ICONS } from "@/lib/gameData";
import GearVisual from "@/components/game/GearVisual";

const SLOT_CONFIG = [
  { key: "weapon", label: "Weapon", icon: "⚔️" },
  { key: "helmet", label: "Helmet", icon: "⛑️" },
  { key: "armor", label: "Armor", icon: "🛡️" },
  { key: "boots", label: "Boots", icon: "🥾" },
  { key: "legs", label: "Legs", icon: "🦵" },
  { key: "neck", label: "Neck", icon: "📿" },
  { key: "accessory", label: "Ring", icon: "💍" },
  { key: "ship_module", label: "Ship Module", icon: "🚀" },
];

export default function EquipmentSlots({ equippedItems }) {
  const bySlot = {};
  equippedItems.forEach(item => { bySlot[item.type] = item; });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {SLOT_CONFIG.map(slot => {
        const item = bySlot[slot.key];
        const rarityColor = item ? RARITY_COLORS[item.rarity] : null;
        return (
          <div
            key={slot.key}
            className={`rounded-lg border p-2 transition-colors ${
              item ? "bg-card/40" : "border-dashed border-border/30 bg-muted/10"
            }`}
            style={item ? { borderColor: rarityColor + "40" } : undefined}
          >
            {item ? (
              <div className="flex flex-col items-center text-center">
                <GearVisual type={item.type} rarity={item.rarity} name={item.name} />
                <p className="text-[11px] font-semibold truncate w-full mt-1" style={{ color: rarityColor }}>{item.name}</p>
                {item.stats && Object.keys(item.stats).length > 0 && (
                  <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 mt-1">
                    {Object.entries(item.stats).filter(([, v]) => v > 0).map(([stat, val]) => (
                      <span key={stat} className="text-[10px] text-foreground/80">
                        {STAT_ICONS[stat]}+{val}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <span className="text-xl opacity-30 mb-1">{slot.icon}</span>
                <span className="text-[10px] text-muted-foreground/50 font-display tracking-wide">{slot.label.toUpperCase()}</span>
                <span className="text-[9px] text-muted-foreground/30">Empty</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}