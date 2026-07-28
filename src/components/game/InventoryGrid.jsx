import React, { useState } from "react";
import { motion } from "framer-motion";
import CompactItemRow from "@/components/game/CompactItemRow";
import StatCompareBubble, { powerRating } from "@/components/game/StatCompareBubble";
import { staggerParent, staggerChild, btnPress } from "@/lib/juicyMotion";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { computeStardustValue } from "@/lib/gameData";

const EQUIPPABLE = ["weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module"];

// Shared inventory grid used by both the Inventory page and the Character page.
// Equipped gear lives in the dedicated Equipment section — this list is backpack only.
// Unequipped equippable items show a stat-compare bubble on hover.
export default function InventoryGrid({ items, onEquip, onSell, onUse, onLock, onBulkSell, characterClass }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const equipped = items.filter((i) => i.is_equipped);
  const unequipped = items.filter((i) => !i.is_equipped);

  const selectableItems = unequipped.filter((i) => !i.locked);
  const selectedItems = selectableItems.filter((i) => selected.includes(i.id));
  const bulkTotal = selectedItems.reduce((sum, i) => sum + computeStardustValue(i), 0);
  const junkCount = selectableItems.filter((i) => i.rarity === "common" || i.type === "material").length;
  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selectJunk = () => setSelected(selectableItems.filter((i) => i.rarity === "common" || i.type === "material").map((i) => i.id));
  const exitBulk = () => { setBulkMode(false); setSelected([]); };
  const doBulkSell = async () => {
    if (!selectedItems.length) return;
    await onBulkSell?.(selectedItems);
    exitBulk();
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
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
            const comparable = !bulkMode && EQUIPPABLE.includes(item.type);
            const isSelectable = bulkMode && !item.locked;
            const isSelected = selected.includes(item.id);
            const activeId = pinnedId || hoveredId;
            const isActive = comparable && activeId === item.id;
            const eqSlot = equipped.find((i) => i.type === item.type) || null;
            return (
              <motion.div
                key={item.id}
                variants={staggerChild}
                layout
                onMouseEnter={() => comparable && setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId((h) => (h === item.id ? null : h))}
                onClick={() => (isSelectable ? toggleSelect(item.id) : comparable && setPinnedId((p) => (p === item.id ? null : item.id)))}
              >
                <div className="relative">
                  <CompactItemRow item={item} onEquip={comparable ? onEquip : null} onSell={onSell} onUse={onUse} selectable={isSelectable} selected={isSelected} onToggleSelect={() => toggleSelect(item.id)} />
                  {comparable && (() => {
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
                  })()}
                  {isActive && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-[60]">
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
          <button onClick={selectJunk} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 transition-colors font-semibold">Select junk</button>
          <button onClick={() => setSelected([])} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          <span className="text-[11px] text-muted-foreground px-2">{selectedItems.length} selected · ✨{bulkTotal}</span>
          <button
            onClick={doBulkSell}
            disabled={!selectedItems.length}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-destructive/25 text-destructive border border-destructive/50 hover:bg-destructive/40 hover:animate-pulse disabled:opacity-40 disabled:cursor-not-allowed font-display font-bold tracking-wide transition-all"
          >
            Toss Selected
          </button>
        </div>
      )}

      {onBulkSell && (
        <div className="shrink-0 flex justify-center pt-1 border-t border-border/30">
          <motion.button
            {...btnPress}
            onClick={() => (bulkMode ? exitBulk() : setBulkMode(true))}
            className={`group relative inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-xl border-2 font-display font-bold text-sm tracking-wider transition-all ${
              bulkMode
                ? "border-destructive bg-destructive/20 text-destructive"
                : "border-rose-500/70 bg-rose-500/15 text-rose-300 hover:border-rose-400 hover:bg-rose-500/25 hover:text-rose-200 hover:animate-pulse hover:shadow-[0_0_22px_rgba(244,63,94,0.55)]"
            }`}
          >
            <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
            {bulkMode ? "EXIT TOSS MODE" : `TOSS JUNK${junkCount ? ` (${junkCount})` : ""}`}
          </motion.button>
        </div>
      )}
    </div>
  );
}
