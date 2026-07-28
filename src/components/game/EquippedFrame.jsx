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

function SlotChip({ item, slot, size, showcase }) {
  if (item) {
    const color = RARITY_COLORS[item.rarity] || "#9CA3AF";
    const statStr = item.stats
      ? Object.entries(item.stats).filter(([, v]) => v > 0).map(([s, v]) => `${STAT_ICONS[s]}+${v}`).join(" ")
      : "";
    return (
      <div
        className={`rounded-lg border bg-card/60 p-0.5 flex items-center justify-center transition-transform hover:scale-110 hover:z-10 ${
          showcase ? "bg-card/80 backdrop-blur-sm" : ""
        }`}
        style={{ borderColor: color + "70", boxShadow: `0 0 ${showcase ? 12 : 8}px ${color}${showcase ? "55" : "40"}`, width: size + 6, height: size + 6 }}
        title={`${item.name}\n${item.rarity} ${item.type}\n${statStr}`}
      >
        <GearVisual type={item.type} rarity={item.rarity} name={item.name} emoji={item.emoji} size={size} />
      </div>
    );
  }
  return (
    <div
      className={`rounded-lg border border-dashed p-0.5 flex items-center justify-center ${
        showcase ? "border-border/35 bg-background/25" : "border-border/25 bg-muted/5"
      }`}
      style={{ width: size + 6, height: size + 6 }}
      title={`${slot.label} slot empty`}
    >
      <span className={showcase ? "opacity-35" : "opacity-25"} style={{ fontSize: Math.max(12, size * 0.45) }}>{slot.icon}</span>
    </div>
  );
}

export default function EquippedFrame({ equippedItems, children, size = 36, showcase = false }) {
  const bySlot = {};
  (equippedItems || []).forEach((it) => { bySlot[it.type] = it; });
  return (
    <div className={`grid grid-cols-3 items-center justify-items-center ${showcase ? "gap-2" : "gap-1.5"}`}>
      <SlotChip item={bySlot.weapon} slot={FRAME_SLOTS.weapon} size={size} showcase={showcase} />
      <SlotChip item={bySlot.helmet} slot={FRAME_SLOTS.helmet} size={size} showcase={showcase} />
      <SlotChip item={bySlot.neck} slot={FRAME_SLOTS.neck} size={size} showcase={showcase} />
      <SlotChip item={bySlot.armor} slot={FRAME_SLOTS.armor} size={size} showcase={showcase} />
      {showcase ? (
        <div className="relative flex items-center justify-center">
          <div
            className="absolute inset-[-6px] rounded-2xl pointer-events-none"
            style={{
              background: "radial-gradient(circle, hsl(190 90% 50% / 0.12) 0%, hsl(270 60% 55% / 0.08) 45%, transparent 70%)",
              boxShadow: "inset 0 0 24px hsl(190 90% 50% / 0.08), 0 0 20px hsl(270 60% 55% / 0.12)",
            }}
          />
          <div className="absolute inset-[-2px] rounded-xl border border-primary/25 pointer-events-none" />
          {children}
        </div>
      ) : (
        children
      )}
      <SlotChip item={bySlot.ship_module} slot={FRAME_SLOTS.ship_module} size={size} showcase={showcase} />
      <SlotChip item={bySlot.boots} slot={FRAME_SLOTS.boots} size={size} showcase={showcase} />
      <SlotChip item={bySlot.legs} slot={FRAME_SLOTS.legs} size={size} showcase={showcase} />
      <SlotChip item={bySlot.accessory} slot={FRAME_SLOTS.accessory} size={size} showcase={showcase} />
    </div>
  );
}
