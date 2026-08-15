import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { db, nowIso } from "./db.js";
import { broadcastWalletUpdated } from "./realtime.js";
import { clampStardust } from "./shared/economyFormulas.js";

const MAX_AMOUNT = 1_000_000_000;
const NOVA_HALF_UNIT_STORAGE_SCALE = 2;
const LEGACY_NOVA_STORAGE_SCALE = 1;
const DEFAULT_TOKEN_MAX_LENGTH = 128;
const OPERATION_TYPE_MAX_LENGTH = 64;
const FUEL_PRECISION_SCALE = 100;
const MIN_FUEL_AMOUNT = 0.01;
const AMOUNT_PRECISION_EPSILON = 1e-9;
const WALLET_TRANSACTION_ID_LENGTH = 24;
const OPERATIONS = Object.freeze({
  mission_start_fuel: {
    currency: "fuel", direction: -1, compensation: "mission_start_fuel_refund",
  },
  mission_start_fuel_refund: {
    currency: "fuel", direction: 1, compensates: "mission_start_fuel",
  },
  mission_claim_stardust: { currency: "stardust", direction: 1 },
  mission_skip_nova: {
    currency: "nova_crystals", direction: -1, compensation: "mission_skip_nova_refund",
  },
  mission_skip_nova_refund: {
    currency: "nova_crystals", direction: 1, compensates: "mission_skip_nova",
  },
  shop_buy_stardust: {
    currency: "stardust", direction: -1, compensation: "shop_buy_stardust_refund",
  },
  shop_buy_stardust_refund: {
    currency: "stardust", direction: 1, compensates: "shop_buy_stardust",
  },
  shop_sell_stardust: {
    currency: "stardust", direction: 1, compensation: "shop_sell_stardust_reversal",
  },
  shop_sell_stardust_reversal: {
    currency: "stardust", direction: -1, compensates: "shop_sell_stardust",
  },
  shop_refresh_stardust: {
    currency: "stardust", direction: -1, compensation: "shop_refresh_stardust_refund",
  },
  shop_refresh_stardust_refund: {
    currency: "stardust", direction: 1, compensates: "shop_refresh_stardust",
  },
  mail_reward_stardust: { currency: "stardust", direction: 1 },
  reward_stardust: { currency: "stardust", direction: 1 },
});

function walletError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function parseEntity(row) {
  if (!row) return null;
  const data = JSON.parse(row.data);
  return {
    ...data,
    id: row.id,
    created_by: row.created_by ?? data.created_by ?? null,
    created_by_id: row.created_by_id ?? data.created_by_id ?? null,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

function balancesOf(character) {
  const rawNova = Math.max(0, Math.floor(Number(character?.nova_crystals) || 0));
  const scale = Number(character?.economy_nova_scale) === NOVA_HALF_UNIT_STORAGE_SCALE
    ? NOVA_HALF_UNIT_STORAGE_SCALE
    : LEGACY_NOVA_STORAGE_SCALE;
  return {
    fuel: Number(character?.fuel) || 0,
    stardust: Math.max(0, Math.floor(Number(character?.stardust) || 0)),
    // Compatibility wallet returns display Nova (.0 / .5).
    nova_crystals: scale === NOVA_HALF_UNIT_STORAGE_SCALE
      ? rawNova / NOVA_HALF_UNIT_STORAGE_SCALE
      : rawNova,
  };
}

function novaStorageDelta(character, displayDelta) {
  const scale = Number(character?.economy_nova_scale) === NOVA_HALF_UNIT_STORAGE_SCALE
    ? NOVA_HALF_UNIT_STORAGE_SCALE
    : LEGACY_NOVA_STORAGE_SCALE;
  return displayDelta * scale;
}

function requireToken(value, name, max = DEFAULT_TOKEN_MAX_LENGTH) {
  const token = String(value || "").trim();
  if (!token || token.length > max || !/^[A-Za-z0-9:_-]+$/.test(token)) {
    throw walletError(400, `Invalid ${name}`, "INVALID_REQUEST");
  }
  return token;
}

function normalizedRequest(input) {
  const operationType = requireToken(
    input?.operation_type,
    "operation_type",
    OPERATION_TYPE_MAX_LENGTH,
  );
  const definition = OPERATIONS[operationType];
  if (!definition) throw walletError(400, "Operation is not allowed", "OPERATION_NOT_ALLOWED");
  const rawAmount = Number(input?.amount);
  const amount = definition.currency === "fuel"
    ? Math.round(rawAmount * FUEL_PRECISION_SCALE) / FUEL_PRECISION_SCALE
    : rawAmount;
  const validAmount = definition.currency === "fuel"
    ? Number.isFinite(rawAmount)
      && amount >= MIN_FUEL_AMOUNT
      && Math.abs(rawAmount - amount) < AMOUNT_PRECISION_EPSILON
    : Number.isSafeInteger(amount) && amount >= 1;
  if (!validAmount || amount > MAX_AMOUNT) {
    throw walletError(400, "Invalid amount", "INVALID_AMOUNT");
  }
  return {
    nakamaUserId: requireToken(input?.nakama_user_id, "nakama_user_id"),
    characterId: input?.character_id ? requireToken(input.character_id, "character_id") : "",
    operationType,
    operationKey: requireToken(input?.operation_key, "operation_key"),
    referenceId: requireToken(input?.reference_id, "reference_id"),
    amount,
    currency: definition.currency,
    delta: definition.direction * amount,
    definition,
  };
}

function fingerprintOf(request, characterId) {
  return crypto.createHash("sha256").update(JSON.stringify({
    character_id: characterId,
    operation_type: request.operationType,
    operation_key: request.operationKey,
    reference_id: request.referenceId,
    currency: request.currency,
    amount: request.amount,
    delta: request.delta,
  })).digest("hex");
}

function selectOwnedCharacter(account, explicitId) {
  const id = explicitId || account.active_character_id;
  if (!id) throw walletError(404, "No selected character", "CHARACTER_NOT_FOUND");
  const row = db.prepare("SELECT * FROM entities WHERE type = 'Character' AND id = ?").get(id);
  const character = parseEntity(row);
  if (!character) throw walletError(404, "Character not found", "CHARACTER_NOT_FOUND");
  if (character.created_by_id !== account.id) {
    throw walletError(403, "Character is not owned by Nakama account", "CHARACTER_NOT_OWNED");
  }
  return character;
}

function resultFor(character, receipt, replay) {
  const wallet = {
    balances: balancesOf(character),
    character_id: character.id,
    transaction_id: receipt.transaction_id,
    updated_at: character.updated_date,
    revision: Number(receipt.revision) || 0,
  };
  return {
    success: true,
    wallet,
    balances: wallet.balances,
    character_id: wallet.character_id,
    transaction_id: wallet.transaction_id,
    updated_at: wallet.updated_at,
    revision: wallet.revision,
    character,
    idempotent_replay: replay,
  };
}

function findReceipt(accountId, operationType, referenceId) {
  const rows = db.prepare(`
    SELECT * FROM wallet_operations
    WHERE account_id = ? AND operation_type = ?
  `).all(accountId, operationType);
  for (const row of rows) {
    try {
      const result = JSON.parse(row.result_json);
      if (result.reference_id === referenceId) return { ...row, result };
    } catch {
      // Ignore legacy/malformed receipts; they cannot authorize compensation.
    }
  }
  return null;
}

export function applyWalletOperation(input, { broadcast = true } = {}) {
  const request = normalizedRequest(input);
  let response;
  let accountId;
  db.exec("BEGIN IMMEDIATE");
  try {
    const account = db.prepare("SELECT * FROM users WHERE nakama_user_id = ?").get(request.nakamaUserId);
    if (!account) throw walletError(404, "Nakama account mapping not found", "ACCOUNT_NOT_FOUND");
    accountId = account.id;
    let character = selectOwnedCharacter(account, request.characterId);
    const fingerprint = fingerprintOf(request, character.id);
    const existing = db.prepare(`
      SELECT * FROM wallet_operations
      WHERE account_id = ? AND operation_type = ? AND operation_key = ?
    `).get(account.id, request.operationType, request.operationKey);

    if (existing) {
      if (existing.request_fingerprint && existing.request_fingerprint !== fingerprint) {
        throw walletError(409, "Conflicting reuse of operation_key", "IDEMPOTENCY_CONFLICT");
      }
      if (
        request.definition.compensation
        && findReceipt(account.id, request.definition.compensation, request.referenceId)
      ) {
        throw walletError(409, "Operation was compensated", "OPERATION_COMPENSATED");
      }
      character = selectOwnedCharacter(account, existing.character_id || character.id);
      response = resultFor(character, existing, true);
      db.exec("COMMIT");
      return response;
    }

    if (request.definition.compensates) {
      const original = findReceipt(account.id, request.definition.compensates, request.referenceId);
      if (!original) {
        throw walletError(409, "Compensation has no matching operation", "COMPENSATION_NOT_ALLOWED");
      }
      if (
        original.character_id !== character.id
        || Number(original.result?.amount) !== request.amount
      ) {
        throw walletError(409, "Compensation does not match original operation", "COMPENSATION_CONFLICT");
      }
    }

    const before = balancesOf(character);
    let storageBefore;
    let storageAfter;
    if (request.currency === "nova_crystals") {
      storageBefore = Math.max(0, Math.floor(Number(character?.nova_crystals) || 0));
      const delta = novaStorageDelta(character, request.delta);
      storageAfter = storageBefore + delta;
      if (!Number.isFinite(storageAfter) || storageAfter < 0) {
        throw walletError(409, `Insufficient ${request.currency}`, "INSUFFICIENT_FUNDS");
      }
      if (storageAfter > Number.MAX_SAFE_INTEGER) {
        throw walletError(409, "Balance limit exceeded", "BALANCE_LIMIT");
      }
    } else {
      const rawAfter = before[request.currency] + request.delta;
      if (!Number.isFinite(rawAfter) || rawAfter < 0) {
        throw walletError(409, `Insufficient ${request.currency}`, "INSUFFICIENT_FUNDS");
      }
      if (rawAfter > Number.MAX_SAFE_INTEGER) {
        throw walletError(409, "Balance limit exceeded", "BALANCE_LIMIT");
      }
      storageAfter = request.currency === "stardust"
        ? clampStardust(rawAfter)
        : request.currency === "fuel"
          ? Math.round(rawAfter * FUEL_PRECISION_SCALE) / FUEL_PRECISION_SCALE
          : rawAfter;
    }
    const after = storageAfter;
    const updatedAt = nowIso();
    const revisionRow = db.prepare(
      "SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM wallet_operations WHERE account_id = ?"
    ).get(account.id);
    const revision = Number(revisionRow?.revision) || 1;
    const transactionId = `wallet:${nanoid(WALLET_TRANSACTION_ID_LENGTH)}`;
    const next = {
      ...character,
      [request.currency]: after,
      ...(request.currency === "nova_crystals"
        ? { economy_nova_scale: NOVA_HALF_UNIT_STORAGE_SCALE }
        : {}),
      wallet_revision: revision,
      updated_date: updatedAt,
    };
    const {
      id, created_by, created_by_id, created_date, updated_date, ...data
    } = next;
    const stored = { ...data, id, created_by, created_by_id, created_date, updated_date };
    db.prepare(`
      UPDATE entities SET data = ?, updated_date = ?
      WHERE id = ? AND type = 'Character' AND created_by_id = ?
    `).run(JSON.stringify(stored), updatedAt, id, account.id);

    const receipt = {
      transaction_id: transactionId,
      revision,
      operation_type: request.operationType,
      operation_key: request.operationKey,
      reference_id: request.referenceId,
      currency: request.currency,
      amount: request.amount,
      delta: request.delta,
    };
    db.prepare(`
      INSERT INTO wallet_operations (
        account_id, operation_type, operation_key, result_json, created_at,
        character_id, request_fingerprint, transaction_id, revision, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account.id, request.operationType, request.operationKey, JSON.stringify(receipt),
      updatedAt, character.id, fingerprint, transactionId, revision, updatedAt,
    );
    character = parseEntity(db.prepare(
      "SELECT * FROM entities WHERE type = 'Character' AND id = ?"
    ).get(character.id));
    response = resultFor(character, receipt, false);
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* transaction already closed */ }
    throw err;
  }

  if (broadcast) {
    broadcastWalletUpdated(accountId, {
      ...response.wallet,
      source: request.operationType,
      type: "wallet_updated",
    });
  }
  return response;
}

function safeSecretMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createWalletBridgeRouter(express) {
  const router = express.Router();
  router.post("/apply", (req, res) => {
    const secret = String(process.env.LOOT_WALLET_BRIDGE_SECRET || "");
    if (!secret) return res.status(503).json({ error: "Wallet bridge unavailable", code: "BRIDGE_DISABLED" });
    const provided = req.headers["x-loot-wallet-bridge-secret"];
    if (!safeSecretMatch(provided, secret)) {
      return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    }
    try {
      return res.json(applyWalletOperation(req.body || {}));
    } catch (err) {
      return res.status(err.status || 500).json({
        error: err.status ? err.message : "Wallet operation failed",
        code: err.code || "INTERNAL_ERROR",
      });
    }
  });
  return router;
}

export { OPERATIONS };
