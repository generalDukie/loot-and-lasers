import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/api/gameClient";
import { computeStardustValue, RARITY_COLORS, STARDUST_COLOR, getInventoryCap } from "@/lib/gameData";
import {
  getPending,
  clearPendingItem,
  subscribePending,
  resolvePendingAfterFreeSlot,
} from "@/lib/inventoryCap";
import { prepareConsumableBuffs } from "@/hooks/useInventory";
import GearVisual from "@/components/game/GearVisual";
import GameplayOverlayPortal from "@/components/game/GameplayOverlayPortal";
import { useToast } from "@/components/ui/use-toast";
import { Orbit, Loader2, AlertTriangle, FlaskConical } from "lucide-react";
import StardustIcon, { STARDUST_GLYPH } from "@/components/game/StardustIcon";

function isStim(item) {
  return item?.type === "consumable" && !!item.consumable;
}

function toastForResolve(toast, result) {
  if (!result) return;
  if (result.kind === "loot" && result.item) {
    toast({ title: "📦 Item claimed!", description: `${result.item.name} added to inventory.` });
  } else if (result.kind === "unequip" && result.item) {
    toast({ title: "Unequipped", description: `${result.item.name} moved to your bag.` });
  } else if (result.kind === "overflow_cleared") {
    toast({ title: "Inventory clear", description: "Bag is within the 10-item limit." });
  }
}

// Overlay when bag pressure must be resolved (new loot, blocked unequip, or over-cap).
// Unequip / overflow cannot be dismissed — dissolve until the bag fits.
export default function InventoryFullModal({ character, onCharacterChange }) {
  const [pendingState, setPendingState] = useState(getPending());
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const { toast } = useToast();

  const mode = pendingState?.mode || null;
  const pendingItem = pendingState?.item || null;
  const mandatory = mode === "unequip" || mode === "overflow";

  useEffect(() => subscribePending(setPendingState), []);

  useEffect(() => {
    if (pendingState) setMinimized(false);
  }, [pendingState]);

  useEffect(() => {
    if (!pendingState || !character) return;
    setLoadingItems(true);
    api.entities.Item.filter({ character_id: character.id })
      .then((list) => setItems(list || []))
      .finally(() => setLoadingItems(false));
  }, [pendingState, character]);

  if (!pendingState) return null;

  async function refreshBag() {
    if (!character) return;
    const list = await api.entities.Item.filter({ character_id: character.id });
    setItems(list || []);
  }

  async function afterFreeSlot() {
    const result = await resolvePendingAfterFreeSlot(character);
    if (result?.patch) onCharacterChange?.(result.patch);
    toastForResolve(toast, result);
    if (getPending()) await refreshBag();
    else setItems([]);
  }

  async function toss(item, isFocus) {
    if (!character || busyId) return;
    setBusyId(item.id || "focus");
    try {
      if (mode === "loot" && isFocus) {
        clearPendingItem();
        const res = await api.functions.invoke("DissolvePendingLoot", { item });
        const value = res.stardust_gained ?? res.data?.stardust_gained ?? computeStardustValue(item);
        const patch = res.patch || res.data?.patch;
        if (patch) onCharacterChange?.(patch);
        setItems([]);
        toast({ title: `${STARDUST_GLYPH} Dissolved ${item.name}`, description: `+${value} stardust` });
        return;
      }

      if (mode === "unequip" && isFocus && item.id) {
        // Dissolve the equipped piece itself — frees nothing in bag, clears unequip pressure.
        const res = await api.functions.invoke("DissolveItem", { item_id: item.id });
        const value = res.stardust_gained ?? res.data?.stardust_gained ?? computeStardustValue(item);
        const patch = res.patch || res.data?.patch || {};
        onCharacterChange?.(patch);
        clearPendingItem();
        setItems([]);
        toast({ title: `${STARDUST_GLYPH} Dissolved ${item.name}`, description: `+${value} stardust` });
        return;
      }

      const res = await api.functions.invoke("DissolveItem", { item_id: item.id });
      const value = res.stardust_gained ?? res.data?.stardust_gained ?? computeStardustValue(item);
      const patch = res.patch || res.data?.patch;
      if (patch) onCharacterChange?.(patch);
      toast({ title: `${STARDUST_GLYPH} Dissolved ${item.name}`, description: `+${value} stardust` });
      await afterFreeSlot();
    } catch (e) {
      toast({ title: "Something went wrong", description: e?.message, variant: "destructive" });
      await refreshBag();
    } finally {
      setBusyId(null);
    }
  }

  async function useStim(item, isFocus) {
    if (!character || busyId || !isStim(item)) return;
    setBusyId(item.id || "focus-use");
    try {
      if (mode === "loot" && isFocus) {
        const fresh = await api.entities.Character.get(character.id);
        const prepared = prepareConsumableBuffs(fresh, item);
        if (!prepared.ok) {
          toast({ title: "Can't use", description: prepared.reason, variant: "destructive" });
          return;
        }
        await api.entities.Character.update(character.id, { active_buffs: prepared.buffs });
        onCharacterChange?.({ active_buffs: prepared.buffs });
        clearPendingItem();
        setItems([]);
        toast({ title: `🧪 Used ${item.name}`, description: "Buff applied — inventory pressure cleared." });
        return;
      }

      if (mode === "unequip" && isFocus) {
        toast({ title: "Can't use", description: "Unequip or dissolve this piece first.", variant: "destructive" });
        return;
      }

      await api.functions.invoke("UseConsumable", { item_id: item.id });
      toast({ title: `🧪 Used ${item.name}`, description: "Slot freed." });
      await afterFreeSlot();
    } catch (e) {
      toast({ title: "Something went wrong", description: e?.message, variant: "destructive" });
      await refreshBag();
    } finally {
      setBusyId(null);
    }
  }

  const pendingColor = RARITY_COLORS[pendingItem?.rarity] || "#9CA3AF";
  const spareItems = items.filter((it) => !it.is_equipped && !it.locked);
  const bagCount = items.filter((it) => !it.is_equipped).length;
  const cap = getInventoryCap(character);
  const busy = busyId !== null;

  const title =
    mode === "unequip" ? "Inventory Full — Unequip Blocked"
      : mode === "overflow" ? "Inventory Over Capacity"
        : "Inventory Full";
  const subtitle =
    mode === "unequip"
      ? `Bag is full (${bagCount}/${cap}). Dissolve a spare item to unequip, or dissolve the equipped piece.`
      : mode === "overflow"
        ? `You have ${bagCount} bag items (max ${cap}). Dissolve until you are at or under the limit.`
        : "Dissolve into the Void, or use a stim to free a slot.";

  if (minimized && !mandatory) {
    return (
      <GameplayOverlayPortal className="!pointer-events-none">
        <motion.button
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          onClick={() => setMinimized(false)}
          className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-4 py-2 rounded-full border-2 border-amber-400 bg-card shadow-xl animate-pulse"
          style={{ animationDuration: "0.8s" }}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span className="font-display font-bold text-xs text-amber-300">
            Inventory Full — tap to resolve
          </span>
        </motion.button>
      </GameplayOverlayPortal>
    );
  }

  return (
    <AnimatePresence>
      <GameplayOverlayPortal
        as={motion.div}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="painted-panel canvas-grain p-5 max-w-md w-full"
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-display font-bold text-lg text-amber-300 glow-orange">{title}</h2>
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            </div>
            {!mandatory && (
              <button
                onClick={() => setMinimized(true)}
                className="text-[10px] px-2 py-1 rounded-lg bg-muted/30 hover:bg-muted/50 text-muted-foreground font-display font-semibold tracking-wide shrink-0"
              >
                Minimize
              </button>
            )}
          </div>

          {pendingItem && mode !== "overflow" && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl border mb-3"
              style={{ borderColor: pendingColor + "40", background: pendingColor + "08" }}
            >
              <GearVisual
                type={pendingItem.type}
                rarity={pendingItem.rarity}
                name={pendingItem.name}
                baseName={pendingItem.base_name}
                level_requirement={pendingItem.level_requirement}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-sm truncate" style={{ color: pendingColor }}>
                  {pendingItem.name}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize inline-flex items-center gap-1">
                  {pendingItem.rarity} · {(pendingItem.type || "").replace("_", " ")} · {computeStardustValue(pendingItem)}
                  <StardustIcon className="w-2.5 h-2.5" glow={false} /> if dissolved
                </p>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-display font-bold tracking-wide">
                {mode === "unequip" ? "EQUIPPED" : "NEW"}
              </span>
              <div className="flex flex-col gap-1 shrink-0">
                {mode === "loot" && isStim(pendingItem) && (
                  <button
                    onClick={() => useStim(pendingItem, true)}
                    disabled={busy}
                    className="text-[10px] px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-display font-bold tracking-wide disabled:opacity-40 flex items-center gap-1"
                  >
                    <FlaskConical className="w-3 h-3" /> Use
                  </button>
                )}
                <button
                  onClick={() => toss(pendingItem, true)}
                  disabled={busy}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent font-display font-bold tracking-wide disabled:opacity-40 flex items-center gap-1"
                >
                  <Orbit className="w-3 h-3" /> Dissolve
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] font-display font-semibold tracking-widest text-muted-foreground mb-2">
            {mode === "overflow" ? "DISSOLVE UNTIL ≤ 10" : "OR FREE A SPARE SLOT"}
          </p>

          {loadingItems ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : spareItems.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground italic py-4">
              {mode === "unequip"
                ? "No spare items. Dissolve the equipped piece above."
                : mode === "overflow"
                  ? "No dissolvable bag items found. Unlock an item or contact support."
                  : `No spare items. Dissolve${isStim(pendingItem) ? " or use" : ""} the new find above.`}
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
                    <GearVisual
                      type={item.type}
                      rarity={item.rarity}
                      name={item.name}
                      baseName={item.base_name}
                      level_requirement={item.level_requirement}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-semibold text-xs truncate" style={{ color: c }}>
                        {item.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground capitalize">
                        {item.rarity} · {(item.type || "").replace("_", " ")}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold shrink-0 inline-flex items-center gap-1" style={{ color: STARDUST_COLOR }}>
                      <StardustIcon className="w-2.5 h-2.5" glow={false} /> {val}
                    </span>
                    <div className="flex flex-col gap-1 shrink-0">
                      {isStim(item) && mode !== "overflow" && (
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
              Locked items are excluded{mode === "overflow" ? "" : "; equipped items are excluded from the spare list"}.
            </p>
          )}
        </motion.div>
      </GameplayOverlayPortal>
    </AnimatePresence>
  );
}
