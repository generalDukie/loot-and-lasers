/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 2 LIVE FOR GEAR BUDGET / SLOT / RESALE REFS
 * Stat allocation remains in itemGeneration.GenerateGearItem (canonical generator).
 */
import { roundHalfUp } from "./rounding.js";
import {
  ATTR_COST_HORNER,
  ATTR_COST_LOG_OFFSET,
  ATTR_INTRO_PURCHASE_COUNT,
  ATTR_INTRO_PURCHASE_COSTS,
  GEAR_BUDGET_CURVE,
  GEAR_BUDGET_FLOOR,
  GEAR_BUDGET_LINEAR,
  GEAR_ORIGINS,
  GEAR_RARITY_BUDGET_MULT,
  GEAR_RARITY_BUDGET_MULT_BY_INDEX,
  GEAR_RARITY_BUDGET_MULT_DEFAULT,
  GEAR_SLOT_ALIASES,
  GEAR_SLOT_NORMAL_MULT,
  GEAR_SLOT_PREMIUM_MULT,
  GEAR_SLOTS,
  PREMIUM_GEAR_SLOT_INDICES,
  PREMIUM_GEAR_SLOTS,
  PVE_HIDDEN_BUDGET_OFFSET,
  PVE_HIDDEN_BUDGET_OFFSET_MATURE,
  SHIPMENT_ELIGIBLE_ORIGINS,
  SHIPMENT_INELIGIBLE_ORIGINS,
} from "./constants.js";

function levelInt(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

function purchaseInt(n) {
  return Math.max(1, Math.floor(Number(n) || 1));
}

/** ROUND(GEAR_BUDGET_LINEAR*L + GEAR_BUDGET_CURVE*sqrt(L) + GEAR_BUDGET_FLOOR) */
export function gearBaseStatBudget(level) {
  const L = levelInt(level);
  return Math.max(1, roundHalfUp(GEAR_BUDGET_LINEAR * L + GEAR_BUDGET_CURVE * Math.sqrt(L) + GEAR_BUDGET_FLOOR));
}

export function canonicalGearSlot(slot) {
  const key = String(slot || "").toLowerCase().replace(/\s+/g, "_");
  const mapped = GEAR_SLOT_ALIASES[key] || key;
  if (GEAR_SLOTS.includes(mapped)) return mapped;
  return null;
}

export function gearSlotMultiplier(slot) {
  const key = canonicalGearSlot(slot) || String(slot || "").toLowerCase().replace(/\s+/g, "_");
  if (PREMIUM_GEAR_SLOTS.includes(key) || PREMIUM_GEAR_SLOT_INDICES.includes(slot)) return GEAR_SLOT_PREMIUM_MULT;
  return GEAR_SLOT_NORMAL_MULT;
}

export function canonicalGearOrigin(origin) {
  const key = String(origin || "").toLowerCase();
  if (GEAR_ORIGINS.includes(key)) return key;
  return null;
}

/** null = not yet classified (Phase 9 / source phase). No gameplay effect in Phase 2. */
export function defaultShipmentEligible(origin) {
  const key = canonicalGearOrigin(origin);
  if (!key || key === "unassigned") return null;
  if (SHIPMENT_INELIGIBLE_ORIGINS.includes(key)) return false;
  if (SHIPMENT_ELIGIBLE_ORIGINS.includes(key)) return true;
  return null;
}

/**
 * Separate economic/display level from hidden PvE stat-budget reference.
 * Callers must opt into the PvE offset; Mission/Dungeon/Wormhole do not in Phase 2.
 */
export function resolveGearLevelRefs({
  economicLevel,
  itemLevel,
  statBudgetLevel,
  playerLevel,
  applyPveHiddenBudgetOffset = false,
} = {}) {
  const economic = levelInt(economicLevel ?? itemLevel);
  if (statBudgetLevel != null) {
    return { economicLevel: economic, statBudgetLevel: levelInt(statBudgetLevel) };
  }
  if (applyPveHiddenBudgetOffset) {
    const pveL = playerLevel != null ? levelInt(playerLevel) : economic;
    return { economicLevel: economic, statBudgetLevel: pveGearStatBudgetLevel(pveL) };
  }
  return { economicLevel: economic, statBudgetLevel: economic };
}

export function gearRarityBudgetMultiplier(rarity) {
  if (typeof rarity === "number") {
    return GEAR_RARITY_BUDGET_MULT_BY_INDEX[rarity] ?? GEAR_RARITY_BUDGET_MULT_DEFAULT;
  }
  return GEAR_RARITY_BUDGET_MULT[rarity] ?? GEAR_RARITY_BUDGET_MULT_DEFAULT;
}

export function gearStatPool(itemLevel, slot, rarity) {
  return Math.max(
    1,
    roundHalfUp(
      gearBaseStatBudget(Math.max(1, itemLevel))
      * gearSlotMultiplier(slot)
      * gearRarityBudgetMultiplier(rarity),
    ),
  );
}

/**
 * PvE hidden stat-budget offset. Discrete. Affects Gear STAT BUDGET reference only.
 * Does not raise economic item level, resale level, or Market price level.
 */
export function pveHiddenStatBudgetOffset(playerLevel) {
  const L = levelInt(playerLevel);
  for (const row of PVE_HIDDEN_BUDGET_OFFSET) {
    if (L <= row.maxLevel) return row.offset;
  }
  return PVE_HIDDEN_BUDGET_OFFSET_MATURE;
}

export function pveGearStatBudgetLevel(playerLevel) {
  return levelInt(playerLevel) + pveHiddenStatBudgetOffset(playerLevel);
}

/**
 * Certified attrcost(n) = max(1, rround(exp(Horner(log(max(1,n)+20))))).
 * Unchanged Horner curve. Do not call this as the live per-stat purchase price.
 */
export function attributePurchaseCost(purchaseNumber) {
  const n = purchaseInt(purchaseNumber);
  const z = Math.log(n + ATTR_COST_LOG_OFFSET);
  let v = 0;
  for (const q of ATTR_COST_HORNER) v = v * z + q;
  return Math.max(1, roundHalfUp(Math.exp(v)));
}

/**
 * Live Stardust price for the Nth purchase of one attribute.
 * Each stat has an independent purchase count. Purchases 1–5 of that stat use
 * a discrete intro table; purchase 6+ is certified attrcost(N - 5).
 * The curve itself is not shifted.
 */
export function permanentAttributePurchaseCost(purchaseNumber) {
  const n = purchaseInt(purchaseNumber);
  if (n <= ATTR_INTRO_PURCHASE_COUNT) {
    return ATTR_INTRO_PURCHASE_COSTS[n - 1];
  }
  return attributePurchaseCost(n - ATTR_INTRO_PURCHASE_COUNT);
}
