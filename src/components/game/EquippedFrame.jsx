import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { RARITY_COLORS, STAT_ICONS } from "@/lib/gameData";
import GearVisual from "@/components/game/GearVisual";
import StatCompareBubble from "@/components/game/StatCompareBubble";

// Equipped gear arranged as a 3x3 frame around the portrait (all 8 slots
// fill the perimeter, portrait sits in the centre):
//  weapon  helmet  neck
//  armor  portrait  ship_module
//  boots   legs   accessory
export const FRAME_SLOT_ORDER = [
  "weapon", "helmet", "neck", "armor", "ship_module", "boots", "legs", "accessory",
];

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

export function equipDroppableId(type) {
  return `equip:${type}`;
}

export function parseEquipDroppableId(id) {
  if (!id || !String(id).startsWith("equip:")) return null;
  return String(id).slice(6);
}

function useDesktopHover() {
  const [desktopHover, setDesktopHover] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setDesktopHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktopHover;
}

function HoverStatsPortal({ anchorRef, open, item, characterClass, onEquip, onLock, onClose, onKeepOpen }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !anchorRef.current) return undefined;
    const place = () => {
      const r = anchorRef.current.getBoundingClientRect();
      const pad = 8;
      const bubbleW = 288;
      let left = r.right + 10;
      if (left + bubbleW > window.innerWidth - pad) left = Math.max(pad, r.left - bubbleW - 10);
      let top = r.top;
      const approxH = 320;
      if (top + approxH > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - pad - approxH);
      }
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, item?.id]);

  if (!open || !item || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-[90] pointer-events-auto"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onKeepOpen}
      onMouseLeave={onClose}
    >
      <StatCompareBubble
        item={item}
        equipped={null}
        onEquip={onEquip}
        onLock={onLock}
        characterClass={characterClass}
      />
    </div>,
    document.body
  );
}

function SlotChip({
  item,
  slotType,
  size,
  showcase,
  interactive,
  isDraggingOver,
  showHoverStats,
  characterClass,
  onEquip,
  onLock,
}) {
  const slot = FRAME_SLOTS[slotType];
  const droppableId = equipDroppableId(slotType);
  const desktopHover = useDesktopHover();
  const [hoverOpen, setHoverOpen] = useState(false);
  const chipRef = useRef(null);
  const closeTimer = useRef(null);

  const openHover = () => {
    if (!showHoverStats || !item || !desktopHover) return;
    clearTimeout(closeTimer.current);
    setHoverOpen(true);
  };
  const keepHover = () => {
    clearTimeout(closeTimer.current);
    setHoverOpen(true);
  };
  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHoverOpen(false), 140);
  };
  const closeHover = () => {
    clearTimeout(closeTimer.current);
    setHoverOpen(false);
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const chipInner = item ? (
    <GearVisual
      type={item.type}
      rarity={item.rarity}
      name={item.name}
      baseName={item.base_name}
      level_requirement={item.level_requirement}
      size={size}
    />
  ) : (
    <span className={showcase ? "opacity-35" : "opacity-25"} style={{ fontSize: Math.max(12, size * 0.45) }}>
      {slot.icon}
    </span>
  );

  if (!interactive) {
    const color = item ? (RARITY_COLORS[item.rarity] || "#9CA3AF") : undefined;
    return (
      <>
        <div
          ref={chipRef}
          className={`rounded-lg border p-0.5 flex items-center justify-center transition-transform ${
            item
              ? `bg-card/60 hover:scale-110 hover:z-10 ${showcase ? "bg-card/80 backdrop-blur-sm" : ""}`
              : showcase
                ? "border-dashed border-border/35 bg-background/25"
                : "border-dashed border-border/25 bg-muted/5"
          }`}
          style={{
            borderColor: item ? color + "70" : undefined,
            boxShadow: item ? `0 0 ${showcase ? 12 : 8}px ${color}${showcase ? "55" : "40"}` : undefined,
            width: size + 6,
            height: size + 6,
          }}
          onMouseEnter={openHover}
          onMouseLeave={scheduleClose}
          onClick={() => {
            // Touch: tap toggles inspect
            if (!desktopHover && showHoverStats && item) {
              setHoverOpen((v) => !v);
            }
          }}
        >
          {chipInner}
        </div>
        <HoverStatsPortal
          anchorRef={chipRef}
          open={hoverOpen && !!item}
          item={item}
          characterClass={characterClass}
          onEquip={(it) => {
            onEquip?.(it);
            closeHover();
          }}
          onLock={onLock}
          onClose={scheduleClose}
          onKeepOpen={keepHover}
        />
      </>
    );
  }

  return (
    <>
      <Droppable droppableId={droppableId} isDropDisabled={false}>
        {(dropProvided, dropSnapshot) => (
          <div
            ref={(node) => {
              dropProvided.innerRef(node);
              chipRef.current = node;
            }}
            {...dropProvided.droppableProps}
            className={`rounded-lg border p-0.5 flex items-center justify-center transition-all ${
              item ? "bg-card/60 border-solid" : "border-dashed bg-muted/5"
            } ${
              dropSnapshot.isDraggingOver || isDraggingOver
                ? "border-primary/70 bg-primary/10 scale-105"
                : item
                  ? ""
                  : "border-border/25"
            }`}
            style={{
              width: size + 6,
              height: size + 6,
              borderColor: item ? (RARITY_COLORS[item.rarity] || "#9CA3AF") + "70" : undefined,
              boxShadow: item ? `0 0 8px ${(RARITY_COLORS[item.rarity] || "#9CA3AF")}40` : undefined,
            }}
            onMouseEnter={openHover}
            onMouseLeave={scheduleClose}
          >
            {item ? (
              <Draggable draggableId={item.id} index={0}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={`flex items-center justify-center cursor-grab active:cursor-grabbing ${
                      dragSnapshot.isDragging ? "opacity-90 scale-110 z-50" : "hover:scale-110"
                    }`}
                    style={dragProvided.draggableProps.style}
                  >
                    {chipInner}
                  </div>
                )}
              </Draggable>
            ) : (
              chipInner
            )}
            {dropProvided.placeholder}
          </div>
        )}
      </Droppable>
      <HoverStatsPortal
        anchorRef={chipRef}
        open={hoverOpen && !!item}
        item={item}
        characterClass={characterClass}
        onEquip={(it) => {
          onEquip?.(it);
          closeHover();
        }}
        onLock={onLock}
        onClose={scheduleClose}
        onKeepOpen={keepHover}
      />
    </>
  );
}

export default function EquippedFrame({
  equippedItems,
  children,
  size = 53,
  showcase = false,
  interactive = false,
  showHoverStats = false,
  characterClass,
  onEquip,
  onLock,
}) {
  const bySlot = {};
  (equippedItems || []).forEach((it) => { bySlot[it.type] = it; });
  const chipProps = {
    size,
    showcase,
    interactive,
    showHoverStats,
    characterClass,
    onEquip,
    onLock,
  };
  return (
    <div className={`grid grid-cols-3 items-center justify-items-center ${showcase ? "gap-2" : "gap-1.5"}`}>
      <SlotChip item={bySlot.weapon} slotType="weapon" {...chipProps} />
      <SlotChip item={bySlot.helmet} slotType="helmet" {...chipProps} />
      <SlotChip item={bySlot.neck} slotType="neck" {...chipProps} />
      <SlotChip item={bySlot.armor} slotType="armor" {...chipProps} />
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
      <SlotChip item={bySlot.ship_module} slotType="ship_module" {...chipProps} />
      <SlotChip item={bySlot.boots} slotType="boots" {...chipProps} />
      <SlotChip item={bySlot.legs} slotType="legs" {...chipProps} />
      <SlotChip item={bySlot.accessory} slotType="accessory" {...chipProps} />
    </div>
  );
}
