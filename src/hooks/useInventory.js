import React, { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/api/gameClient";
import { prepareConsumableBuffs } from "@/lib/gameData";
import { enforceInventoryCap, setPendingUnequip, tryClaimPendingIfSpaceAvailable, getPending } from "@/lib/inventoryCap";
import { EQUIPPABLE_TYPES } from "@/lib/inventoryJunk";

export { prepareConsumableBuffs } from "@/lib/gameData";

// Shared inventory logic: loads items, handles equip/unequip and sell,
// and reports character patches (equipped_items / stardust) back to the parent.
export function useInventory(character, onCharacterChange) {
  const [items, setItems] = useState([]);

  // Mirror of active_buffs updated synchronously on each stim use, so rapid
  // consecutive uses see the latest buff state before React re-renders.
  const buffsRef = useRef(null);
  useEffect(() => { buffsRef.current = character?.active_buffs ?? null; }, [character?.active_buffs]);

  const load = useCallback(async () => {
    if (!character) return;
    try {
      const all = await api.entities.Item.filter({ character_id: character.id });
      // Heal stims/materials that were "equipped" by the old backpack Equip button.
      const stray = (all || []).filter((i) => i.is_equipped && !EQUIPPABLE_TYPES.includes(i.type));
      if (stray.length) {
        for (const s of stray) {
          try {
            await api.functions.invoke("UnequipItem", { item_id: s.id });
          } catch { /* best-effort */ }
          s.is_equipped = false;
        }
        const refreshed = await api.entities.Item.filter({ character_id: character.id });
        setItems(refreshed || all || []);
      } else {
        setItems(all || []);
      }
      await enforceInventoryCap(character);
    } catch (e) {
      // Rate-limited or transient — keep the last-known inventory rather than
      // throwing up to the page and leaving it stuck on a loading spinner.
      if (!/rate limit/i.test(e?.message || String(e))) console.warn("Inventory load failed", e);
    }
  }, [character, onCharacterChange]);

  // Equip / unequ via Node EquipItem / UnequipItem (atomic + attribute sheet).
  const equip = useCallback(async (item) => {
    if (!character) return;
    if (!EQUIPPABLE_TYPES.includes(item?.type)) return;
    const snapshot = items;
    const wasEquipped = !!item.is_equipped;

    try {
      const fn = wasEquipped ? "UnequipItem" : "EquipItem";
      const res = await api.functions.invoke(fn, { item_id: item.id });
      const body = res?.data || res || {};
      if (Array.isArray(body.items)) {
        setItems(body.items);
      } else {
        await load();
      }
      if (body.character) {
        onCharacterChange?.(body.character);
      } else if (body.equipped_map) {
        onCharacterChange?.({ equipped_items: body.equipped_map });
      }
    } catch (e) {
      setItems(snapshot);
      onCharacterChange?.({ equipped_items: character.equipped_items || {} });
      if (wasEquipped && /inventory full/i.test(e?.message || "")) {
        setPendingUnequip(item);
        return;
      }
      throw e;
    }
  }, [character, items, onCharacterChange, load]);

  const sell = useCallback(async (item) => {
    if (!character) return;
    let patch = {};
    try {
      const res = await api.functions.invoke("DissolveItem", { item_id: item.id });
      patch = res.patch || res.data?.patch || {};
      onCharacterChange?.(patch);
      await load();
    } catch (e) {
      await load();
      throw e;
    }
    // Claim is best-effort — never treat a claim failure as a dissolve failure.
    // Do not auto-claim pending loot: that refills the slot and looks like the
    // dissolved item "became" the waiting drop. Unequip / overflow still resolve.
    try {
      const mode = getPending()?.mode;
      if (mode && mode !== "loot") {
        await tryClaimPendingIfSpaceAvailable({ ...character, ...patch });
      }
    } catch {
      /* InventoryFullModal / hydrate will surface claim issues */
    }
  }, [character, load, onCharacterChange]);

  const useConsumable = useCallback(async (item) => {
    if (!character) return { ok: false };
    // Client pre-check for friendly toast messages; server remains authoritative.
    const prepared = prepareConsumableBuffs(character, item, buffsRef.current);
    if (!prepared.ok) return prepared;
    try {
      const res = await api.functions.invoke("UseConsumable", { item_id: item.id });
      const patch = res.patch || res.data?.patch || {};
      if (patch.active_buffs) buffsRef.current = patch.active_buffs;
      onCharacterChange?.(patch);
      await load();
      try {
        const mode = getPending()?.mode;
        if (mode && mode !== "loot") {
          await tryClaimPendingIfSpaceAvailable({ ...character, ...patch });
        }
      } catch { /* claim is best-effort after stim use */ }
      return { ok: true };
    } catch (e) {
      await load();
      return { ok: false, reason: e?.message || "Failed to use stim." };
    }
  }, [character, load, onCharacterChange]);

  const toggleLock = useCallback(async (item) => {
    if (!character) return;
    await api.entities.Item.update(item.id, { locked: !item.locked });
    await load();
  }, [character, load]);

  const bulkSell = useCallback(async (itemList) => {
    if (!character || !itemList?.length) return 0;
    let gained = 0;
    let patch = {};
    try {
      const res = await api.functions.invoke("DissolveJunk", {
        item_ids: itemList.map((i) => i.id),
      });
      patch = res.patch || res.data?.patch || {};
      gained = res.stardust_gained ?? res.data?.stardust_gained ?? 0;
      onCharacterChange?.(patch);
      await load();
    } catch (e) {
      await load();
      throw e;
    }
    try {
      const mode = getPending()?.mode;
      if (mode && mode !== "loot") {
        await tryClaimPendingIfSpaceAvailable({ ...character, ...patch });
      }
    } catch { /* claim is best-effort after junk dissolve */ }
    return gained;
  }, [character, load, onCharacterChange]);

  return { items, load, equip, sell, bulkSell, useConsumable, toggleLock };
}
