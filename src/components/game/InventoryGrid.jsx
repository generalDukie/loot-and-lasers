import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import CompactItemRow from "@/components/game/CompactItemRow";
import StatCompareBubble, { powerRating } from "@/components/game/StatCompareBubble";
import { staggerParent, staggerChild, btnPress } from "@/lib/juicyMotion";
import { ArrowUp, ArrowDown, Trash2, X } from "lucide-react";
import { computeStardustValue } from "@/lib/gameData";
import { EQUIPPABLE_TYPES, listDissolveJunk } from "@/lib/inventoryJunk";

/** True when the device can reliably hover (mouse/trackpad desktop). */
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

function UpgradeBadge({ item, eqSlot, characterClass }) {
  if (!eqSlot) {
    return (
      <div
        className="absolute top-0.5 left-0.5 z-20 flex items-center justify-center w-5 h-5 rounded-full animate-pulse bg-green-500/25 text-green-400"
        style={{ boxShadow: "0 0 10px #22c55eaa" }}
        title="Upgrade — empty slot, pure gain"
      >
        <ArrowUp className="w-3 h-3" />
      </div>
    );
  }
  const d = powerRating(item, characterClass) - powerRating(eqSlot, characterClass);
  if (d === 0) return null;
  const better = d > 0;
  return (
    <div
      className={`absolute top-0.5 left-0.5 z-20 flex items-center justify-center w-5 h-5 rounded-full animate-pulse ${better ? "bg-green-500/25 text-green-400" : "bg-red-500/25 text-red-400"}`}
      style={{ boxShadow: `0 0 10px ${better ? "#22c55e" : "#ef4444"}aa` }}
      title={better ? "Upgrade — better than equipped" : "Downgrade — worse than equipped"}
    >
      {better ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
    </div>
  );
}

// Shared inventory grid. Desktop: hover compare. Mobile: tap compare panel.
// Dissolve Junk one-clicks unequippables + common gear worse than equipped.
export default function InventoryGrid({ items, onEquip, onSell, onUse, onLock, onBulkSell, characterClass }) {
  const desktopHover = useDesktopHover();
  const [hoveredId, setHoveredId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [busyJunk, setBusyJunk] = useState(false);
  const rootRef = useRef(null);
  const equipped = items.filter((i) => i.is_equipped);
  const unequipped = items.filter((i) => !i.is_equipped);

  const selectableItems = unequipped.filter((i) => !i.locked);
  const selectedItems = selectableItems.filter((i) => selected.includes(i.id));
  const bulkTotal = selectedItems.reduce((sum, i) => sum + computeStardustValue(i), 0);
  const junkItems = listDissolveJunk(items, characterClass);
  const junkCount = junkItems.length;
  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const exitBulk = () => { setBulkMode(false); setSelected([]); };
  const doBulkSell = async () => {
    if (!selectedItems.length) return;
    await onBulkSell?.(selectedItems);
    exitBulk();
  };
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

  const wrapAction = (fn) => (item) => {
    fn?.(item);
    if (!desktopHover) setPinnedId(null);
  };

  return (
    <div ref={rootRef} className="flex flex-col h-full min-h-0 gap-3">
      {pinnedItem && EQUIPPABLE_TYPES.includes(pinnedItem.type) && !bulkMode && (
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
            onEquip={wrapAction(onEquip)}
            onSell={wrapAction(onSell)}
            onLock={onLock}
            characterClass={characterClass}
            className="!w-full max-w-none"
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {unequipped.length === 0 ? (
          <div className="bg-card/50 border border-border/50 rounded-2xl p-8 text-center painted-panel canvas-grain">
            <p className="text-sm text-muted-foreground">No items in backpack.</p>
          </div>
        ) : (
          <motion.div
            variants={staggerParent}
            initial="initial"
            animate="animate"
            className="grid gap-2 sm:grid-cols-2 pb-1"
          >
            {unequipped.map((item) => {
              const comparable = !bulkMode && EQUIPPABLE_TYPES.includes(item.type);
              const isSelectable = bulkMode && !item.locked;
              const isSelected = selected.includes(item.id);
              const showHoverBubble = desktopHover && comparable && hoveredId === item.id;
              const isPinned = !desktopHover && pinnedId === item.id;
              const eqSlot = equipped.find((i) => i.type === item.type) || null;
              return (
                <motion.div
                  key={item.id}
                  variants={staggerChild}
                  layout
                  onMouseEnter={() => {
                    if (desktopHover && comparable) setHoveredId(item.id);
                  }}
                  onMouseLeave={() => {
                    if (desktopHover) setHoveredId((h) => (h === item.id ? null : h));
                  }}
                  onClick={() => {
                    if (isSelectable) {
                      toggleSelect(item.id);
                      return;
                    }
                    if (!desktopHover && comparable) {
                      setPinnedId((p) => (p === item.id ? null : item.id));
                    }
                  }}
                  className={isPinned ? "ring-1 ring-primary/60 rounded-lg" : undefined}
                >
                  <div className="relative">
                    <CompactItemRow
                      item={item}
                      onEquip={comparable ? onEquip : null}
                      onSell={onSell}
                      onUse={onUse}
                      selectable={isSelectable}
                      selected={isSelected}
                      onToggleSelect={() => toggleSelect(item.id)}
                    />
                    {comparable && <UpgradeBadge item={item} eqSlot={eqSlot} characterClass={characterClass} />}
                    {showHoverBubble && (
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
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {bulkMode && (
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-2 p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/5">
          <button onClick={() => setSelected(junkItems.map((i) => i.id))} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 transition-colors font-semibold">Select junk</button>
          <button onClick={() => setSelected([])} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          <span className="text-[11px] text-muted-foreground px-2">{selectedItems.length} selected · ✨{bulkTotal}</span>
          <button
            onClick={doBulkSell}
            disabled={!selectedItems.length}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-destructive/25 text-destructive border border-destructive/50 hover:bg-destructive/40 hover:animate-pulse disabled:opacity-40 disabled:cursor-not-allowed font-display font-bold tracking-wide transition-all"
          >
            Dissolve Selected
          </button>
          <button onClick={exitBulk} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        </div>
      )}

      {onBulkSell && !bulkMode && (
        <div className="shrink-0 flex flex-col items-center gap-1.5 pt-1 border-t border-border/30">
          <motion.button
            {...btnPress}
            type="button"
            onClick={dissolveJunk}
            disabled={!junkCount || busyJunk}
            title="Dissolves materials/consumables and common gear worse than equipped"
            className="group relative inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-xl border-2 font-display font-bold text-sm tracking-wider transition-all border-rose-500/70 bg-rose-500/15 text-rose-300 hover:border-rose-400 hover:bg-rose-500/25 hover:text-rose-200 hover:animate-pulse hover:shadow-[0_0_22px_rgba(244,63,94,0.55)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:animate-none disabled:hover:shadow-none"
          >
            <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
            {busyJunk ? "DISSOLVING…" : `DISSOLVE JUNK${junkCount ? ` (${junkCount})` : ""}`}
          </motion.button>
          <button
            type="button"
            onClick={() => setBulkMode(true)}
            className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Select items instead
          </button>
        </div>
      )}
    </div>
  );
}
