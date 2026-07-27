import { useState, useEffect } from "react";
import { api } from "@/api/gameClient";
import { getUnreadMailCount } from "@/lib/mailEngine";

export function useUnreadMailCount(characterId) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!characterId) return;
    let active = true;

    const fetchCount = async () => {
      try {
        const n = await getUnreadMailCount(characterId);
        if (active) setCount(n);
      } catch { /* best-effort */ }
    };

    fetchCount();
    const poll = setInterval(fetchCount, 30000);
    const unsub = api.entities.Mail.subscribe(() => fetchCount());

    return () => {
      active = false;
      clearInterval(poll);
      unsub?.();
    };
  }, [characterId]);

  return count;
}