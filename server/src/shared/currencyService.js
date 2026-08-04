/**
 * Shared currency service (Restoration 15).
 *
 * Character-scoped balances on Node Character documents.
 * Nova is stored as integer half-units (1 Nova = 2 units).
 * Stardust / Fuel remain integer / decimal-fuel as established.
 *
 * Callers must run inside withTransactionAsync where mutations occur.
 */
import { entities } from "../entities.js";
import { db } from "../db.js";
import { clock } from "./time/clock.js";
import { clampStardust, STARDUST_MAX } from "./economyFormulas.js";
import { recordCurrencyChange, ActorTypes, newCorrelationId } from "../audit/index.js";

export const CurrencyTypes = Object.freeze({
  STARDUST: "stardust",
  NOVA: "nova_crystals",
  FUEL: "fuel",
});

/** 1 display Nova = 2 half-units. */
export const NOVA_HALF_UNITS_PER_NOVA = 2;
export const ECONOMY_NOVA_SCALE = 2;

/** Starting Nova for the first character on an account (display). */
export const STARTING_NOVA_DISPLAY = 25;
export const STARTING_NOVA_HALF_UNITS = STARTING_NOVA_DISPLAY * NOVA_HALF_UNITS_PER_NOVA;

export function toNovaHalfUnits(displayNova) {
  const n = Number(displayNova);
  if (!Number.isFinite(n) || n < 0) {
    const e = new Error("Invalid Nova amount");
    e.status = 400;
    e.code = "INVALID_NOVA_AMOUNT";
    throw e;
  }
  // Accept .0 / .5 only
  const half = Math.round(n * NOVA_HALF_UNITS_PER_NOVA);
  if (Math.abs(n * NOVA_HALF_UNITS_PER_NOVA - half) > 1e-9) {
    const e = new Error("Nova amount must end in .0 or .5");
    e.status = 400;
    e.code = "INVALID_NOVA_PRECISION";
    throw e;
  }
  return half;
}

export function fromNovaHalfUnits(halfUnits) {
  const h = Math.max(0, Math.floor(Number(halfUnits) || 0));
  return h / NOVA_HALF_UNITS_PER_NOVA;
}

export function formatNovaDisplay(halfUnits) {
  const display = fromNovaHalfUnits(halfUnits);
  if (Number.isInteger(display)) return String(display);
  return display.toFixed(1);
}

export function readNovaHalfUnits(character) {
  return Math.max(0, Math.floor(Number(character?.nova_crystals) || 0));
}

export function hasNova(character, displayAmount) {
  try {
    return readNovaHalfUnits(character) >= toNovaHalfUnits(displayAmount);
  } catch {
    return false;
  }
}

export function hasNovaHalfUnits(character, halfUnits) {
  return readNovaHalfUnits(character) >= Math.max(0, Math.floor(Number(halfUnits) || 0));
}

/** Patch fragment for a display-Nova debit (does not persist). */
export function novaDebitPatch(character, displayAmount) {
  const half = toNovaHalfUnits(displayAmount);
  const after = readNovaHalfUnits(character) - half;
  if (after < 0) {
    const e = new Error("Not enough Nova Crystals");
    e.status = 400;
    e.code = "INSUFFICIENT_NOVA";
    throw e;
  }
  return { nova_crystals: after, economy_nova_scale: ECONOMY_NOVA_SCALE };
}

/** Patch fragment for a display-Nova credit (does not persist). */
export function novaCreditPatch(character, displayAmount) {
  const half = toNovaHalfUnits(displayAmount);
  return {
    nova_crystals: readNovaHalfUnits(character) + half,
    economy_nova_scale: ECONOMY_NOVA_SCALE,
  };
}

export function readStardust(character) {
  return clampStardust(character?.stardust || 0);
}

export function getBalances(character) {
  const novaHalf = readNovaHalfUnits(character);
  return {
    fuel: Number(character?.fuel) || 0,
    stardust: readStardust(character),
    nova_crystals: fromNovaHalfUnits(novaHalf),
    nova_half_units: novaHalf,
    economy_nova_scale: ECONOMY_NOVA_SCALE,
  };
}

export function serializeEconomyState(character) {
  const balances = getBalances(character);
  return {
    balances,
    character_id: character?.id || null,
    economy_nova_scale: ECONOMY_NOVA_SCALE,
    fuel_purchases: character?.fuel_purchases || 0,
    fuel_reset_at: character?.fuel_reset_at || null,
  };
}

function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(key)) {
    const e = new Error("Invalid idempotency key");
    e.status = 400;
    e.code = "INVALID_IDEMPOTENCY_KEY";
    throw e;
  }
  return key;
}

function getLedgerReceipt(accountId, operationType, operationKey) {
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

/** Read-only idempotency peek (no mutation). */
export function recoverTransaction(accountId, category, idempotencyKey) {
  const key = normalizeIdempotencyKey(idempotencyKey);
  if (!key) return null;
  // Prefer exact debit/credit op types used by mutateCurrency.
  for (const direction of ["debit", "credit"]) {
    for (const currency of [CurrencyTypes.NOVA, CurrencyTypes.STARDUST]) {
      const opType = `econ_${direction}_${currency}`;
      const hit = getLedgerReceipt(accountId, opType, key);
      if (hit) return hit;
    }
  }
  return getLedgerReceipt(accountId, category, key);
}

function saveLedgerReceipt(accountId, operationType, operationKey, result) {
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

/**
 * Credit Nova (amount in display Nova, .0 or .5).
 * @returns {{ character, patch, transaction, balances, replay? }}
 */
export function creditNova(opts) {
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.NOVA,
    direction: "credit",
    amountHalfUnits: toNovaHalfUnits(opts.amount),
  });
}

/** Debit Nova (display Nova). */
export function debitNova(opts) {
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.NOVA,
    direction: "debit",
    amountHalfUnits: toNovaHalfUnits(opts.amount),
  });
}

/** Credit / debit using explicit half-units (preferred for skip formula). */
export function creditNovaHalfUnits(opts) {
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.NOVA,
    direction: "credit",
    amountHalfUnits: Math.max(0, Math.floor(Number(opts.amountHalfUnits) || 0)),
  });
}

export function debitNovaHalfUnits(opts) {
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.NOVA,
    direction: "debit",
    amountHalfUnits: Math.max(0, Math.floor(Number(opts.amountHalfUnits) || 0)),
  });
}

export function creditStardust(opts) {
  const amount = clampStardust(opts.amount);
  if (amount <= 0 && opts.allowZero !== true) {
    const e = new Error("Invalid Stardust amount");
    e.status = 400;
    e.code = "INVALID_STARDUST_AMOUNT";
    throw e;
  }
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.STARDUST,
    direction: "credit",
    amountStardust: amount,
  });
}

export function debitStardust(opts) {
  const amount = clampStardust(opts.amount);
  if (amount <= 0) {
    const e = new Error("Invalid Stardust amount");
    e.status = 400;
    e.code = "INVALID_STARDUST_AMOUNT";
    throw e;
  }
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.STARDUST,
    direction: "debit",
    amountStardust: amount,
  });
}

function mutateCurrency({
  user,
  character,
  currency,
  direction,
  amountHalfUnits = 0,
  amountStardust = 0,
  category,
  relatedEntityType = null,
  relatedEntityId = null,
  idempotencyKey = "",
  extraPatch = {},
  reasonCode = null,
  skipAudit = false,
}) {
  if (!character?.id) {
    const e = new Error("Character required");
    e.status = 400;
    throw e;
  }
  const accountId = user?.id || character.created_by_id;
  if (!accountId) {
    const e = new Error("Account required");
    e.status = 401;
    throw e;
  }

  const opType = `econ_${direction}_${currency}`;
  const key = normalizeIdempotencyKey(idempotencyKey);
  if (key) {
    const replay = getLedgerReceipt(accountId, opType, key);
    if (replay) {
      const live = entities.Character.get(character.id) || character;
      return {
        replay: true,
        character: live,
        patch: {},
        transaction: replay,
        balances: getBalances(live),
      };
    }
  }

  const beforeBalances = getBalances(character);
  const patch = { ...extraPatch };
  let deltaDisplay = 0;
  let before = 0;
  let after = 0;

  if (currency === CurrencyTypes.NOVA) {
    before = readNovaHalfUnits(character);
    const delta = direction === "credit" ? amountHalfUnits : -amountHalfUnits;
    after = before + delta;
    if (after < 0) {
      const e = new Error("Not enough Nova Crystals");
      e.status = 400;
      e.code = "INSUFFICIENT_NOVA";
      throw e;
    }
    if (!Number.isSafeInteger(after)) {
      const e = new Error("Nova balance overflow");
      e.status = 400;
      e.code = "NOVA_OVERFLOW";
      throw e;
    }
    patch.nova_crystals = after;
    patch.economy_nova_scale = ECONOMY_NOVA_SCALE;
    deltaDisplay = fromNovaHalfUnits(Math.abs(delta));
  } else if (currency === CurrencyTypes.STARDUST) {
    before = readStardust(character);
    const delta = direction === "credit" ? amountStardust : -amountStardust;
    after = before + delta;
    if (after < 0) {
      const e = new Error("Not enough stardust");
      e.status = 400;
      e.code = "INSUFFICIENT_STARDUST";
      throw e;
    }
    if (after > STARDUST_MAX) {
      const e = new Error("Stardust balance overflow");
      e.status = 400;
      e.code = "STARDUST_OVERFLOW";
      throw e;
    }
    patch.stardust = after;
    if (direction === "credit" && delta > 0) {
      patch.total_stardust_earned = (character.total_stardust_earned || 0) + delta;
    }
    deltaDisplay = Math.abs(delta);
  } else {
    const e = new Error("Unsupported currency");
    e.status = 400;
    throw e;
  }

  const updated = entities.Character.update(character.id, patch);
  const txId = key || `tx_${clock.nowMs()}_${Math.floor(Math.random() * 1e6)}`;
  const transaction = {
    transaction_id: txId,
    category: category || opType,
    currency,
    direction,
    amount: deltaDisplay,
    amount_half_units: currency === CurrencyTypes.NOVA ? Math.abs(amountHalfUnits) : null,
    balance_before: currency === CurrencyTypes.NOVA ? fromNovaHalfUnits(before) : before,
    balance_after: currency === CurrencyTypes.NOVA ? fromNovaHalfUnits(after) : after,
    balance_before_half_units: currency === CurrencyTypes.NOVA ? before : null,
    balance_after_half_units: currency === CurrencyTypes.NOVA ? after : null,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
    status: "COMPLETED",
    created_at: clock.nowIso(),
  };

  if (key) saveLedgerReceipt(accountId, opType, key, transaction);

  if (!skipAudit && user) {
    recordCurrencyChange({
      user,
      character,
      currencyType: currency === CurrencyTypes.NOVA ? "nova_crystals" : "stardust",
      before: currency === CurrencyTypes.NOVA ? fromNovaHalfUnits(before) : before,
      after: currency === CurrencyTypes.NOVA ? fromNovaHalfUnits(after) : after,
      amount: direction === "credit" ? deltaDisplay : -deltaDisplay,
      reasonCode: reasonCode || category || opType,
      source: category || "economy",
      correlationId: newCorrelationId(),
      actorType: ActorTypes.PLAYER,
      idempotencyKey: key || undefined,
    });
  }

  return {
    replay: false,
    character: updated,
    patch,
    transaction,
    balances: getBalances(updated),
    beforeBalances,
  };
}

/**
 * Mission skip cost in half-units from original Fuel cost.
 * MAX(1, CEILING(fuel × 0.20))
 */
export function missionSkipCostHalfUnits(fuelCost) {
  const fuel = Math.max(0, Number(fuelCost) || 0);
  return Math.max(1, Math.ceil(fuel * 0.2));
}

export function missionSkipCostDisplay(fuelCost) {
  return fromNovaHalfUnits(missionSkipCostHalfUnits(fuelCost));
}

/** Finalized Nova package catalog (display Nova grants). */
export const NOVA_PACKAGES = Object.freeze({
  pack_2: { id: "pack_2", name: "$2 Pack", crystals: 275, price_label: "$2", usd_hint: 2 },
  pack_5: { id: "pack_5", name: "$5 Pack", crystals: 850, price_label: "$5", usd_hint: 5 },
  pack_10: { id: "pack_10", name: "$10 Pack", crystals: 1950, price_label: "$10", usd_hint: 10 },
  pack_20: { id: "pack_20", name: "$20 Pack", crystals: 4500, price_label: "$20", usd_hint: 20 },
  pack_50: { id: "pack_50", name: "$50 Pack", crystals: 12750, price_label: "$50", usd_hint: 50 },
  pack_100: { id: "pack_100", name: "$100 Pack", crystals: 30000, price_label: "$100", usd_hint: 100 },
  // Legacy aliases → nearest finalized pack (dev catalog continuity)
  pouch: { id: "pack_5", name: "$5 Pack", crystals: 850, price_label: "$5", usd_hint: 5, alias_of: "pack_5" },
  cluster: { id: "pack_10", name: "$10 Pack", crystals: 1950, price_label: "$10", usd_hint: 10, alias_of: "pack_10" },
  vault: { id: "pack_20", name: "$20 Pack", crystals: 4500, price_label: "$20", usd_hint: 20, alias_of: "pack_20" },
  motherlode: { id: "pack_50", name: "$50 Pack", crystals: 12750, price_label: "$50", usd_hint: 50, alias_of: "pack_50" },
});

export function resolveNovaPackage(packId) {
  const id = String(packId || "").trim();
  const pack = NOVA_PACKAGES[id];
  if (!pack) return null;
  // Normalize aliases to canonical id
  const canonical = NOVA_PACKAGES[pack.id] || pack;
  return { ...canonical };
}
