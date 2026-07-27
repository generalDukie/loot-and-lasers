import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/gameClient";
import { computeStardustValue, RARITY_COLORS } from "@/lib/gameData";
import { getPendingItem, clearPendingItem, subscribePending } from "@/lib/inventoryCap";
import GearVisual from "@/components/game/GearVisual";
import { useToast } from "@/components/ui/use-toast";
import { Orbit, Loader2, AlertTriangle } from "lucide-react";

// Overlay shown when a loot pickup can't fit in the 10-slot inventory.
// The player must dissolve an item (the new loot OR an existing spare) into the
// void for stardust. Can be minimized — a flashing red/yellow bubble stays on
// screen until resolved. Equipped items are never offered for dissolution.
export default function InventoryFullModal({ character }) {
  const [pending, setPending] = useState(getPendingItem());
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [tossingId, setTossingId] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const { toast } = useToast();

  useEffect(() => subscribePending(setPending), []);

  // Reset minimized state when a new pending item arrives.
  useEffect(() => { if (pending) setMinimized(false); }, [pending]);

  useEffect(() => {
    if (!pending || !character) return;
    setLoadingItems(true);
    api.entities.Item.filter({ character_id: character.id })
      .then((list) => setItems(list || []))
      .finally(() => setLoadingItems(false));
  }, [pending, character]);

  if (!pending) return null;

  async function toss(item, isNew) {
    if (!character || tossingId) return;
    setTossingId(item.id || "new");
    try {
      if (isNew) {
        clearPendingItem();
        const value = computeStardustValue(item);
        const fresh = await api.entities.Character.get(character.id);
        await api.entities.Character.update(character.id, {
          stardust: (fresh.stardust || 0) + value,
        });
        setItems([]);
        toast({ title: `✨ Dissolved ${item.name}`, description: `+${value} stardust` });
        return;
      }
      const fresh = await api.entities.Character.get(character.id);
      const value = computeStardustValue(item);
      const update = { stardust: (fresh.stardust || 0) + value };
      if (item.is_equipped) {
        const eq = { ...(fresh.equipped_items || {}) };
        delete eq[item.type];
        update.equipped_items = eq;
      }
      await api.entities.Character.update(character.id, update);
      await api.entities.Item.delete(item.id);
      await api.entities.Item.create(pending);
      clearPendingItem();
      setItems([]);
      toast({
        title: `✨ Dissolved ${item.name}`,
        description: `+${value} stardust · ${pending.name} added to inventory.`,
      });
    } catch (e) {
      toast({ title: "Something went wrong", description: e?.message, variant: "destructive" });
    } finally {
      setTossingId(null);
    }
  }

  const pendingColor = RARITY_COLORS[pending.rarity] || "#9CA3AF";
  const spareItems = items.filter((it) => !it.is_equipped && !it.locked);

  // ── Minimized: flashing alert bubble ──
  if (minimized) {
    return (
      <motion.button
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={() => setMinimized(false)}
        className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-4 py-2 rounded-full border-2 border-amber-400 bg-card shadow-xl animate-pulse"
        style={{ animationDuration: "0.8s" }}
      >
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <span className="font-display font-bold text-xs text-amber-300">
          Inventory Full — tap to resolve
        </span>
      </motion.button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="painted-panel canvas-grain p-5 max-w-md w-full"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-display font-bold text-lg text-amber-300 glow-orange">Inventory Full</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Toss an item into the void to make room, or discard the new find.
              </p>
            </div>
            <button
              onClick={() => setMinimized(true)}
              className="text-[10px] px-2 py-1 rounded-lg bg-muted/30 hover:bg-muted/50 text-muted-foreground font-display font-semibold tracking-wide shrink-0"
            >
              Minimize
            </button>
          </div>

          {/* Pending item — waiting for room */}
          <div
            className="flex items-center gap-3 p-3 rounded-xl border mb-3"
            style={{ borderColor: pendingColor + "40", background: pendingColor + "08" }}
          >
            <GearVisual type={pending.type} rarity={pending.rarity} name={pending.name} emoji={pending.emoji} size={36} />
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold text-sm truncate" style={{ color: pendingColor }}>
                {pending.name}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">
                {pending.rarity} · {(pending.type || "").replace("_", " ")} · {computeStardustValue(pending)}✨ if dissolved
              </p>
            </div>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-display font-bold tracking-wide">
              NEW
            </span>
            <button
              onClick={() => toss(pending, true)}
              disabled={tossingId !== null}
              className="shrink-0 text-[10px] px-2.5 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent font-display font-bold tracking-wide disabled:opacity-40 flex items-center gap-1"
            >
              <Orbit className="w-3 h-3" /> Toss
            </button>
          </div>

          <p className="text-[10px] font-display font-semibold tracking-widest text-muted-foreground mb-2">
            OR DISSOLVE A SPARE
          </p>

          {loadingItems ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : spareItems.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground italic py-4">
              No spare items to dissolve. Toss the new find above.
            </p>
          ) : (
            <div className="max-h-[35vh] overflow-y-auto space-y-2 pr-1">
              {spareItems.map((item) => {
                const c = RARITY_COLORS[item.rarity] || "#9CA3AF";
                const val = computeStardustValue(item);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded-lg border bg-card/40"
                    style={{ borderColor: c + "30" }}
                  >
                    <GearVisual type={item.type} rarity={item.rarity} name={item.name} emoji={item.emoji} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-semibold text-xs truncate" style={{ color: c }}>
                        {item.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {item.rarity} · {(item.type || "").replace("_", " ")}
                      </p>
                    </div>
                    <span className="text-[10px] text-accent font-bold shrink-0">✨ {val}</span>
                    <button
                      onClick={() => toss(item, false)}
                      disabled={tossingId !== null}
                      className="shrink-0 text-[10px] px-2.5 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent font-display font-bold tracking-wide disabled:opacity-40 flex items-center gap-1"
                    >
                      <Orbit className="w-3 h-3" /> Toss
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {items.length > spareItems.length && (
            <p className="text-[9px] text-muted-foreground/60 italic mt-2 text-center">
              Equipped and locked items are excluded.
            </p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}