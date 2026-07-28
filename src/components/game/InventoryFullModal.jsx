import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/gameClient";
import { computeStardustValue, RARITY_COLORS, STARDUST_COLOR } from "@/lib/gameData";
import { getPendingItem, clearPendingItem, subscribePending } from "@/lib/inventoryCap";
import { prepareConsumableBuffs } from "@/hooks/useInventory";
import GearVisual from "@/components/game/GearVisual";
import { useToast } from "@/components/ui/use-toast";
import { Orbit, Loader2, AlertTriangle, FlaskConical } from "lucide-react";

function isStim(item) {
  return item?.type === "consumable" && !!item.consumable;
}

// Overlay shown when a loot pickup can't fit in the inventory.
// Resolve by tossing into the void for stardust, or using a stim to free a slot.
// Can be minimized — a flashing bubble stays until resolved.
// Equipped items are never offered for dissolution.
export default function InventoryFullModal({ character }) {
  const [pending, setPending] = useState(getPendingItem());
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [busyId, setBusyId] = useState(null);
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
    if (!character || busyId) return;
    setBusyId(item.id || "new");
    try {
      if (isNew) {
        // Pending item is not persisted — dissolve via server for stardust only.
        clearPendingItem();
        const res = await api.functions.invoke("DissolvePendingLoot", { item });
        const value = res.stardust_gained ?? res.data?.stardust_gained ?? computeStardustValue(item);
        setItems([]);
        toast({ title: `✨ Dissolved ${item.name}`, description: `+${value} stardust` });
        return;
      }
      const res = await api.functions.invoke("DissolveItem", { item_id: item.id });
      const value = res.stardust_gained ?? res.data?.stardust_gained ?? computeStardustValue(item);
      await api.functions.invoke("AcceptPendingLoot", { item: pending });
      clearPendingItem();
      setItems([]);
      toast({
        title: `✨ Dissolved ${item.name}`,
        description: `+${value} stardust · ${pending.name} added to inventory.`,
      });
    } catch (e) {
      toast({ title: "Something went wrong", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function useStim(item, isNew) {
    if (!character || busyId || !isStim(item)) return;
    setBusyId(item.id || "new-use");
    try {
      if (isNew) {
        // Pending stim is not in DB — apply buffs client-side then discard pending.
        const fresh = await api.entities.Character.get(character.id);
        const prepared = prepareConsumableBuffs(fresh, item);
        if (!prepared.ok) {
          toast({ title: "Can't use", description: prepared.reason, variant: "destructive" });
          return;
        }
        await api.entities.Character.update(character.id, { active_buffs: prepared.buffs });
        clearPendingItem();
        setItems([]);
        toast({ title: `🧪 Used ${item.name}`, description: "Buff applied — inventory pressure cleared." });
        return;
      }
      await api.functions.invoke("UseConsumable", { item_id: item.id });
      await api.functions.invoke("AcceptPendingLoot", { item: pending });
      clearPendingItem();
      setItems([]);
      toast({
        title: `🧪 Used ${item.name}`,
        description: `${pending.name} added to inventory.`,
      });
    } catch (e) {
      toast({ title: "Something went wrong", description: e?.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  const pendingColor = RARITY_COLORS[pending.rarity] || "#9CA3AF";
  const spareItems = items.filter((it) => !it.is_equipped && !it.locked);
  const busy = busyId !== null;

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
                Dissolve into the Void, or use a stim to free a slot.
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
            <GearVisual type={pending.type} rarity={pending.rarity} name={pending.name} baseName={pending.base_name} level_requirement={pending.level_requirement} size={36} />
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
            <div className="flex flex-col gap-1 shrink-0">
              {isStim(pending) && (
                <button
                  onClick={() => useStim(pending, true)}
                  disabled={busy}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-display font-bold tracking-wide disabled:opacity-40 flex items-center gap-1"
                >
                  <FlaskConical className="w-3 h-3" /> Use
                </button>
              )}
              <button
                onClick={() => toss(pending, true)}
                disabled={busy}
                className="text-[10px] px-2.5 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent font-display font-bold tracking-wide disabled:opacity-40 flex items-center gap-1"
              >
                <Orbit className="w-3 h-3" /> Dissolve
              </button>
            </div>
          </div>

          <p className="text-[10px] font-display font-semibold tracking-widest text-muted-foreground mb-2">
            OR FREE A SPARE SLOT
          </p>

          {loadingItems ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : spareItems.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground italic py-4">
              No spare items. Dissolve{isStim(pending) ? " or use" : ""} the new find above.
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
                    <GearVisual type={item.type} rarity={item.rarity} name={item.name} baseName={item.base_name} level_requirement={item.level_requirement} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-semibold text-xs truncate" style={{ color: c }}>
                        {item.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {item.rarity} · {(item.type || "").replace("_", " ")}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold shrink-0" style={{ color: STARDUST_COLOR }}>✨ {val}</span>
                    <div className="flex flex-col gap-1 shrink-0">
                      {isStim(item) && (
                        <button
                          onClick={() => useStim(item, false)}
                          disabled={busy}
                          className="text-[10px] px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-display font-bold tracking-wide disabled:opacity-40 flex items-center gap-1"
                        >
                          <FlaskConical className="w-3 h-3" /> Use
                        </button>
                      )}
                      <button
                        onClick={() => toss(item, false)}
                        disabled={busy}
                        className="text-[10px] px-2.5 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent font-display font-bold tracking-wide disabled:opacity-40 flex items-center gap-1"
                      >
                        <Orbit className="w-3 h-3" /> Dissolve
                      </button>
                    </div>
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
