/**
 * Phase 9 Corporate Offices RPCs.
 */
import { withTransactionAsync, db } from "../db.js";
import { clock } from "../shared/time/clock.js";
import { isAdmin } from "../entityAccess.js";
import { resolveSelectedCharacter } from "../gameplayContext.js";
import { sanitizePublicResponseBody } from "../../../src/lib/gearPricingQuality.js";
import { listOwnedItems } from "../shared/inventoryEquipment.js";
import {
  previewShipment,
  redeemCommission,
  serializeCompanyStatus,
  settleShipment,
} from "../shared/companyService.js";
import { secureRandom } from "../rewards/rng.js";

const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const OP_SHIPMENT = "confirm_shipment";
const OP_COMMISSION = "redeem_commission";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  throw e;
}

function requireMyChar(user) {
  return resolveSelectedCharacter(user);
}

function wrap(fn) {
  return async (user, body) => {
    try {
      const result = await withTransactionAsync(async () => fn(user, body || {}));
      return {
        status: 200,
        body: isAdmin(user) ? result : sanitizePublicResponseBody(result),
      };
    } catch (err) {
      if (err.status) {
        const bodyOut = { error: err.message, code: err.code };
        return {
          status: err.status,
          body: isAdmin(user) ? bodyOut : sanitizePublicResponseBody(bodyOut),
        };
      }
      throw err;
    }
  };
}

function normalizeOperationKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH || !/^[A-Za-z0-9:_-]+$/.test(key)) {
    httpErr(400, "Invalid request_id", "INVALID_REQUEST_ID");
  }
  return key;
}

function getWalletOperation(accountId, operationType, operationKey) {
  if (!operationKey) return null;
  const row = db.prepare(`
    SELECT result_json
    FROM wallet_operations
    WHERE account_id = ? AND operation_type = ? AND operation_key = ?
  `).get(accountId, operationType, operationKey);
  if (!row) return null;
  try {
    return JSON.parse(row.result_json);
  } catch {
    return {};
  }
}

function saveWalletOperation(accountId, operationType, operationKey, result) {
  if (!operationKey) return;
  db.prepare(`
    INSERT INTO wallet_operations (
      account_id, operation_type, operation_key, result_json, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    accountId,
    operationType,
    operationKey,
    JSON.stringify(result || {}),
    clock.nowIso(),
  );
}

export const GetCompanyStatus = wrap((user) => {
  const ch = requireMyChar(user);
  const items = listOwnedItems(ch.id);
  return {
    success: true,
    character: ch,
    ...serializeCompanyStatus(ch, items),
  };
});

export const PreviewShipment = wrap((user, body = {}) => {
  const ch = requireMyChar(user);
  const companyId = String(body.company_id || body.companyId || "").trim();
  const itemIds = body.item_ids || body.itemIds || [];
  return {
    success: true,
    preview: previewShipment(ch, companyId, itemIds),
  };
});

export const ConfirmShipment = wrap((user, body = {}) => {
  const ch = requireMyChar(user);
  const requestId = normalizeOperationKey(body.request_id || body.idempotencyKey || body.idempotency_key);
  if (requestId) {
    const replay = getWalletOperation(user.id, OP_SHIPMENT, requestId);
    if (replay) {
      return { ...replay, patch: {}, character: ch, idempotent_replay: true };
    }
  }
  const companyId = String(body.company_id || body.companyId || "").trim();
  const itemIds = body.item_ids || body.itemIds || [];
  const settled = settleShipment({
    user,
    character: ch,
    companyId,
    itemIds,
    requestId,
  });
  const receipt = {
    success: true,
    company_id: companyId,
    consumed_item_ids: settled.consumed_item_ids,
    base_value: settled.base_value,
    bonus: settled.bonus,
    payout: settled.payout,
    reputation_granted: settled.reputation_granted,
    levels_awarded: settled.levels_awarded,
    tokens_created: settled.tokens_created,
    overflow_pending: settled.overflow_pending,
    company: settled.company,
    companies: settled.companies,
    balances: settled.balances,
    request_id: requestId || null,
  };
  if (requestId) saveWalletOperation(user.id, OP_SHIPMENT, requestId, receipt);
  return {
    ...receipt,
    character: settled.character,
    transaction: settled.transaction,
  };
});

export const RedeemCommission = wrap((user, body = {}) => {
  const ch = requireMyChar(user);
  const requestId = normalizeOperationKey(body.request_id || body.idempotencyKey || body.idempotency_key);
  if (requestId) {
    const replay = getWalletOperation(user.id, OP_COMMISSION, requestId);
    if (replay) {
      return { ...replay, patch: {}, character: ch, idempotent_replay: true };
    }
  }
  const result = redeemCommission({
    user,
    character: ch,
    companyId: String(body.company_id || body.companyId || "").trim(),
    spendTokenId: String(body.spend_token_id || body.token_id || body.tokenId || "").trim(),
    slot: body.slot || body.itemType || body.item_type,
    weights: body.weights || body.stats || null,
    rng: secureRandom,
  });
  const receipt = {
    success: true,
    item: result.item,
    spent_token: result.spent_token,
    company: result.company,
    companies: result.companies,
    overflow_cleared: result.overflow_cleared,
    request_id: requestId || null,
  };
  if (requestId) saveWalletOperation(user.id, OP_COMMISSION, requestId, receipt);
  return {
    ...receipt,
    character: result.character,
  };
});

export const COMPANY_HANDLERS = {
  GetCompanyStatus,
  PreviewShipment,
  ConfirmShipment,
  RedeemCommission,
};
