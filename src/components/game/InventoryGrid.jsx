import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CompactItemRow from "@/components/game/CompactItemRow";
import StatCompareBubble, { powerRating } from "@/components/game/StatCompareBubble";
import { staggerParent, staggerChild, btnPress } from "@/lib/juicyMotion";
import { Filter, ArrowUp, ArrowDown } from "lucide-react";
import { gearTypeLabel, computeStardustValue } from "@/lib/gameData";

const TYPES = ["all", "weapon", "armor", "helmet", "boots", "legs", "neck", "accessory", "ship_module", "material", "consumable"];
const EQUIPPABLE = ["weapon", "armor", "helmet", "boots", "accessory", "ship_module"];

// Shared inventory grid used by both the Inventory page and the Character page.
// Unequipped equippable items show a stat-compare bubble on hover.
export default function InventoryGrid({ items, onEquip, onSell, onUse, onLock, onBulkSell, characterClass }) {
  const [filter, setFilter] = useState("all");
  const [hoveredId, setHoveredId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter);
  const equipped = filtered.filter((i) => i.is_equipped);
  const unequipped = filtered.filter((i) => !i.is_equipped);

  const selectableItems = unequipped.filter((i) => !i.locked);
  const selectedItems = selectableItems.filter((i) => selected.includes(i.id));
  const bulkTotal = selectedItems.reduce((sum, i) => sum + computeStardustValue(i), 0);
  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selectJunk = () => setSelected(selectableItems.filter((i) => i.rarity === "common" || i.type === "material").map((i) => i.id));
  const exitBulk = () => { setBulkMode(false); setSelected([]); };
  const doBulkSell = async () => {
    if (!selectedItems.length) return;
    await onBulkSell?.(selectedItems);
    exitBulk();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 items-center">
        {TYPES.map((t) => (
          <motion.button
            key={t}
            {...btnPress}
            onClick={() => setFilter(t)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium capitalize transition-colors ${
              filter === t
                ? "border-primary bg-primary/10 text-primary border-glow-cyan"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            {gearTypeLabel(t)}
          </motion.button>
        ))}
        {onBulkSell && (
          <motion.button
            {...btnPress}
            onClick={() => (bulkMode ? exitBulk() : setBulkMode(true))}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ml-auto ${
              bulkMode ? "border-destructive bg-destructive/10 text-destructive" : "border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            {bulkMode ? "Exit" : "Toss Junk"}
          </motion.button>
        )}
      </div>

      {bulkMode && (
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-border/50 bg-card/60">
          <button onClick={selectJunk} className="text-[11px] px-2 py-1 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 transition-colors">Select junk</button>
          <button onClick={() => setSelected([])} className="text-[11px] px-2 py-1 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-colors">Clear</button>
          <span className="text-[11px] text-muted-foreground ml-auto">{selectedItems.length} selected · ✨{bulkTotal}</span>
          <button onClick={doBulkSell} disabled={!selectedItems.length} className="text-[11px] px-2.5 py-1 rounded-lg bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors">Toss Selected</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-card/50 border border-border/50 rounded-2xl p-8 text-center painted-panel canvas-grain">
          <p className="text-sm text-muted-foreground">No items found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {equipped.length > 0 && (
            <div>
              <h3 className="text-xs font-display font-semibold text-muted-foreground tracking-wide mb-2 flex items-center gap-1">
                <Filter className="w-3 h-3" /> EQUIPPED
              </h3>
              <motion.div variants={staggerParent} initial="initial" animate="animate" className="grid gap-2 sm:grid-cols-2">
                {equipped.map((item) => (
                  <motion.div key={item.id} variants={staggerChild} layout>
                    <CompactItemRow item={item} onEquip={EQUIPPABLE.includes(item.type) ? onEquip : null} onSell={onSell} />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

          {unequipped.length > 0 && (
            <div>
              <h3 className="text-xs font-display font-semibold text-muted-foreground tracking-wide mb-2">BACKPACK</h3>
              <motion.div
                key={`bp-${filter}`}
                variants={staggerParent}
                initial="initial"
                animate="animate"
                className="grid gap-2 sm:grid-cols-2"
              >
                {unequipped.map((item) => {
                  const comparable = !bulkMode && EQUIPPABLE.includes(item.type);
                  const isSelectable = bulkMode && !item.locked;
                  const isSelected = selected.includes(item.id);
                  const activeId = pinnedId || hoveredId;
                  const isActive = comparable && activeId === item.id;
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
                          const eq = equipped.find((i) => i.type === item.type) || null;
                          if (!eq) {
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
                          const d = powerRating(item, characterClass) - powerRating(eq, characterClass);
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
                              equipped={equipped.find((i) => i.type === item.type) || null}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}