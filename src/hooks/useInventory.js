import React, { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/api/gameClient";
import { prepareConsumableBuffs, getInventoryCap } from "@/lib/gameData";
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
        const eq = { ...(character.equipped_items || {}) };
        let eqDirty = false;
        for (const s of stray) {
          try {
            await api.entities.Item.update(s.id, { is_equipped: false });
          } catch { /* best-effort */ }
          s.is_equipped = false;
          if (eq[s.type] === s.id) {
            delete eq[s.type];
            eqDirty = true;
          }
        }
        if (eqDirty) {
          try {
            await api.entities.Character.update(character.id, { equipped_items: eq });
            onCharacterChange?.({ equipped_items: eq });
          } catch { /* best-effort */ }
        }
      }
      setItems(all || []);
      await enforceInventoryCap(character);
    } catch (e) {
      // Rate-limited or transient — keep the last-known inventory rather than
      // throwing up to the page and leaving it stuck on a loading spinner.
      if (!/rate limit/i.test(e?.message || String(e))) console.warn("Inventory load failed", e);
    }
  }, [character, onCharacterChange]);

  // Optimistic equip/unequip: update local item state immediately so the
  // character sheet's derived stats (damage, health, etc.) reflect the change
  // without waiting for the server round-trip. DB writes persist in the
  // background; on failure we roll back to the pre-action snapshot.
  const equip = useCallback(async (item) => {
    if (!character) return;
    // Stims/materials are not gear — equipping them only hid them from the bag.
    if (!EQUIPPABLE_TYPES.includes(item?.type)) return;
    const snapshot = items;

    if (item.is_equipped) {
      const bagCount = items.filter((i) => !i.is_equipped).length;
      if (bagCount >= getInventoryCap(character)) {
        setPendingUnequip(item);
        return;
      }
      const eq = { ...(character.equipped_items || {}) };
      delete eq[item.type];
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_equipped: false } : i)));
      onCharacterChange?.({ equipped_items: eq });
      try {
        await api.entities.Item.update(item.id, { is_equipped: false });
        await api.entities.Character.update(character.id, { equipped_items: eq });
      } catch (e) {
        setItems(snapshot);
        onCharacterChange?.({ equipped_items: character.equipped_items || {} });
        if (/inventory full/i.test(e?.message || "")) {
          setPendingUnequip(item);
          return;
        }
        throw e;
      }
    } else {
      const cur = items.find((i) => i.type === item.type && i.is_equipped);
      const eq = { ...(character.equipped_items || {}), [item.type]: item.id };
      setItems((prev) => prev.map((i) => {
        if (i.id === item.id) return { ...i, is_equipped: true };
        if (cur && i.id === cur.id) return { ...i, is_equipped: false };
        return i;
      }));
      onCharacterChange?.({ equipped_items: eq });
      try {
        // Equip first so a full bag still has room to receive the displaced piece.
        await api.entities.Item.update(item.id, { is_equipped: true });
        if (cur) await api.entities.Item.update(cur.id, { is_equipped: false });
        await api.entities.Character.update(character.id, { equipped_items: eq });
      } catch (e) {
        setItems(snapshot);
        throw e;
      }
    }
  }, [character, items, onCharacterChange]);

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
