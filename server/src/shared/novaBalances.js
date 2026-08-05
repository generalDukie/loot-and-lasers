/**
 * Wagerable vs Promotional Nova Crystal balance helpers.
 * Storage: integer half-units (1 Nova = 2). Total nova_crystals = wagerable + promotional.
 *
 * Intentionally does not import currencyService (avoids cycles).
 */
import { db } from "../db.js";
import { entities } from "../entities.js";

export const NOVA_HALF_UNITS_PER_NOVA = 2;
export const ECONOMY_NOVA_SCALE = 2;

export const NovaBalanceTypes = Object.freeze({
  WAGERABLE: "wagerable",
  PROMOTIONAL: "promotional",
});

export const NOVA_DUAL_BALANCE_META = "nova_dual_balance_v1";

export function fromNovaHalfUnits(halfUnits) {
  return Math.max(0, Math.floor(Number(halfUnits) || 0)) / NOVA_HALF_UNITS_PER_NOVA;
}

export function toNovaHalfUnits(displayNova) {
  const n = Number(displayNova);
  if (!Number.isFinite(n) || n < 0) {
    const e = new Error("Invalid Nova amount");
    e.status = 400;
    e.code = "INVALID_NOVA_AMOUNT";
    throw e;
  }
  const half = Math.round(n * NOVA_HALF_UNITS_PER_NOVA);
  if (Math.abs(n * NOVA_HALF_UNITS_PER_NOVA - half) > 1e-9) {
    const e = new Error("Nova amount must end in .0 or .5");
    e.status = 400;
    e.code = "INVALID_NOVA_PRECISION";
    throw e;
  }
  return half;
}

export function normalizeNovaBalanceType(raw, { required = false } = {}) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "wagerable" || v === "purchased" || v === "paid") {
    return NovaBalanceTypes.WAGERABLE;
  }
  if (v === "promotional" || v === "promo" || v === "bonus" || v === "non_wagerable") {
    return NovaBalanceTypes.PROMOTIONAL;
  }
  if (required) {
    const e = new Error("Nova balance_type must be wagerable or promotional");
    e.status = 400;
    e.code = "INVALID_NOVA_BALANCE_TYPE";
    throw e;
  }
  return null;
}

/** Round display Nova DOWN to nearest 0.5. */
export function floorNovaToHalf(display) {
  const n = Number(display);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n * NOVA_HALF_UNITS_PER_NOVA) / NOVA_HALF_UNITS_PER_NOVA;
}

/** Gross payout for Nova casino: FLOOR_TO_0.5(wager × mult). */
export function floorNovaPayout(wagerDisplay, mult) {
  const w = Number(wagerDisplay);
  const m = Number(mult);
  if (!Number.isFinite(w) || !Number.isFinite(m) || w <= 0 || m <= 0) return 0;
  return floorNovaToHalf(w * m);
}

export function readTotalNovaHalf(character) {
  return Math.max(0, Math.floor(Number(character?.nova_crystals) || 0));
}

export function readWagerableHalf(character) {
  if (character?.nova_wagerable_half != null) {
    return Math.max(0, Math.floor(Number(character.nova_wagerable_half) || 0));
  }
  return 0;
}

export function readPromotionalHalf(character) {
  if (character?.nova_promotional_half != null) {
    return Math.max(0, Math.floor(Number(character.nova_promotional_half) || 0));
  }
  return 0;
}

export function novaSplitPatch(wagerableHalf, promotionalHalf) {
  const w = Math.max(0, Math.floor(Number(wagerableHalf) || 0));
  const p = Math.max(0, Math.floor(Number(promotionalHalf) || 0));
  return {
    nova_wagerable_half: w,
    nova_promotional_half: p,
    nova_crystals: w + p,
    economy_nova_scale: ECONOMY_NOVA_SCALE,
    nova_dual_balance_v1: true,
  };
}

/**
 * Evidence-based migration for one character.
 * Explicit pack grants tied to this character → wagerable (capped by total).
 * Remainder → promotional. Uncertain totals without pack evidence → all promotional
 * (documented via nova_migration_classification — never silently all-purchased).
 */
export function migrateCharacterNovaSplit(character, { force = false } = {}) {
  if (!character?.id) return character;
  if (!force && character.nova_dual_balance_v1) {
    return character;
  }
  // Do not persist when the Character row is missing (stubs / unit fixtures).
  if (!entities.Character.get(character.id)) {
    const total = readTotalNovaHalf(character);
    return {
      ...character,
      nova_wagerable_half: 0,
      nova_promotional_half: total,
      nova_dual_balance_v1: true,
      nova_migration_classification: "stub_promotional",
    };
  }

  const total = readTotalNovaHalf(character);
  let evidencedWagerable = 0;

  try {
    const rows = db.prepare(`
      SELECT result_json FROM wallet_operations
      WHERE operation_type = 'econ_credit_nova_crystals'
    `).all();
    for (const row of rows) {
      let tx;
      try {
        tx = JSON.parse(row.result_json || "{}");
      } catch {
        continue;
      }
      if (tx.category !== "nova_pack_grant" && tx.balance_type !== "wagerable") {
        continue;
      }
      if (tx.category === "nova_pack_grant" || String(tx.reason_code || "").includes("nova_pack")) {
        if (tx.related_entity_id && tx.related_entity_id !== character.id) continue;
        if (tx.character_id && tx.character_id !== character.id) continue;
        // Only attribute when character is explicitly linked.
        if (tx.related_entity_id !== character.id && tx.character_id !== character.id) continue;
        const half =
          Number(tx.amount_half_units) ||
          Math.round((Number(tx.amount) || 0) * NOVA_HALF_UNITS_PER_NOVA);
        if (half > 0) evidencedWagerable += half;
      }
    }
  } catch {
    evidencedWagerable = 0;
  }

  const wagerable = Math.min(total, Math.max(0, evidencedWagerable));
  const promotional = Math.max(0, total - wagerable);
  const classification =
    evidencedWagerable > 0
      ? wagerable < total
        ? "pack_evidence_remainder_promotional"
        : "pack_evidence_full"
      : total > 0
        ? "uncertain_remainder_as_promotional"
        : "empty";

  return entities.Character.update(character.id, {
    ...novaSplitPatch(wagerable, promotional),
    nova_migration_classification: classification,
  });
}

export function ensureNovaSplitFields(character) {
  if (!character?.id) return character;
  if (
    character.nova_dual_balance_v1 &&
    character.nova_wagerable_half != null &&
    character.nova_promotional_half != null
  ) {
    const total = readTotalNovaHalf(character);
    let w = readWagerableHalf(character);
    let p = readPromotionalHalf(character);
    if (w + p === total) return character;
    // Legacy / test patches that only set nova_crystals — repair split.
    w = Math.min(w, total);
    p = Math.max(0, total - w);
    if (!entities.Character.get(character.id)) {
      return { ...character, ...novaSplitPatch(w, p) };
    }
    return entities.Character.update(character.id, novaSplitPatch(w, p));
  }
  return migrateCharacterNovaSplit(character);
}

export function getNovaBalanceViews(character) {
  if (!character?.id) {
    const total = readTotalNovaHalf(character);
    return {
      character,
      nova_crystals: fromNovaHalfUnits(total),
      nova_half_units: total,
      nova_wagerable: 0,
      nova_wagerable_half: 0,
      nova_promotional: fromNovaHalfUnits(total),
      nova_promotional_half: total,
      nova_purchased: 0,
      nova_bonus: fromNovaHalfUnits(total),
      economy_nova_scale: ECONOMY_NOVA_SCALE,
    };
  }
  let live = character;
  try {
    live = ensureNovaSplitFields(character);
  } catch {
    // Read-only / stub characters (tests, missing rows): derive without persisting.
    const total = readTotalNovaHalf(character);
    const w = readWagerableHalf(character);
    const p = character.nova_promotional_half != null ? readPromotionalHalf(character) : Math.max(0, total - w);
    return {
      character,
      nova_crystals: fromNovaHalfUnits(total),
      nova_half_units: total,
      nova_wagerable: fromNovaHalfUnits(w),
      nova_wagerable_half: w,
      nova_promotional: fromNovaHalfUnits(p),
      nova_promotional_half: p,
      nova_purchased: fromNovaHalfUnits(w),
      nova_bonus: fromNovaHalfUnits(p),
      economy_nova_scale: ECONOMY_NOVA_SCALE,
    };
  }
  let w = readWagerableHalf(live);
  let p = readPromotionalHalf(live);
  const total = readTotalNovaHalf(live);
  // Defend against legacy patches that touch only nova_crystals.
  if (w + p !== total) {
    w = Math.min(w, total);
    p = Math.max(0, total - w);
    if (live.nova_dual_balance_v1 && entities.Character.get(live.id)) {
      live = entities.Character.update(live.id, novaSplitPatch(w, p));
    }
  }
  return {
    character: live,
    nova_crystals: fromNovaHalfUnits(total),
    nova_half_units: total,
    nova_wagerable: fromNovaHalfUnits(w),
    nova_wagerable_half: w,
    nova_promotional: fromNovaHalfUnits(p),
    nova_promotional_half: p,
    nova_purchased: fromNovaHalfUnits(w),
    nova_bonus: fromNovaHalfUnits(p),
    economy_nova_scale: ECONOMY_NOVA_SCALE,
  };
}

export function defaultNovaBalanceTypeForCategory(category, reasonCode) {
  const c = String(category || "");
  const r = String(reasonCode || "");
  if (c === "nova_pack_grant" || c === "admin_purchased") return NovaBalanceTypes.WAGERABLE;
  if (c === "casino_payout") return NovaBalanceTypes.WAGERABLE;
  if (r === "admin_grant_wagerable" || r.includes("nova_pack")) return NovaBalanceTypes.WAGERABLE;
  if (c === "casino_wager") return NovaBalanceTypes.WAGERABLE;
  return NovaBalanceTypes.PROMOTIONAL;
}

/**
 * Apply a credit/debit against split buckets.
 * debitPolicy:
 *  - 'wagerable' — only purchased (casino)
 *  - 'promotional' — only bonus
 *  - 'any' — promotional first, then wagerable (gameplay sinks)
 */
export function applyNovaSplitDelta(character, {
  direction,
  amountHalfUnits,
  balanceType,
  debitPolicy = null,
}) {
  const live = ensureNovaSplitFields(character);
  let w = readWagerableHalf(live);
  let p = readPromotionalHalf(live);
  const amount = Math.max(0, Math.floor(Number(amountHalfUnits) || 0));

  if (direction === "credit") {
    const bt = normalizeNovaBalanceType(balanceType, { required: true });
    if (bt === NovaBalanceTypes.WAGERABLE) w += amount;
    else p += amount;
    return {
      character: live,
      before_wagerable: readWagerableHalf(live),
      before_promotional: readPromotionalHalf(live),
      patch: novaSplitPatch(w, p),
      balance_type: bt,
    };
  }

  // debit
  const policy = debitPolicy || balanceType || "any";
  const beforeW = w;
  const beforeP = p;

  if (policy === NovaBalanceTypes.WAGERABLE || policy === "wagerable") {
    if (w < amount) {
      const e = new Error("Not enough Wagerable Nova. Purchased Nova is required for Casino wagers.");
      e.status = 400;
      e.code = "INSUFFICIENT_WAGERABLE_NOVA";
      throw e;
    }
    w -= amount;
    return {
      character: live,
      before_wagerable: beforeW,
      before_promotional: beforeP,
      patch: novaSplitPatch(w, p),
      balance_type: NovaBalanceTypes.WAGERABLE,
    };
  }

  if (policy === NovaBalanceTypes.PROMOTIONAL || policy === "promotional") {
    if (p < amount) {
      const e = new Error("Not enough Promotional Nova");
      e.status = 400;
      e.code = "INSUFFICIENT_PROMOTIONAL_NOVA";
      throw e;
    }
    p -= amount;
    return {
      character: live,
      before_wagerable: beforeW,
      before_promotional: beforeP,
      patch: novaSplitPatch(w, p),
      balance_type: NovaBalanceTypes.PROMOTIONAL,
    };
  }

  // any: promo first, then wagerable
  if (w + p < amount) {
    const e = new Error("Not enough Nova Crystals");
    e.status = 400;
    e.code = "INSUFFICIENT_NOVA";
    throw e;
  }
  let left = amount;
  const fromPromo = Math.min(p, left);
  p -= fromPromo;
  left -= fromPromo;
  w -= left;
  return {
    character: live,
    before_wagerable: beforeW,
    before_promotional: beforeP,
    patch: novaSplitPatch(w, p),
    balance_type: fromPromo === amount ? NovaBalanceTypes.PROMOTIONAL : "mixed",
  };
}
