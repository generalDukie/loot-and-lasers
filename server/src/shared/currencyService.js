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
import { STARTING_NOVA, STARTING_STARDUST as PRODUCTION_STARTING_STARDUST } from "./productionMath.js";
import { recordCurrencyChange, ActorTypes, newCorrelationId } from "../audit/index.js";
import {
  NovaBalanceTypes,
  applyNovaSplitDelta,
  defaultNovaBalanceTypeForCategory,
  ensureNovaSplitFields,
  getNovaBalanceViews,
  normalizeNovaBalanceType,
  floorNovaPayout,
  floorNovaToHalf,
} from "./novaBalances.js";

export const CurrencyTypes = Object.freeze({
  STARDUST: "stardust",
  NOVA: "nova_crystals",
  FUEL: "fuel",
});

export { NovaBalanceTypes, floorNovaPayout, floorNovaToHalf, normalizeNovaBalanceType };

/** 1 display Nova = 2 half-units. */
export const NOVA_HALF_UNITS_PER_NOVA = 2;
export const ECONOMY_NOVA_SCALE = NOVA_HALF_UNITS_PER_NOVA;
const NOVA_PRECISION_EPSILON = 1e-9;
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const MISSION_SKIP_HALF_UNITS_PER_FUEL = 0.2;

/** Starting Nova for every new character (display). Per-character, not account-wide. */
export const STARTING_NOVA_DISPLAY = STARTING_NOVA;
export const STARTING_NOVA_HALF_UNITS = STARTING_NOVA_DISPLAY * NOVA_HALF_UNITS_PER_NOVA;
/** Starting Stardust for every new character. */
export const STARTING_STARDUST = PRODUCTION_STARTING_STARDUST;

export const CHARACTER_CREATION_NOVA_REASON = "character_creation_starting_nova";
export const CHARACTER_CREATION_STARDUST_REASON = "character_creation_starting_stardust";
export const CHARACTER_CREATION_CATEGORY = "character_creation";

/**
 * Atomically apply authoritative starting balances after Character.create.
 * Nova credited through the economy ledger (idempotent per character id).
 * Stardust remains 0 with an auditable init event.
 * Safe to call again on the same character — Nova grant will not double.
 */
export function applyCharacterCreationStartingGrant(user, character, opts = {}) {
  if (!character?.id) {
    const e = new Error("Character required for starting grant");
    e.status = 400;
    throw e;
  }
  const requestId = String(opts.requestId || "").trim();
  const idem = `character_creation_nova:${character.id}`;

  // Ensure stardust field is the authoritative zero before Nova credit.
  let live = character;
  if (readStardust(live) !== STARTING_STARDUST) {
    live = entities.Character.update(live.id, {
      stardust: STARTING_STARDUST,
      total_stardust_earned: Math.min(
        Number(live.total_stardust_earned) || 0,
        STARTING_STARDUST,
      ),
    });
  }

  if (user) {
    recordCurrencyChange({
      user,
      character: live,
      currencyType: CurrencyTypes.STARDUST,
      before: STARTING_STARDUST,
      after: STARTING_STARDUST,
      amount: 0,
      reasonCode: CHARACTER_CREATION_STARDUST_REASON,
      correlationId: newCorrelationId(),
      actorType: ActorTypes.SYSTEM,
      idempotencyKey: `character_creation_stardust:${live.id}`,
      reasonText: requestId
        ? `Character creation starting Stardust=0 (request_id=${requestId})`
        : "Character creation starting Stardust=0",
    });
  }

  const mut = creditNova({
    user,
    character: live,
    amount: STARTING_NOVA_DISPLAY,
    category: CHARACTER_CREATION_CATEGORY,
    reasonCode: CHARACTER_CREATION_NOVA_REASON,
    relatedEntityType: "character",
    relatedEntityId: live.id,
    idempotencyKey: idem,
    balanceType: NovaBalanceTypes.PROMOTIONAL,
  });

  return {
    character: mut.character,
    balances: mut.balances,
    nova_grant: mut.transaction,
    replay: !!mut.replay,
  };
}

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
  if (Math.abs(n * NOVA_HALF_UNITS_PER_NOVA - half) > NOVA_PRECISION_EPSILON) {
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

/** Patch fragment for a display-Nova debit (does not persist). Promo-first. */
export function novaDebitPatch(character, displayAmount) {
  const half = toNovaHalfUnits(displayAmount);
  const split = applyNovaSplitDelta(character, {
    direction: "debit",
    amountHalfUnits: half,
    debitPolicy: "any",
  });
  return split.patch;
}

/**
 * Patch fragment for a display-Nova credit (does not persist).
 * Defaults to promotional; pass balanceType for wagerable.
 */
export function novaCreditPatch(character, displayAmount, balanceType = NovaBalanceTypes.PROMOTIONAL) {
  const half = toNovaHalfUnits(displayAmount);
  const split = applyNovaSplitDelta(character, {
    direction: "credit",
    amountHalfUnits: half,
    balanceType,
  });
  return split.patch;
}

export function readStardust(character) {
  return clampStardust(character?.stardust || 0);
}

export function getBalances(character) {
  const views = getNovaBalanceViews(character);
  return {
    fuel: Number(character?.fuel) || 0,
    stardust: readStardust(character),
    nova_crystals: views.nova_crystals,
    nova_half_units: views.nova_half_units,
    nova_wagerable: views.nova_wagerable,
    nova_wagerable_half: views.nova_wagerable_half,
    nova_promotional: views.nova_promotional,
    nova_promotional_half: views.nova_promotional_half,
    nova_purchased: views.nova_purchased,
    nova_bonus: views.nova_bonus,
    economy_nova_scale: ECONOMY_NOVA_SCALE,
  };
}

export function hasWagerableNova(character, displayAmount) {
  try {
    const views = getNovaBalanceViews(character);
    return views.nova_wagerable_half >= toNovaHalfUnits(displayAmount);
  } catch {
    return false;
  }
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
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH || !/^[A-Za-z0-9:_-]+$/.test(key)) {
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
 * @param {string} [opts.balanceType] wagerable | promotional (default from category)
 * @returns {{ character, patch, transaction, balances, replay? }}
 */
export function creditNova(opts) {
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.NOVA,
    direction: "credit",
    amountHalfUnits: toNovaHalfUnits(opts.amount),
    balanceType: opts.balanceType || opts.balance_type,
  });
}

/**
 * Debit Nova (display Nova).
 * @param {string} [opts.balanceType] wagerable | promotional | omit for promo-first mixed
 * @param {string} [opts.debitPolicy] alias of balanceType for debits
 */
export function debitNova(opts) {
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.NOVA,
    direction: "debit",
    amountHalfUnits: toNovaHalfUnits(opts.amount),
    balanceType: opts.balanceType || opts.balance_type,
    debitPolicy: opts.debitPolicy || opts.debit_policy,
  });
}

/** Credit / debit using explicit half-units (preferred for skip formula). */
export function creditNovaHalfUnits(opts) {
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.NOVA,
    direction: "credit",
    amountHalfUnits: Math.max(0, Math.floor(Number(opts.amountHalfUnits) || 0)),
    balanceType: opts.balanceType || opts.balance_type,
  });
}

export function debitNovaHalfUnits(opts) {
  return mutateCurrency({
    ...opts,
    currency: CurrencyTypes.NOVA,
    direction: "debit",
    amountHalfUnits: Math.max(0, Math.floor(Number(opts.amountHalfUnits) || 0)),
    balanceType: opts.balanceType || opts.balance_type,
    debitPolicy: opts.debitPolicy || opts.debit_policy,
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
  balanceType = null,
  debitPolicy = null,
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

  let working = character;
  if (currency === CurrencyTypes.NOVA) {
    working = ensureNovaSplitFields(character);
  }

  const beforeBalances = getBalances(working);
  const patch = { ...extraPatch };
  let deltaDisplay = 0;
  let before = 0;
  let after = 0;
  let resolvedBalanceType = null;
  let beforeWagerable = null;
  let beforePromotional = null;
  let afterWagerable = null;
  let afterPromotional = null;

  if (currency === CurrencyTypes.NOVA) {
    const creditType =
      direction === "credit"
        ? normalizeNovaBalanceType(balanceType) ||
          defaultNovaBalanceTypeForCategory(category, reasonCode)
        : null;
    const split = applyNovaSplitDelta(working, {
      direction,
      amountHalfUnits,
      balanceType: creditType || balanceType,
      debitPolicy: debitPolicy || (direction === "debit" ? balanceType || "any" : null),
    });
    resolvedBalanceType = split.balance_type;
    beforeWagerable = split.before_wagerable;
    beforePromotional = split.before_promotional;
    Object.assign(patch, split.patch);
    before = beforeWagerable + beforePromotional;
    after = split.patch.nova_crystals;
    afterWagerable = split.patch.nova_wagerable_half;
    afterPromotional = split.patch.nova_promotional_half;
    if (!Number.isSafeInteger(after)) {
      const e = new Error("Nova balance overflow");
      e.status = 400;
      e.code = "NOVA_OVERFLOW";
      throw e;
    }
    deltaDisplay = fromNovaHalfUnits(Math.abs(amountHalfUnits));
  } else if (currency === CurrencyTypes.STARDUST) {
    before = readStardust(working);
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
      patch.total_stardust_earned = (working.total_stardust_earned || 0) + delta;
    }
    deltaDisplay = Math.abs(delta);
  } else {
    const e = new Error("Unsupported currency");
    e.status = 400;
    throw e;
  }

  const updated = entities.Character.update(working.id, patch);
  const txId = key || `tx_${clock.nowMs()}_${Math.floor(Math.random() * 1e6)}`;
  const transaction = {
    transaction_id: txId,
    category: category || opType,
    currency,
    currency_type: currency === CurrencyTypes.NOVA ? "nova" : currency,
    balance_type: resolvedBalanceType,
    source: category || "economy",
    destination: relatedEntityType || "character_wallet",
    direction,
    amount: deltaDisplay,
    rounded_amount: deltaDisplay,
    amount_half_units: currency === CurrencyTypes.NOVA ? Math.abs(amountHalfUnits) : null,
    balance_before: currency === CurrencyTypes.NOVA ? fromNovaHalfUnits(before) : before,
    balance_after: currency === CurrencyTypes.NOVA ? fromNovaHalfUnits(after) : after,
    balance_before_half_units: currency === CurrencyTypes.NOVA ? before : null,
    balance_after_half_units: currency === CurrencyTypes.NOVA ? after : null,
    wagerable_before: beforeWagerable != null ? fromNovaHalfUnits(beforeWagerable) : null,
    wagerable_after: afterWagerable != null ? fromNovaHalfUnits(afterWagerable) : null,
    promotional_before: beforePromotional != null ? fromNovaHalfUnits(beforePromotional) : null,
    promotional_after: afterPromotional != null ? fromNovaHalfUnits(afterPromotional) : null,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
    character_id: working.id,
    request_id: key || null,
    reason: reasonCode || category || opType,
    reason_code: reasonCode || category || opType,
    status: "COMPLETED",
    created_at: clock.nowIso(),
    timestamp: clock.nowIso(),
  };

  if (key) saveLedgerReceipt(accountId, opType, key, transaction);

  if (!skipAudit && user) {
    recordCurrencyChange({
      user,
      character: working,
      currencyType: currency === CurrencyTypes.NOVA ? "nova_crystals" : "stardust",
      before: currency === CurrencyTypes.NOVA ? fromNovaHalfUnits(before) : before,
      after: currency === CurrencyTypes.NOVA ? fromNovaHalfUnits(after) : after,
      amount: direction === "credit" ? deltaDisplay : -deltaDisplay,
      reasonCode: reasonCode || category || opType,
      source: category || "economy",
      correlationId: newCorrelationId(),
      actorType: ActorTypes.PLAYER,
      idempotencyKey: key || undefined,
      reasonText: resolvedBalanceType
        ? `balance_type=${resolvedBalanceType}`
        : undefined,
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
  return Math.max(1, Math.ceil(fuel * MISSION_SKIP_HALF_UNITS_PER_FUEL));
}

export function missionSkipCostDisplay(fuelCost) {
  return fromNovaHalfUnits(missionSkipCostHalfUnits(fuelCost));
}

/** Finalized Nova package catalog (display Nova grants). */
export const NOVA_PACKAGES = Object.freeze({
  pack_2: {
    id: "pack_2",
    name: "Signal Shard",
    crystals: 275,
    price_label: "$1.99",
    usd_hint: 1.99,
  },
  pack_5: {
    id: "pack_5",
    name: "Ember Pouch",
    crystals: 850,
    price_label: "$4.99",
    usd_hint: 4.99,
  },
  pack_10: {
    id: "pack_10",
    name: "Cosmic Cluster",
    crystals: 1950,
    price_label: "$9.99",
    usd_hint: 9.99,
  },
  pack_20: {
    id: "pack_20",
    name: "Stellar Vault",
    crystals: 4500,
    price_label: "$19.99",
    usd_hint: 19.99,
  },
  pack_50: {
    id: "pack_50",
    name: "Void Motherlode",
    crystals: 12750,
    price_label: "$49.99",
    usd_hint: 49.99,
  },
  pack_100: {
    id: "pack_100",
    name: "Hypernova Cache",
    crystals: 30000,
    price_label: "$99.99",
    usd_hint: 99.99,
  },
  // Legacy aliases → nearest finalized pack (dev catalog continuity)
  pouch: {
    id: "pack_5",
    name: "Ember Pouch",
    crystals: 850,
    price_label: "$4.99",
    usd_hint: 4.99,
    alias_of: "pack_5",
  },
  cluster: {
    id: "pack_10",
    name: "Cosmic Cluster",
    crystals: 1950,
    price_label: "$9.99",
    usd_hint: 9.99,
    alias_of: "pack_10",
  },
  vault: {
    id: "pack_20",
    name: "Stellar Vault",
    crystals: 4500,
    price_label: "$19.99",
    usd_hint: 19.99,
    alias_of: "pack_20",
  },
  motherlode: {
    id: "pack_50",
    name: "Void Motherlode",
    crystals: 12750,
    price_label: "$49.99",
    usd_hint: 49.99,
    alias_of: "pack_50",
  },
});

export function resolveNovaPackage(packId) {
  const id = String(packId || "").trim();
  const pack = NOVA_PACKAGES[id];
  if (!pack) return null;
  // Normalize aliases to canonical id
  const canonical = NOVA_PACKAGES[pack.id] || pack;
  return { ...canonical };
}
