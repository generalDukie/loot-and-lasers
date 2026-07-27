import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/api/gameClient";
import { getMyCharacter, bustMyCharacterCache, primeMyCharacterCache } from "@/lib/socialEngine";

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
    setCharacter(c);
    return c;
  }, []);

  useEffect(() => {
    let active = true;
    getMyCharacter()
      .then((c) => {
        if (!active) return;
        idRef.current = c?.id || null;
        setCharacter(c);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));

    const unsub = api.entities.Character.subscribe((event) => {
      if (event.type !== "update") return;
      const id = idRef.current;
      if (!id || event.data?.id !== id) return;
      // The event already carries the freshest character — prime the cache with
      // it instead of busting, so menu navigation stops refetching on every
      // update (which was the main source of rate-limit stalls).
      primeMyCharacterCache(event.data);
      setCharacter(event.data);
    });

    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  return { character, loading, refresh, setCharacter };
}