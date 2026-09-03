/**
 * Corporate Offices client cache contract.
 * Server company authority is unchanged; this only classifies when the Godot
 * manager may keep loaded companies, eligible items, overflow, previews,
 * and mutation request IDs.
 */
function textId(value) {
  return String(value || "").trim();
}

function cloneList(value) {
  return Array.isArray(value) ? [...value] : [];
}

export function createCompanyClientState() {
  return {
    boundCharacterId: "",
    boundAccountId: "",
    companies: [],
    eligibleItems: [],
    overflowCompanies: [],
    lastPreview: {},
    lastItem: {},
    shipmentRequestId: "",
    commissionRequestId: "",
  };
}

export function companyClientIdentityChanged(state, characterId, accountId) {
  return textId(state?.boundCharacterId) !== textId(characterId)
    || textId(state?.boundAccountId) !== textId(accountId);
}

export function bindCompanyClientIdentity(state, characterId, accountId) {
  const cid = textId(characterId);
  const aid = textId(accountId);
  if (!companyClientIdentityChanged(state, cid, aid)) {
    return state;
  }
  const next = createCompanyClientState();
  next.boundCharacterId = cid;
  next.boundAccountId = aid;
  return next;
}

export function clearCompanyClientState() {
  return createCompanyClientState();
}

export function applyCompanyStatusResult(state, {
  ok,
  payload,
  requestedCharacterId,
  requestedAccountId,
  liveCharacterId,
  liveAccountId,
} = {}) {
  if (
    textId(requestedCharacterId) !== textId(liveCharacterId)
    || textId(requestedAccountId) !== textId(liveAccountId)
  ) {
    return state;
  }
  if (!ok) return state;
  const data = payload && typeof payload === "object" ? payload : {};
  return {
    ...state,
    companies: cloneList(data.companies),
    eligibleItems: cloneList(data.eligible_items),
    overflowCompanies: cloneList(data.overflow_companies),
  };
}

export function companyClientHasLoadedPayload(state) {
  return (state?.companies?.length || 0) > 0
    || (state?.eligibleItems?.length || 0) > 0
    || (state?.overflowCompanies?.length || 0) > 0
    || Object.keys(state?.lastPreview || {}).length > 0
    || Object.keys(state?.lastItem || {}).length > 0
    || Boolean(state?.shipmentRequestId)
    || Boolean(state?.commissionRequestId);
}
