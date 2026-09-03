/**
 * AUTHORITATIVE FORMULA MODULE — PHASE 9 COMPANIES / SHIPMENTS / COMMISSIONS
 * Canonical company identities, Shipment math, token rotation, Commission allocation.
 */
import { roundHalfUp } from "./rounding.js";
import { canonicalGearSlot } from "./gear.js";
import {
  BASIS_POINTS_DENOMINATOR,
  CANONICAL_GEAR_STAT_KEYS,
  COMMISSION_EPIC_STAT_LUCK,
  COMMISSION_EPIC_STAT_VITALITY,
  COMPANY_ABBREVIATIONS,
  COMPANY_FLAVOR_CHANCE_BPS,
  COMPANY_FLAVOR_LINES,
  COMPANY_FULL_NAMES,
  COMPANY_IDS,
  COMPANY_NAME_TOKENS,
  COMPANY_REPUTATION_PER_LEVEL,
  COMPANY_SLOTS,
  COMPANY_TOKEN_EPIC_OFFSET,
  EPIC_COMMISSION_LUCK_PERCENT,
  EPIC_COMMISSION_PRIMARY_PERCENT,
  EPIC_COMMISSION_RANDOM_REMAINDER_PERCENT,
  EPIC_COMMISSION_VITALITY_PERCENT,
  MARKET_COMPANIES_PER_SLOT,
  PERCENT_DENOMINATOR,
  RARE_COMMISSION_STAT_COUNT,
  RARE_COMMISSION_WEIGHT_MAX_PERCENT,
  RARE_COMMISSION_WEIGHT_MIN_PERCENT,
  RARE_COMMISSION_WEIGHT_TOTAL_PERCENT,
  SHIPMENT_ITEM_COUNT,
  SHIPMENT_PAYOUT_BPS,
  SHIPMENT_REPUTATION_REWARD,
  SLOT_ELIGIBLE_COMPANIES,
  TOKEN_RARITY_EPIC,
  TOKEN_RARITY_RARE,
  TOKEN_ROTATION_PERIOD,
} from "./constants.js";

const MIN_RANDOM_ALLOCATION_WEIGHT = 1e-12;

function requireRng(rng, label) {
  if (typeof rng !== "function") {
    const err = new Error(`${label} requires an injected RNG`);
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return rng;
}

function unitHalfOpen(rng) {
  const u = Number(rng());
  if (!Number.isFinite(u) || u < 0) return 0;
  if (u >= 1) return 1 - Number.EPSILON;
  return u;
}

export function isCompanyId(companyId) {
  return COMPANY_IDS.includes(String(companyId || ""));
}

export function companyDefinition(companyId) {
  const id = String(companyId || "");
  if (!isCompanyId(id)) return null;
  return {
    id,
    name: COMPANY_FULL_NAMES[id],
    abbreviation: COMPANY_ABBREVIATIONS[id],
    slots: [...(COMPANY_SLOTS[id] || [])],
  };
}

export function allCompanyDefinitions() {
  return COMPANY_IDS.map((id) => companyDefinition(id));
}

export function companiesForSlot(slot) {
  const key = canonicalGearSlot(slot) || String(slot || "").toLowerCase();
  return SLOT_ELIGIBLE_COMPANIES[key] || Object.freeze([]);
}

export function companyManufacturesSlot(companyId, slot) {
  const id = String(companyId || "");
  const key = canonicalGearSlot(slot);
  if (!isCompanyId(id) || !key) return false;
  return (COMPANY_SLOTS[id] || []).includes(key);
}

export function rollManufacturerForSlot(slot, rng) {
  const r = requireRng(rng, "rollManufacturerForSlot");
  const companies = companiesForSlot(slot);
  if (!companies.length) return null;
  const idx = Math.min(
    MARKET_COMPANIES_PER_SLOT - 1,
    Math.floor(unitHalfOpen(r) * companies.length),
  );
  return companies[idx];
}

export function resolveGearManufacturer(slot, { manufacturer = null, rng } = {}) {
  const key = canonicalGearSlot(slot);
  if (!key) return null;
  if (manufacturer != null && String(manufacturer).trim() !== "") {
    const id = String(manufacturer).trim();
    if (!companyManufacturesSlot(id, key)) {
      const err = new Error("Company does not manufacture that slot");
      err.status = 400;
      err.code = "INVALID_COMPANY_SLOT";
      throw err;
    }
    return id;
  }
  return rollManufacturerForSlot(key, typeof rng === "function" ? rng : Math.random);
}

export function companyNameToken(companyId) {
  const id = String(companyId || "");
  return COMPANY_NAME_TOKENS[id] || "";
}

export function brandedGearName(baseName, manufacturer) {
  const token = companyNameToken(manufacturer);
  const base = String(baseName || "").trim();
  if (!token) return base;
  if (!base) return token;
  return `${token} ${base}`;
}

export function rollCompanyFlavor(manufacturer, rng) {
  const lines = COMPANY_FLAVOR_LINES[String(manufacturer || "")];
  if (!lines || !lines.length) return "";
  const r = requireRng(rng, "rollCompanyFlavor");
  const roll = Math.floor(unitHalfOpen(r) * BASIS_POINTS_DENOMINATOR);
  if (roll >= COMPANY_FLAVOR_CHANCE_BPS) return "";
  const idx = Math.min(
    lines.length - 1,
    Math.floor((roll * lines.length) / COMPANY_FLAVOR_CHANCE_BPS),
  );
  return lines[idx];
}

export function applyGearCompanyPresentation(item, { baseName, rng } = {}) {
  const next = { ...item };
  const base = String(baseName || next.base_name || "").trim();
  next.base_name = base;
  next.name = brandedGearName(base, next.manufacturer);
  const flavor = typeof rng === "function" ? rollCompanyFlavor(next.manufacturer, rng) : "";
  if (flavor) next.company_flavor = flavor;
  else delete next.company_flavor;
  return next;
}

export function shipmentPayoutFromBase(baseValue) {
  const base = Math.max(0, Math.floor(Number(baseValue) || 0));
  const payout = roundHalfUp((base * SHIPMENT_PAYOUT_BPS) / BASIS_POINTS_DENOMINATOR);
  return {
    base_value: base,
    bonus: payout - base,
    payout,
    item_count: SHIPMENT_ITEM_COUNT,
    reputation: SHIPMENT_REPUTATION_REWARD,
  };
}

export function companyLevelFromReputation(reputation) {
  const rep = Math.max(0, Math.floor(Number(reputation) || 0));
  return Math.floor(rep / COMPANY_REPUTATION_PER_LEVEL);
}

export function reputationIntoCurrentLevel(reputation) {
  const rep = Math.max(0, Math.floor(Number(reputation) || 0));
  return rep % COMPANY_REPUTATION_PER_LEVEL;
}

export function reputationToNextLevel(reputation) {
  const into = reputationIntoCurrentLevel(reputation);
  return COMPANY_REPUTATION_PER_LEVEL - into;
}

export function tokenRarityForCompanyLevel(companyId, level) {
  const id = String(companyId || "");
  const L = Math.floor(Number(level) || 0);
  if (!isCompanyId(id) || L < 1) return null;
  const offset = COMPANY_TOKEN_EPIC_OFFSET[id];
  if (((L - 1) % TOKEN_ROTATION_PERIOD) === offset) return TOKEN_RARITY_EPIC;
  return TOKEN_RARITY_RARE;
}

export function nextTokenRarity(companyId, currentLevel) {
  return tokenRarityForCompanyLevel(companyId, Math.floor(Number(currentLevel) || 0) + 1);
}

export function levelsAwardedByReputation(previousReputation, nextReputation) {
  const prev = companyLevelFromReputation(previousReputation);
  const next = companyLevelFromReputation(nextReputation);
  const levels = [];
  for (let L = prev + 1; L <= next; L += 1) levels.push(L);
  return levels;
}

function httpErr(message, code) {
  const err = new Error(message);
  err.status = 400;
  err.code = code || "VALIDATION_ERROR";
  throw err;
}

export function normalizeRareCommissionWeights(rawWeights) {
  const source = rawWeights && typeof rawWeights === "object" ? rawWeights : {};
  const selected = CANONICAL_GEAR_STAT_KEYS.filter((key) => {
    const n = Number(source[key]);
    return Number.isFinite(n) && n > 0;
  });
  if (selected.length !== RARE_COMMISSION_STAT_COUNT) {
    httpErr("Rare Commissions require exactly three distinct stats", "INVALID_COMMISSION_STATS");
  }
  const unique = new Set(selected);
  if (unique.size !== RARE_COMMISSION_STAT_COUNT) {
    httpErr("Rare Commission stats must be distinct", "INVALID_COMMISSION_STATS");
  }
  let total = 0;
  const percents = {};
  for (const key of selected) {
    const n = Number(source[key]);
    if (!Number.isInteger(n)) {
      httpErr("Rare Commission weights must be whole percentages", "INVALID_COMMISSION_WEIGHTS");
    }
    if (n < RARE_COMMISSION_WEIGHT_MIN_PERCENT || n > RARE_COMMISSION_WEIGHT_MAX_PERCENT) {
      httpErr("Rare Commission weights must be between 20% and 60%", "INVALID_COMMISSION_WEIGHTS");
    }
    percents[key] = n;
    total += n;
  }
  if (total !== RARE_COMMISSION_WEIGHT_TOTAL_PERCENT) {
    httpErr("Rare Commission weights must total 100%", "INVALID_COMMISSION_WEIGHTS");
  }
  return percents;
}

/**
 * Largest-remainder allocation in canonical attribute order.
 * Equal fractional parts award the earlier canonical index first.
 */
export function allocateBudgetByPercents(budget, percentByStat) {
  const total = Math.max(0, Math.round(Number(budget) || 0));
  const stats = Object.fromEntries(CANONICAL_GEAR_STAT_KEYS.map((k) => [k, 0]));
  const keys = CANONICAL_GEAR_STAT_KEYS.filter((k) => (Number(percentByStat[k]) || 0) > 0);
  if (!keys.length || total <= 0) return stats;
  const raw = keys.map((k) => (total * Number(percentByStat[k])) / PERCENT_DENOMINATOR);
  const floors = raw.map((x) => Math.trunc(x));
  let rem = total - floors.reduce((s, n) => s + n, 0);
  const order = [...keys.keys()].sort((i, j) => {
    const fi = raw[i] - floors[i];
    const fj = raw[j] - floors[j];
    if (fj !== fi) return fj - fi;
    return i - j;
  });
  for (let k = 0; k < rem; k += 1) floors[order[k]] += 1;
  keys.forEach((key, i) => {
    stats[key] = floors[i];
  });
  return stats;
}

export function allocateRareCommissionStats(budget, rawWeights) {
  const percents = normalizeRareCommissionWeights(rawWeights);
  const stats = allocateBudgetByPercents(budget, percents);
  const sum = CANONICAL_GEAR_STAT_KEYS.reduce((s, k) => s + stats[k], 0);
  if (sum !== Math.max(0, Math.round(Number(budget) || 0))) {
    httpErr("Commission budget was not conserved", "COMMISSION_BUDGET_MISMATCH");
  }
  return stats;
}

function epicIntegerFloor(budget, percent) {
  return Math.floor((Math.max(0, Math.round(Number(budget) || 0)) * percent) / PERCENT_DENOMINATOR);
}

function splitRemainderNormalized(count, leftover, rng) {
  const extras = new Array(count).fill(0);
  if (leftover <= 0 || count <= 0) return extras;
  const r = requireRng(rng, "epicCommissionRemainder");
  const raw = extras.map(() => Math.max(MIN_RANDOM_ALLOCATION_WEIGHT, Number(r()) || 0));
  const wSum = raw.reduce((a, b) => a + b, 0) || 1;
  const exact = raw.map((w) => leftover * (w / wSum));
  const floors = exact.map((x) => Math.floor(x));
  let rem = leftover - floors.reduce((a, b) => a + b, 0);
  const byFrac = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let i = 0; i < count; i += 1) extras[i] = floors[i];
  for (let k = 0; k < rem; k += 1) extras[byFrac[k % count].i] += 1;
  return extras;
}

export function allocateEpicCommissionStats(budget, primaryStat, rng) {
  const total = Math.max(0, Math.round(Number(budget) || 0));
  const primary = String(primaryStat || "");
  if (!CANONICAL_GEAR_STAT_KEYS.includes(primary)) {
    httpErr("Epic Commission requires a class primary stat", "INVALID_COMMISSION_PRIMARY");
  }
  const keys = [primary, COMMISSION_EPIC_STAT_VITALITY, COMMISSION_EPIC_STAT_LUCK];
  const unique = new Set(keys);
  if (unique.size !== keys.length) {
    httpErr("Epic Commission stats collapsed", "INVALID_COMMISSION_PRIMARY");
  }
  const floorP = epicIntegerFloor(total, EPIC_COMMISSION_PRIMARY_PERCENT);
  const floorV = epicIntegerFloor(total, EPIC_COMMISSION_VITALITY_PERCENT);
  const floorL = epicIntegerFloor(total, EPIC_COMMISSION_LUCK_PERCENT);
  const remainderShare = Math.max(
    0,
    roundHalfUp((total * EPIC_COMMISSION_RANDOM_REMAINDER_PERCENT) / PERCENT_DENOMINATOR),
  );
  let leftover = total - floorP - floorV - floorL;
  if (leftover < 0) leftover = 0;
  const extras = splitRemainderNormalized(keys.length, leftover, rng);
  void remainderShare;
  const assigned = {
    [primary]: floorP + extras[0],
    [COMMISSION_EPIC_STAT_VITALITY]: floorV + extras[1],
    [COMMISSION_EPIC_STAT_LUCK]: floorL + extras[2],
  };
  let sum = keys.reduce((s, k) => s + assigned[k], 0);
  if (sum !== total) {
    assigned[primary] += total - sum;
  }
  if (assigned[primary] < floorP) assigned[primary] = floorP;
  if (assigned[COMMISSION_EPIC_STAT_VITALITY] < floorV) {
    assigned[COMMISSION_EPIC_STAT_VITALITY] = floorV;
  }
  if (assigned[COMMISSION_EPIC_STAT_LUCK] < floorL) assigned[COMMISSION_EPIC_STAT_LUCK] = floorL;
  sum = keys.reduce((s, k) => s + assigned[k], 0);
  if (sum !== total) {
    const donor = keys.slice().sort((a, b) => assigned[b] - assigned[a])[0];
    assigned[donor] += total - sum;
  }
  const stats = Object.fromEntries(CANONICAL_GEAR_STAT_KEYS.map((k) => [k, 0]));
  for (const key of keys) stats[key] = assigned[key];
  return stats;
}
