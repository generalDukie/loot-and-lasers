import { useState, useEffect } from "react";
import { api } from "@/api/gameClient";

// Lightweight load of currently equipped gear for hub / read-only surfaces.
// Best-effort: failures resolve to [] so callers never hang on a spinner.
export function useEquippedItems(characterId) {
  const [equippedItems, setEquippedItems] = useState([]);

  useEffect(() => {
    if (!characterId) {
      setEquippedItems([]);
      return undefined;
    }
    let active = true;
    api.entities.Item.filter({ character_id: characterId, is_equipped: true })
      .then((items) => {
        if (active) setEquippedItems(items || []);
      })
      .catch(() => {
        if (active) setEquippedItems([]);
      });
    return () => { active = false; };
  }, [characterId]);

  return equippedItems;
}
