import React, { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/api/gameClient";
import { MAX_BUFF_STACKS, MAX_ACTIVE_STAT_TYPES, getInventoryCap } from "@/lib/gameData";
import { enforceInventoryCap, setPendingUnequip } from "@/lib/inventoryCap";

/**
 * Pure stim apply — validates stack / distinct-stat caps and returns the next
 * active_buffs list. Does not mutate inventory. Used by useConsumable and the
 * inventory-full modal Use action (pending / non-persisted items).
 */
export function prepareConsumableBuffs(character, item, sourceBuffs) {
  if (!character || item?.type !== "consumable" || !item.consumable) {
    return { ok: false, reason: "Not a stim." };
  }
  const now = Date.now();
  const durationMs = (item.consumable.duration_hours || 6) * 3600 * 1000;
  const maxExpiry = now + durationMs * MAX_BUFF_STACKS;
  const source = sourceBuffs ?? character.active_buffs ?? [];
  const active = source.filter((b) => new Date(b.expires_at).getTime() > now);
  const sameStatIdx = active.findIndex((b) => b.stat === item.consumable.stat);
  if (sameStatIdx < 0 && new Set(active.map((b) => b.stat)).size >= MAX_ACTIVE_STAT_TYPES) {
    return { ok: false, reason: `You already have ${MAX_ACTIVE_STAT_TYPES} active stat boosts. Wait for one to expire.` };
  }
  if (sameStatIdx >= 0 && active[sameStatIdx].name === item.name) {
    const existingExpiry = new Date(active[sameStatIdx].expires_at).getTime();
    if (existingExpiry - now >= durationMs * MAX_BUFF_STACKS) {
      return { ok: false, reason: `${item.name} is already at max stacks (${MAX_BUFF_STACKS}×).` };
    }
  }
  if (sameStatIdx >= 0 && (item.consumable.mult || 0) < (active[sameStatIdx].mult || 0)) {
    return { ok: false, reason: `A stronger ${item.consumable.stat} stim is already active.` };
  }
  let buffs;
  if (sameStatIdx >= 0) {
    const existing = active[sameStatIdx];
    buffs = [...active];
    if (existing.name === item.name) {
      const newExpiry = Math.min(new Date(existing.expires_at).getTime() + durationMs, maxExpiry);
      buffs[sameStatIdx] = { ...existing, expires_at: new Date(newExpiry).toISOString() };
    } else {
      buffs[sameStatIdx] = {
        stat: item.consumable.stat,
        mult: item.consumable.mult,
        expires_at: new Date(now + durationMs).toISOString(),
        name: item.name,
      };
    }
  } else {
    buffs = [
      ...active,
      {
        stat: item.consumable.stat,
        mult: item.consumable.mult,
        expires_at: new Date(now + durationMs).toISOString(),
        name: item.name,
      },
    ];
  }
  return { ok: true, buffs };
}

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
      setItems(all || []);
      await enforceInventoryCap(character);
    } catch (e) {
      // Rate-limited or transient — keep the last-known inventory rather than
      // throwing up to the page and leaving it stuck on a loading spinner.
      if (!/rate limit/i.test(e?.message || String(e))) console.warn("Inventory load failed", e);
    }
  }, [character]);

  // Optimistic equip/unequip: update local item state immediately so the
  // character sheet's derived stats (damage, health, etc.) reflect the change
  // without waiting for the server round-trip. DB writes persist in the
  // background; on failure we roll back to the pre-action snapshot.
  const equip = useCallback(async (item) => {
    if (!character) return;
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
    try {
      const res = await api.functions.invoke("DissolveItem", { item_id: item.id });
      const patch = res.patch || res.data?.patch || {};
      onCharacterChange?.(patch);
      await load();
    } catch (e) {
      await load();
      throw e;
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
    try {
      const res = await api.functions.invoke("DissolveJunk", {
        item_ids: itemList.map((i) => i.id),
      });
      const patch = res.patch || res.data?.patch || {};
      const gained = res.stardust_gained ?? res.data?.stardust_gained ?? 0;
      onCharacterChange?.(patch);
      await load();
      return gained;
    } catch (e) {
      await load();
      throw e;
    }
  }, [character, load, onCharacterChange]);

  return { items, load, equip, sell, bulkSell, useConsumable, toggleLock };
}
