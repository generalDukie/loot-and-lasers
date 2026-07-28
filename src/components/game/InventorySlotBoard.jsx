import React, { useState, useEffect, useRef, useMemo } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Trash2, X, Package } from "lucide-react";
import GearVisual from "@/components/game/GearVisual";
import StatCompareBubble, { powerRating } from "@/components/game/StatCompareBubble";
import { RARITY_COLORS } from "@/lib/gameData";
import { EQUIPPABLE_TYPES, listDissolveJunk } from "@/lib/inventoryJunk";
import { sortItemsByOrder } from "@/lib/inventoryOrder";
import { portalWhileDragging } from "@/lib/dndPortal";
import { INVENTORY_DROPPABLE_ID } from "@/components/game/InventoryGrid";

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

/**
 * Fixed bag of large button-style slots under the hero portrait.
 * Fills empty slots up to `slotCount` (default 10).
 */
export default function InventorySlotBoard({
  items,
  bagOrder,
  slotCount = 10,
  onEquip,
  onSell,
  onUse,
  onLock,
  onBulkSell,
  characterClass,
  dragEnabled = true,
}) {
  const desktopHover = useDesktopHover();
  const [hoveredId, setHoveredId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [busyJunk, setBusyJunk] = useState(false);
  const rootRef = useRef(null);

  const equipped = items.filter((i) => i.is_equipped);
  const unequipped = useMemo(
    () => sortItemsByOrder(items.filter((i) => !i.is_equipped), bagOrder),
    [items, bagOrder],
  );
  const slots = useMemo(() => {
    const n = Math.max(1, Math.floor(slotCount) || 10);
    const filled = unequipped.slice(0, n);
    const empty = Math.max(0, n - filled.length);
    return [...filled, ...Array.from({ length: empty }, () => null)];
  }, [unequipped, slotCount]);

  const junkItems = listDissolveJunk(items, characterClass);
  const junkCount = junkItems.length;

  useEffect(() => {
    if (desktopHover) {
      setPinnedId(null);
      setHoveredId(null);
    }
  }, [desktopHover]);

  const pinnedItem = !desktopHover && pinnedId
    ? unequipped.find((i) => i.id === pinnedId)
    : null;
  const pinnedEq = pinnedItem
    ? equipped.find((i) => i.type === pinnedItem.type) || null
    : null;

  const dissolveJunk = async () => {
    if (!junkCount || busyJunk || !onBulkSell) return;
    setBusyJunk(true);
    try {
      await onBulkSell(junkItems);
      setPinnedId(null);
    } finally {
      setBusyJunk(false);
    }
  };

  return (
    <div ref={rootRef} className="flex flex-col h-full min-h-0 gap-2">
      {pinnedItem && EQUIPPABLE_TYPES.includes(pinnedItem.type) && (
        <div className="shrink-0 relative z-30">
          <button
            type="button"
            onClick={() => setPinnedId(null)}
            className="absolute -top-1 -right-1 z-10 p-1 rounded-full bg-muted/80 border border-border/50 text-muted-foreground"
            aria-label="Close compare"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <StatCompareBubble
            item={pinnedItem}
            equipped={pinnedEq}
            onEquip={(it) => { onEquip?.(it); setPinnedId(null); }}
            onSell={(it) => { onSell?.(it); setPinnedId(null); }}
            onLock={onLock}
            characterClass={characterClass}
            className="!w-full max-w-none"
          />
        </div>
      )}

      <Droppable droppableId={INVENTORY_DROPPABLE_ID} isDropDisabled={!dragEnabled}>
        {(dropProvided, dropSnapshot) => (
          <div
            ref={dropProvided.innerRef}
            {...dropProvided.droppableProps}
            className={`flex-1 min-h-0 grid grid-cols-5 grid-rows-2 gap-2 p-1 rounded-xl transition-colors ${
              dropSnapshot.isDraggingOver ? "bg-primary/10 ring-1 ring-primary/40" : ""
            }`}
          >
            {slots.map((item, slotIndex) => {
              if (!item) {
                return (
                  <div
                    key={`empty-${slotIndex}`}
                    className="min-h-0 rounded-xl border border-dashed border-border/35 bg-muted/5 flex flex-col items-center justify-center gap-1 text-muted-foreground/40"
                  >
                    <Package className="w-5 h-5 opacity-50" />
                    <span className="text-[8px] font-display tracking-wider uppercase">Empty</span>
                  </div>
                );
              }

              const dragIndex = unequipped.findIndex((i) => i.id === item.id);
              const color = RARITY_COLORS[item.rarity] || "#9CA3AF";
              const comparable = EQUIPPABLE_TYPES.includes(item.type);
              const eqSlot = equipped.find((i) => i.type === item.type) || null;
              const showHover = desktopHover && comparable && hoveredId === item.id && !dropSnapshot.isDraggingOver;
              const isPinned = !desktopHover && pinnedId === item.id;
              const powerDelta = comparable && eqSlot
                ? powerRating(item, characterClass) - powerRating(eqSlot, characterClass)
                : comparable && !eqSlot ? 1 : 0;

              return (
                <Draggable
                  key={item.id}
                  draggableId={item.id}
                  index={dragIndex < 0 ? slotIndex : dragIndex}
                  isDragDisabled={!dragEnabled}
                >
                  {(dragProvided, dragSnapshot) => {
                    const node = (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...(dragEnabled ? dragProvided.dragHandleProps : {})}
                        onMouseEnter={() => {
                          if (desktopHover && comparable && !dragSnapshot.isDragging) setHoveredId(item.id);
                        }}
                        onMouseLeave={() => {
                          if (desktopHover) setHoveredId((h) => (h === item.id ? null : h));
                        }}
                        onClick={() => {
                          if (dragSnapshot.isDragging) return;
                          if (!desktopHover && comparable) {
                            setPinnedId((p) => (p === item.id ? null : item.id));
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (dragSnapshot.isDragging || !comparable || !onEquip) return;
                          e.preventDefault();
                          e.stopPropagation();
                          onEquip(item);
                          setPinnedId(null);
                          setHoveredId(null);
                        }}
                        title={comparable ? "Double-click to equip" : item.type === "consumable" ? "Stim" : item.name}
                        className={`relative min-h-0 rounded-xl border flex flex-col items-center justify-center gap-1 px-1.5 py-2 transition-all select-none ${
                          isPinned ? "ring-1 ring-primary/60" : ""
                        } ${
                          dragSnapshot.isDragging
                            ? "z-[9999] shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-2 ring-primary/50 bg-card scale-105 cursor-grabbing"
                            : dragEnabled
                              ? "cursor-grab active:cursor-grabbing hover:bg-card/90 hover:scale-[1.02]"
                              : "hover:bg-card/80"
                        } bg-card/70`}
                        style={{
                          ...dragProvided.draggableProps.style,
                          borderColor: `${color}66`,
                          boxShadow: dragSnapshot.isDragging ? undefined : `0 0 12px ${color}28`,
                          ...(dragSnapshot.isDragging ? { zIndex: 9999 } : null),
                        }}
                      >
                        {powerDelta !== 0 && comparable && (
                          <span
                            className={`absolute top-1 left-1 text-[8px] font-bold px-1 rounded ${
                              powerDelta > 0 ? "text-green-400 bg-green-500/20" : "text-red-400 bg-red-500/20"
                            }`}
                          >
                            {powerDelta > 0 ? "▲" : "▼"}
                          </span>
                        )}
                        <GearVisual
                          type={item.type}
                          rarity={item.rarity}
                          name={item.name}
                          baseName={item.base_name}
                          level_requirement={item.level_requirement}
                          size={40}
                        />
                        <p className="text-[9px] font-display font-semibold text-center leading-tight line-clamp-2 w-full px-0.5" style={{ color }}>
                          {item.name}
                        </p>
                        <p className="text-[8px] text-muted-foreground capitalize leading-none">{item.rarity}</p>
                        {showHover && !dragSnapshot.isDragging && (
                          <div
                            className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-[60] pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <StatCompareBubble
                              item={item}
                              equipped={eqSlot}
                              onEquip={onEquip}
                              onSell={onSell}
                              onLock={onLock}
                              characterClass={characterClass}
                            />
                          </div>
                        )}
                      </div>
                    );
                    return portalWhileDragging(dragProvided.draggableProps.style, node);
                  }}
                </Draggable>
              );
            })}
            {dropProvided.placeholder}
          </div>
        )}
      </Droppable>

      {onBulkSell && (
        <div className="shrink-0 flex items-center justify-center pt-1 border-t border-border/30">
          <button
            type="button"
            onClick={dissolveJunk}
            disabled={!junkCount || busyJunk}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/50 bg-rose-500/10 text-rose-300 text-[10px] font-display font-bold tracking-wide hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3 h-3" />
            {busyJunk ? "Dissolving…" : `Dissolve Junk${junkCount ? ` (${junkCount})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
