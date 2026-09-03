/**
 * Black Market Shipping Dock preview session.
 * Presentation/client coordination only. Settlement stays PreviewShipment / ConfirmShipment.
 */

function text(value) {
  return String(value || "").trim();
}

function clonePreview(preview) {
  return preview && typeof preview === "object" ? { ...preview } : {};
}

function hasPreviewPayload(preview) {
  return preview && typeof preview === "object" && Object.keys(preview).length > 0;
}

export function createShipmentDockPreviewState() {
  return {
    generation: 0,
    inFlightGeneration: null,
    preview: {},
    previewGeneration: null,
    error: "",
    overflowBlocked: false,
    retryAvailable: false,
  };
}

export function invalidateShipmentDockPreview(state) {
  return {
    ...createShipmentDockPreviewState(),
    generation: Math.max(0, Math.floor(Number(state?.generation) || 0)) + 1,
    inFlightGeneration: state?.inFlightGeneration ?? null,
  };
}

export function shipmentDockPreviewMatchesGeneration(state) {
  return hasPreviewPayload(state?.preview)
    && state?.previewGeneration === state?.generation;
}

export function shouldStartShipmentDockPreview(state, { qualifies = false, overflowPending = false } = {}) {
  if (!qualifies) return false;
  if (overflowPending || state?.overflowBlocked) return false;
  if (shipmentDockPreviewMatchesGeneration(state)) return false;
  if (state?.inFlightGeneration != null) return false;
  if (state?.retryAvailable) return false;
  if (text(state?.error)) return false;
  return true;
}

export function markShipmentDockPreviewStarted(state) {
  return {
    ...state,
    inFlightGeneration: state.generation,
    retryAvailable: false,
  };
}

export function applyShipmentDockPreviewResponse(state, requestedGeneration, result = {}) {
  const requested = Math.floor(Number(requestedGeneration));
  const inFlight = state?.inFlightGeneration === requested ? null : (state?.inFlightGeneration ?? null);
  const next = {
    ...state,
    inFlightGeneration: inFlight,
  };
  if (requested !== state.generation) {
    return next;
  }
  if (result.overflow) {
    return {
      ...next,
      overflowBlocked: true,
      error: "",
      retryAvailable: false,
      preview: {},
      previewGeneration: null,
    };
  }
  if (!result.ok) {
    return {
      ...next,
      error: text(result.error) || "Could not preview this return shipment.",
      retryAvailable: true,
      preview: {},
      previewGeneration: null,
      overflowBlocked: false,
    };
  }
  return {
    ...next,
    preview: clonePreview(result.preview),
    previewGeneration: state.generation,
    error: "",
    retryAvailable: false,
    overflowBlocked: false,
  };
}

export function beginShipmentDockPreviewRetry(state) {
  if (!state?.retryAvailable) return state;
  return {
    ...state,
    error: "",
    retryAvailable: false,
  };
}

export function formatShipmentDeliveryStatus(data = {}) {
  const parts = [];
  const name = text(data.company_name || data.companyName);
  if (name) parts.push(name);
  if (data.payout != null && Number.isFinite(Number(data.payout))) {
    parts.push(`${Math.max(0, Math.floor(Number(data.payout)))} Stardust`);
  }
  if (data.reputation_granted != null && Number.isFinite(Number(data.reputation_granted))) {
    parts.push(`+${Math.max(0, Math.floor(Number(data.reputation_granted)))} reputation`);
  }
  if (data.company_level != null && Number.isFinite(Number(data.company_level))) {
    parts.push(`company level ${Math.max(0, Math.floor(Number(data.company_level)))}`);
  }
  const rarity = text(data.token_rarity || data.tokenRarity);
  if (rarity) parts.push(`${rarity} token`);
  if (data.overflow_pending || data.overflowPending) {
    parts.push("resolve token overflow in Corporate Offices");
  }
  if (!parts.length) return "Shipment delivered.";
  return `Shipment delivered: ${parts.join(" · ")}.`;
}
