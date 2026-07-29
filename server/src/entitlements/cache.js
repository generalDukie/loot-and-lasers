/**
 * Short-TTL in-memory entitlement resolution cache.
 * Invalidated on grant/revoke/consume/expire.
 */

const TTL_MS = Number(process.env.ENTITLEMENT_CACHE_TTL_MS) || 15_000;
const _cache = new Map();

export function getCachedResolution(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCachedResolution(key, value) {
  _cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function invalidateAccountEntitlements(accountId) {
  if (!accountId) {
    _cache.clear();
    return;
  }
  for (const key of _cache.keys()) {
    if (key.startsWith(`${accountId}|`)) _cache.delete(key);
  }
}

export function clearEntitlementCache() {
  _cache.clear();
}
