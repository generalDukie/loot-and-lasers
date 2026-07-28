/** Local backpack sort order — keyed by character id (no server field yet). */

const PREFIX = "ll-inv-order:";

export function loadInventoryOrder(characterId) {
  if (!characterId || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PREFIX + characterId);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveInventoryOrder(characterId, ids) {
  if (!characterId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFIX + characterId, JSON.stringify(ids));
  } catch { /* quota / private mode */ }
}

/** Keep known ids in saved order; append any new ids (fresh loot) at the front. */
export function mergeInventoryOrder(savedIds, currentIds) {
  const current = new Set(currentIds);
  const ordered = (savedIds || []).filter((id) => current.has(id));
  const known = new Set(ordered);
  const fresh = currentIds.filter((id) => !known.has(id));
  return [...fresh, ...ordered];
}

export function sortItemsByOrder(items, orderIds) {
  const rank = new Map((orderIds || []).map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return String(b.created_date || "").localeCompare(String(a.created_date || ""));
  });
}

export function reorderIds(ids, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return ids;
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
