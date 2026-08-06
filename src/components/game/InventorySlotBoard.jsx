import React, { useState, useEffect, useRef, useMemo } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Trash2, X } from "lucide-react";
import GearVisual from "@/components/game/GearVisual";
import StatCompareBubble from "@/components/game/StatCompareBubble";
import GearInspectPortal from "@/components/game/GearInspectPortal";
import NeonLockIcon from "@/components/game/NeonLockIcon";
import { GearAttributeChips } from "@/components/game/StatIcon";
import { RARITY_COLORS } from "@/lib/gameData";
import { EQUIPPABLE_TYPES, listDissolveJunk } from "@/lib/inventoryJunk";
import { sortItemsByOrder } from "@/lib/inventoryOrder";
import { portalWhileDragging } from "@/lib/dndPortal";
import { INVENTORY_DROPPABLE_ID } from "@/components/game/InventoryGrid";

const RARITY_LETTER = {
  common: "C",
  uncommon: "U",
  rare: "R",
  epic: "E",
  legendary: "L",
};

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
 * Compact backpack — small drag slots. Quality always visible; full info on hover.
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
  const hoverAnchorRef = useRef(null);
  const hoverCloseTimer = useRef(null);

  const clearHoverClose = () => {
    clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  };
  const scheduleHoverClose = () => {
    clearHoverClose();
    hoverCloseTimer.current = setTimeout(() => setHoveredId(null), 140);
  };
  useEffect(() => () => clearHoverClose(), []);

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
  const hoveredItem = desktopHover && hoveredId
    ? unequipped.find((i) => i.id === hoveredId)
    : null;
  const hoveredEq = hoveredItem
    ? equipped.find((i) => i.type === hoveredItem.type) || null
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
    <div ref={rootRef} className="flex flex-col gap-1.5">
      {pinnedItem && (
        <div className="shrink-0 relative z-30">
          <button
            type="button"
            onClick={() => setPinnedId(null)}
            className="absolute -top-1 -right-1 z-10 p-1 rounded-full bg-muted/80 border border-border/50 text-muted-foreground"
            aria-label="Close details"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <StatCompareBubble
            item={pinnedItem}
            equipped={pinnedEq}
            onEquip={(it) => { onEquip?.(it); setPinnedId(null); }}
            onSell={(it) => { onSell?.(it); setPinnedId(null); }}
            onUse={(it) => { onUse?.(it); setPinnedId(null); }}
            onLock={onLock}
            characterClass={characterClass}
            className="!w-full max-w-none"
          />
        </div>
      )}

      <div
        className="rounded-xl border border-amber-900/40 p-2"
        style={{
          background: `
            linear-gradient(165deg, hsl(28 28% 14% / 0.95), hsl(24 22% 9% / 0.98)),
            repeating-linear-gradient(90deg, transparent, transparent 11px, hsl(30 20% 40% / 0.04) 11px, hsl(30 20% 40% / 0.04) 12px)
          `,
          boxShadow: "inset 0 1px 0 hsl(35 40% 55% / 0.12), inset 0 -8px 18px hsl(20 40% 4% / 0.35)",
        }}
      >
        <Droppable droppableId={INVENTORY_DROPPABLE_ID} isDropDisabled={!dragEnabled}>
          {(dropProvided, dropSnapshot) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className={`grid grid-cols-5 gap-1.5 transition-colors rounded-lg ${
                dropSnapshot.isDraggingOver ? "bg-primary/10 ring-1 ring-primary/35" : ""
              }`}
            >
              {slots.map((item, slotIndex) => {
                if (!item) {
                  return (
                    <div
                      key={`empty-${slotIndex}`}
                      className="aspect-square rounded-md border border-dashed border-amber-800/35 bg-black/25"
                      style={{ boxShadow: "inset 0 2px 4px hsl(20 40% 2% / 0.55)" }}
                    />
                  );
                }

                const dragIndex = unequipped.findIndex((i) => i.id === item.id);
                const color = RARITY_COLORS[item.rarity] || "#9CA3AF";
                const comparable = EQUIPPABLE_TYPES.includes(item.type);
                const isPinned = !desktopHover && pinnedId === item.id;

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
                          onMouseEnter={(e) => {
                            if (desktopHover && !dragSnapshot.isDragging) {
                              clearHoverClose();
                              hoverAnchorRef.current = e.currentTarget;
                              setHoveredId(item.id);
                            }
                          }}
                          onMouseLeave={() => {
                            if (desktopHover) scheduleHoverClose();
                          }}
                          onClick={() => {
                            if (dragSnapshot.isDragging) return;
                            if (!desktopHover) {
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
                          title={comparable ? "Double-click to equip · drag to rearrange" : "Hover for details · drag to rearrange"}
                          className={`relative aspect-square rounded-md border flex flex-col transition-all select-none overflow-hidden ${
                            isPinned ? "ring-1 ring-primary/60" : ""
                          } ${
                            dragSnapshot.isDragging
                              ? "z-[9999] shadow-[0_10px_28px_rgba(0,0,0,0.55)] ring-2 ring-primary/50 bg-card scale-110 cursor-grabbing"
                              : dragEnabled
                                ? "cursor-grab active:cursor-grabbing hover:brightness-110"
                                : ""
                          }`}
                          style={{
                            ...dragProvided.draggableProps.style,
                            borderColor: `${color}99`,
                            background: `linear-gradient(160deg, ${color}22, hsl(222 22% 8% / 0.9))`,
                            boxShadow: dragSnapshot.isDragging
                              ? undefined
                              : `inset 0 1px 0 ${color}33, 0 0 8px ${color}30`,
                            ...(dragSnapshot.isDragging ? { zIndex: 9999 } : null),
                          }}
                        >
                          {/* Name band — top ~22% of the tile */}
                          <div className="relative z-10 h-[22%] min-h-0 w-full px-1 pt-1 flex items-start justify-center pointer-events-none">
                            <p
                              className="w-full text-center font-display font-bold leading-[1.1] text-[11px] sm:text-[12px] line-clamp-2 break-words"
                              style={{
                                color,
                                textShadow: "0 1px 2px hsl(222 22% 4% / 0.95)",
                              }}
                              title={item.name}
                            >
                              {item.name}
                            </p>
                          </div>
                          {/* Icon — optically centered in the remaining pane */}
                          <div className="relative z-0 flex-1 min-h-0 w-full flex items-center justify-center">
                            <GearVisual
                              type={item.type}
                              rarity={item.rarity}
                              name={item.name}
                              baseName={item.base_name}
                              level_requirement={item.level_requirement}
                              size={36}
                              static
                            />
                          </div>
                          {/* Rolled attributes — contained in the tile footer */}
                          <div className="relative z-10 w-full min-h-0 max-h-[38%] px-0.5 pb-3.5 overflow-hidden pointer-events-none">
                            <GearAttributeChips
                              stats={item.stats}
                              presentation="itemPane"
                              max={4}
                              className="justify-center !gap-x-1 !gap-y-0.5"
                            />
                          </div>
                          {/* Quality always visible */}
                          <span
                            className="absolute bottom-0.5 right-0.5 z-10 text-[7px] font-display font-black leading-none px-0.5 rounded-sm"
                            style={{
                              color,
                              background: "hsl(222 22% 6% / 0.9)",
                              textShadow: `0 0 6px ${color}`,
                            }}
                          >
                            {RARITY_LETTER[item.rarity] || "?"}
                          </span>
                          {item.locked && (
                            <span
                              className="absolute top-1 right-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-sm"
                              style={{ background: "hsl(222 22% 6% / 0.9)" }}
                              title="Locked"
                            >
                              <NeonLockIcon className="w-2.5 h-2.5" />
                            </span>
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
      </div>

      {hoveredItem && (
        <GearInspectPortal
          anchorRef={hoverAnchorRef}
          open
          onClose={scheduleHoverClose}
          onKeepOpen={() => {
            clearHoverClose();
            setHoveredId(hoveredItem.id);
          }}
        >
          <StatCompareBubble
            item={hoveredItem}
            equipped={hoveredEq}
            onEquip={onEquip}
            onSell={onSell}
            onUse={onUse}
            onLock={onLock}
            characterClass={characterClass}
          />
        </GearInspectPortal>
      )}

      {onBulkSell && (
        <div className="shrink-0 flex items-center justify-end">
          <button
            type="button"
            onClick={dissolveJunk}
            disabled={!junkCount || busyJunk}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-300 text-[9px] font-display font-bold tracking-wide hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-2.5 h-2.5" />
            {busyJunk ? "…" : `Junk${junkCount ? ` ${junkCount}` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
