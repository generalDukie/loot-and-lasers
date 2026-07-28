import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/api/gameClient";
import { getMyCharacter, bustMyCharacterCache, primeMyCharacterCache } from "@/lib/socialEngine";
import { setActiveCharacterId } from "@/lib/activeCharacter";

// Returns the current user's character and keeps it live: it subscribes to
// Character realtime updates so currencies (stardust, fuel, nova crystals,
// arena tokens) refresh the moment a backend function grants them, without
// waiting for a manual refetch or page reload.
export function useMyCharacter() {
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(null);

  const refresh = useCallback(async () => {
    bustMyCharacterCache();
    const c = await getMyCharacter({ force: true });
    idRef.current = c?.id || null;
    setActiveCharacterId(c?.id);
    setCharacter(c);
    return c;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let c = await getMyCharacter();
        if (!active) return;
        // Backfill missing fuel (e.g. older creates) via the 24h cycle sync.
        if (c && (c.fuel == null || !Number.isFinite(Number(c.fuel)))) {
          try {
            const res = await api.functions.invoke("SyncFuelCycle", {});
            const patch = res.patch || res.data?.patch || {};
            const updated = res.character || res.data?.character;
            if (updated?.id) c = updated;
            else if (Object.keys(patch).length) c = { ...c, ...patch };
            if (c) primeMyCharacterCache(c);
          } catch { /* best-effort */ }
        }
        if (!active) return;
        idRef.current = c?.id || null;
        setActiveCharacterId(c?.id);
        setCharacter(c);
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsub = api.entities.Character.subscribe((event) => {
      if (event.type !== "update") return;
      const id = idRef.current;
      if (!id || event.data?.id !== id) return;
      primeMyCharacterCache(event.data);
      setCharacter(event.data);
    });

    return () => {
      active = false;
      setActiveCharacterId(null);
      unsub?.();
    };
  }, []);

  // Keep React state + the global active-character id in sync (pages call setCharacter after claims).
  const setCharacterSynced = useCallback((next) => {
    setCharacter((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      idRef.current = value?.id || null;
      setActiveCharacterId(value?.id);
      if (value) primeMyCharacterCache(value);
      return value;
    });
  }, []);

  return { character, loading, refresh, setCharacter: setCharacterSynced };
}
