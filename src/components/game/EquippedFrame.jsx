import React from "react";
import { RARITY_COLORS, STAT_ICONS } from "@/lib/gameData";
import GearVisual from "@/components/game/GearVisual";

// Equipped gear arranged as a 3x3 frame around the portrait (all 8 slots
// fill the perimeter, portrait sits in the centre):
//  weapon  helmet  neck
//  armor  portrait  ship_module
//  boots   legs   accessory
const FRAME_SLOTS = {
  helmet: { label: "Helmet", icon: "⛑️" },
  weapon: { label: "Weapon", icon: "⚔️" },
  armor: { label: "Armor", icon: "🦺" },
  boots: { label: "Boots", icon: "🥾" },
  legs: { label: "Legs", icon: "🦵" },
  neck: { label: "Neck", icon: "📿" },
  accessory: { label: "Ring", icon: "💍" },
  ship_module: { label: "Ship Module", icon: "🚀" },
};

function SlotChip({ item, slot, size }) {
  if (item) {
    const color = RARITY_COLORS[item.rarity] || "#9CA3AF";
    const statStr = item.stats
      ? Object.entries(item.stats).filter(([, v]) => v > 0).map(([s, v]) => `${STAT_ICONS[s]}+${v}`).join(" ")
      : "";
    return (
      <div
        className="rounded-lg border bg-card/60 p-0.5 flex items-center justify-center transition-transform hover:scale-110 hover:z-10"
        style={{ borderColor: color + "70", boxShadow: `0 0 8px ${color}40`, width: size + 6, height: size + 6 }}
        title={`${item.name}\n${item.rarity} ${item.type}\n${statStr}`}
      >
        <GearVisual type={item.type} rarity={item.rarity} name={item.name} emoji={item.emoji} size={size} />
      </div>
    );
  }
  return (
    <div
      className="rounded-lg border border-dashed border-border/25 bg-muted/5 p-0.5 flex items-center justify-center"
      style={{ width: size + 6, height: size + 6 }}
      title={`${slot.label} slot empty`}
    >
      <span className="opacity-25" style={{ fontSize: Math.max(12, size * 0.45) }}>{slot.icon}</span>
    </div>
  );
}

export default function EquippedFrame({ equippedItems, children, size = 36 }) {
  const bySlot = {};
  (equippedItems || []).forEach((it) => { bySlot[it.type] = it; });
  return (
    <div className="grid grid-cols-3 gap-1.5 items-center justify-items-center">
      <SlotChip item={bySlot.weapon} slot={FRAME_SLOTS.weapon} size={size} />
      <SlotChip item={bySlot.helmet} slot={FRAME_SLOTS.helmet} size={size} />
      <SlotChip item={bySlot.neck} slot={FRAME_SLOTS.neck} size={size} />
      <SlotChip item={bySlot.armor} slot={FRAME_SLOTS.armor} size={size} />
      {children}
      <SlotChip item={bySlot.ship_module} slot={FRAME_SLOTS.ship_module} size={size} />
      <SlotChip item={bySlot.boots} slot={FRAME_SLOTS.boots} size={size} />
      <SlotChip item={bySlot.legs} slot={FRAME_SLOTS.legs} size={size} />
      <SlotChip item={bySlot.accessory} slot={FRAME_SLOTS.accessory} size={size} />
    </div>
  );
}
