/**
 * Client cooldown-skip request-ID retention.
 * Server skip ledger is unchanged; this only classifies whether the client
 * may safely forget the pending request ID.
 */
export const HTTP_STATUS_REQUEST_TIMEOUT = 408;
export const HTTP_STATUS_TOO_EARLY = 425;
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
export const HTTP_STATUS_SERVER_ERROR_MIN = 500;
export const HTTP_STATUS_SERVER_ERROR_MAX = 599;

export const SKIP_CODE_TIMEOUT = "TIMEOUT";
export const SKIP_CODE_NETWORK_ERROR = "NETWORK_ERROR";

export const PHASE7_COOLDOWN_DUNGEON = "dungeon";
export const PHASE7_COOLDOWN_WORMHOLE = "wormhole";

function statusInt(envelope) {
  return Math.floor(Number(envelope?.status) || 0);
}

export function shouldRetainSkipRequestId(envelope) {
  if (!envelope || typeof envelope !== "object") return true;
  if (envelope.ok === true) return false;
  if (envelope.retryable === true) return true;
  const status = statusInt(envelope);
  if (status <= 0) return true;
  const code = String(envelope.code || "");
  if (code === SKIP_CODE_TIMEOUT || code === SKIP_CODE_NETWORK_ERROR) return true;
  if (
    status === HTTP_STATUS_REQUEST_TIMEOUT
    || status === HTTP_STATUS_TOO_EARLY
    || status === HTTP_STATUS_TOO_MANY_REQUESTS
  ) {
    return true;
  }
  if (status >= HTTP_STATUS_SERVER_ERROR_MIN && status <= HTTP_STATUS_SERVER_ERROR_MAX) {
    return true;
  }
  return false;
}

export function createSkipIntentState() {
  return {
    [PHASE7_COOLDOWN_DUNGEON]: "",
    [PHASE7_COOLDOWN_WORMHOLE]: "",
  };
}

export function beginSkipIntent(state, selector, makeId) {
  const key = selector === PHASE7_COOLDOWN_WORMHOLE
    ? PHASE7_COOLDOWN_WORMHOLE
    : PHASE7_COOLDOWN_DUNGEON;
  const next = { ...state };
  if (!next[key]) next[key] = makeId(key);
  return { state: next, requestId: next[key] };
}

export function completeSkipIntent(state, selector, envelope) {
  const key = selector === PHASE7_COOLDOWN_WORMHOLE
    ? PHASE7_COOLDOWN_WORMHOLE
    : PHASE7_COOLDOWN_DUNGEON;
  const next = { ...state };
  if (!shouldRetainSkipRequestId(envelope)) next[key] = "";
  return next;
}

export function clearSkipIntents(_state) {
  return createSkipIntentState();
}
