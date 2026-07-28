import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/api/gameClient";
import {
  getMyCharacter,
  bustMyCharacterCache,
  primeMyCharacterCache,
  subscribeMyCharacterCache,
} from "@/lib/socialEngine";
import { setActiveCharacterId } from "@/lib/activeCharacter";

// Returns the current user's character and keeps it live: it subscribes to
// Character realtime updates AND to local cache primes so currencies (stardust,
// fuel, nova crystals) refresh in the shell the moment any page claims/spends.
export function useMyCharacter() {
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(null);

  const applyFresh = useCallback((fresh) => {
    if (!fresh?.id) return;
    if (idRef.current && fresh.id !== idRef.current) return;
    idRef.current = fresh.id;
    setActiveCharacterId(fresh.id);
    setCharacter((prev) => {
      if (!prev || prev.id !== fresh.id) return fresh;
      // Merge so partial patches from callers still refresh currencies live.
      return { ...prev, ...fresh };
    });
  }, []);

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
            if (c) primeMyCharacterCache(c, { emit: false });
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

    const unsubWs = api.entities.Character.subscribe((event) => {
      if (event.type !== "update") return;
      const id = idRef.current;
      if (!id || event.data?.id !== id) return;
      primeMyCharacterCache(event.data, { emit: false });
      applyFresh(event.data);
    });

    const unsubCache = subscribeMyCharacterCache((fresh) => {
      applyFresh(fresh);
    });

    return () => {
      active = false;
      setActiveCharacterId(null);
      unsubWs?.();
      unsubCache?.();
    };
  }, [applyFresh]);

  // Keep React state + the global active-character id in sync (pages call setCharacter after claims).
  const setCharacterSynced = useCallback((next) => {
    setCharacter((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      idRef.current = value?.id || null;
      setActiveCharacterId(value?.id);
      // emit:false — this hook already owns React state; avoid a notify loop.
      if (value) primeMyCharacterCache(value, { emit: false });
      return value;
    });
  }, []);

  return { character, loading, refresh, setCharacter: setCharacterSynced };
}
