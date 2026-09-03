/**
 * Phase 9 — Companies, Shipments, reputation, tokens, Commissions.
 * Server authority. Callers must run inside withTransactionAsync.
 */
import { nanoid } from "nanoid";
import { entities } from "../entities.js";
import { canonicalGearSlot } from "./productionMath.js";
import {
  COMPANY_IDS,
  COMPANY_REPUTATION_PER_LEVEL,
  COMPANY_SLOTS,
  GEAR_ORIGIN_EPIC_COMMISSION,
  GEAR_ORIGIN_RARE_COMMISSION,
  SHIPMENT_ITEM_COUNT,
  SHIPMENT_REPUTATION_REWARD,
  TOKEN_RARITY_EPIC,
  TOKEN_RARITY_RARE,
  TOKEN_STATUS_OVERFLOW,
  TOKEN_STATUS_WAITING,
  allCompanyDefinitions,
  companyLevelFromReputation,
  companyManufacturesSlot,
  isCompanyId,
  levelsAwardedByReputation,
  nextTokenRarity,
  normalizeRareCommissionWeights,
  reputationIntoCurrentLevel,
  reputationToNextLevel,
  shipmentPayoutFromBase,
  tokenRarityForCompanyLevel,
} from "../../../src/lib/productionMath/index.js";
import { GenerateGearItem } from "./itemGeneration.js";
import { serializeItem } from "./inventoryEquipment.js";
import { assertBackpackHasSpace } from "./inventoryGrant.js";
import { creditStardust } from "./currencyService.js";
import { recordItemOwnershipChange, ActorTypes, newCorrelationId } from "../audit/index.js";

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "COMPANY_ERROR";
  throw e;
}

function normalizeToken(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const companyId = String(raw.company_id || raw.companyId || "").trim();
  const rarity = String(raw.rarity || "").toLowerCase();
  if (!id || !isCompanyId(companyId)) return null;
  if (rarity !== TOKEN_RARITY_RARE && rarity !== TOKEN_RARITY_EPIC) return null;
  return {
    id,
    company_id: companyId,
    rarity,
    awarded_level: Math.max(1, Math.floor(Number(raw.awarded_level || raw.awardedLevel) || 1)),
    status: raw.status === TOKEN_STATUS_OVERFLOW ? TOKEN_STATUS_OVERFLOW : TOKEN_STATUS_WAITING,
  };
}

export function readCompanyState(character) {
  const raw = character?.company_state && typeof character.company_state === "object"
    ? character.company_state
    : {};
  const out = {};
  for (const id of COMPANY_IDS) {
    const row = raw[id] && typeof raw[id] === "object" ? raw[id] : {};
    out[id] = {
      reputation: Math.max(0, Math.floor(Number(row.reputation) || 0)),
      shipment_count: Math.max(0, Math.floor(Number(row.shipment_count) || 0)),
      waiting_token: normalizeToken(row.waiting_token),
      overflow_token: normalizeToken(row.overflow_token),
    };
  }
  return out;
}

export function persistCompanyState(characterId, state) {
  return entities.Character.update(characterId, { company_state: state });
}

function makeToken(companyId, rarity, awardedLevel, status) {
  return {
    id: nanoid(),
    company_id: companyId,
    rarity,
    awarded_level: awardedLevel,
    status,
  };
}

function publicToken(token) {
  if (!token) return null;
  return {
    id: token.id,
    company_id: token.company_id,
    rarity: token.rarity,
    awarded_level: token.awarded_level,
    status: token.status,
  };
}

function publicCompanyRow(id, row) {
  const def = allCompanyDefinitions().find((c) => c.id === id);
  const level = companyLevelFromReputation(row.reputation);
  return {
    id,
    name: def?.name || id,
    abbreviation: def?.abbreviation || id,
    slots: def?.slots || [...(COMPANY_SLOTS[id] || [])],
    reputation: row.reputation,
    level,
    reputation_into_level: reputationIntoCurrentLevel(row.reputation),
    reputation_to_next_level: reputationToNextLevel(row.reputation),
    reputation_per_level: COMPANY_REPUTATION_PER_LEVEL,
    shipment_count: row.shipment_count,
    next_token_rarity: nextTokenRarity(id, level),
    waiting_token: publicToken(row.waiting_token),
    overflow_token: publicToken(row.overflow_token),
    overflow_pending: !!row.overflow_token,
  };
}

export function serializeCompanies(character) {
  const state = readCompanyState(character);
  return COMPANY_IDS.map((id) => publicCompanyRow(id, state[id]));
}

export function isPersistedShipmentEligible(item) {
  if (!item || !canonicalGearSlot(item.type)) return false;
  return item.shipment_eligible === true;
}

function persistedSellValue(item) {
  return Math.max(0, Math.floor(Number(item?.sell_value) || 0));
}

function loadOwnedGear(character, itemId) {
  const item = entities.Item.get(itemId);
  if (!item) httpErr(404, "Item not found", "ITEM_NOT_FOUND");
  if (item.character_id !== character.id) httpErr(403, "Not your item", "ITEM_NOT_OWNED");
  return item;
}

export function validateShipmentItems(character, companyId, itemIds) {
  if (!isCompanyId(companyId)) httpErr(400, "Unknown company", "INVALID_COMPANY");
  const ids = Array.isArray(itemIds) ? itemIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  if (ids.length !== SHIPMENT_ITEM_COUNT) {
    httpErr(400, "A Shipment requires exactly five Gear items", "INVALID_SHIPMENT_COUNT");
  }
  if (new Set(ids).size !== SHIPMENT_ITEM_COUNT) {
    httpErr(400, "Shipment items must be distinct", "DUPLICATE_SHIPMENT_ITEM");
  }
  const state = readCompanyState(character);
  if (state[companyId].overflow_token) {
    httpErr(409, "Resolve this Company's token overflow before shipping more Gear", "COMPANY_OVERFLOW_PENDING");
  }
  const items = [];
  let base = 0;
  for (const id of ids) {
    const item = loadOwnedGear(character, id);
    if (item.is_equipped) httpErr(400, "Equipped Gear cannot be shipped", "ITEM_EQUIPPED");
    if (!canonicalGearSlot(item.type)) httpErr(400, "Only Gear can be shipped", "ITEM_NOT_GEAR");
    if (!isPersistedShipmentEligible(item)) {
      httpErr(400, "That Gear is not Shipment-eligible", "ITEM_NOT_SHIPMENT_ELIGIBLE");
    }
    if (String(item.manufacturer || "") !== companyId) {
      httpErr(400, "All five items must be from the same Company", "SHIPMENT_COMPANY_MISMATCH");
    }
    base += persistedSellValue(item);
    items.push(item);
  }
  const math = shipmentPayoutFromBase(base);
  const previousReputation = state[companyId].reputation;
  const nextReputation = previousReputation + SHIPMENT_REPUTATION_REWARD;
  const previousLevel = companyLevelFromReputation(previousReputation);
  const nextLevel = companyLevelFromReputation(nextReputation);
  const awardedLevels = levelsAwardedByReputation(previousReputation, nextReputation);
  const tokens = awardedLevels.map((level) => ({
    level,
    rarity: tokenRarityForCompanyLevel(companyId, level),
  }));
  return {
    company_id: companyId,
    items,
    item_ids: ids,
    ...math,
    previous_reputation: previousReputation,
    next_reputation: nextReputation,
    previous_level: previousLevel,
    next_level: nextLevel,
    levels_up: nextLevel > previousLevel,
    awarded_tokens: tokens,
    warning: "These five items will be permanently consumed.",
  };
}

export function previewShipment(character, companyId, itemIds) {
  const preview = validateShipmentItems(character, companyId, itemIds);
  return {
    company_id: preview.company_id,
    items: preview.items.map((item) => serializeItem(item, character)),
    base_value: preview.base_value,
    bonus: preview.bonus,
    payout: preview.payout,
    reputation: preview.reputation,
    previous_level: preview.previous_level,
    next_level: preview.next_level,
    levels_up: preview.levels_up,
    awarded_tokens: preview.awarded_tokens,
    warning: preview.warning,
  };
}

function awardTokensForLevels(row, companyId, awardedLevels) {
  const created = [];
  for (const level of awardedLevels) {
    const rarity = tokenRarityForCompanyLevel(companyId, level);
    const token = makeToken(companyId, rarity, level, TOKEN_STATUS_WAITING);
    created.push(token);
    if (!row.waiting_token) {
      row.waiting_token = { ...token, status: TOKEN_STATUS_WAITING };
    } else {
      row.overflow_token = { ...token, status: TOKEN_STATUS_OVERFLOW };
    }
  }
  return created;
}

export function settleShipment({ user, character, companyId, itemIds, requestId = "" }) {
  const preview = validateShipmentItems(character, companyId, itemIds);
  const corr = newCorrelationId();
  for (const item of preview.items) {
    entities.Item.delete(item.id);
    recordItemOwnershipChange({
      user,
      action: "item_consumed",
      item,
      previousOwnerCharacterId: character.id,
      newOwnerCharacterId: null,
      previousLocation: "inventory",
      newLocation: "shipment",
      correlationId: corr,
      actorType: ActorTypes.PLAYER,
    });
  }
  const state = readCompanyState(character);
  const row = state[companyId];
  const awardedLevels = preview.awarded_tokens.map((tok) => tok.level);
  row.reputation = preview.next_reputation;
  row.shipment_count += 1;
  const createdTokens = awardTokensForLevels(row, companyId, awardedLevels);
  const mut = creditStardust({
    user,
    character,
    amount: preview.payout,
    category: "shipment",
    reasonCode: "shipment_payout",
    extraPatch: { company_state: state },
    idempotencyKey: requestId ? `shipment:${requestId}` : "",
  });
  const updated = mut.character;
  const liveRow = readCompanyState(updated)[companyId];
  return {
    character: updated,
    company: publicCompanyRow(companyId, liveRow),
    companies: serializeCompanies(updated),
    consumed_item_ids: preview.item_ids,
    base_value: preview.base_value,
    bonus: preview.bonus,
    payout: preview.payout,
    reputation_granted: SHIPMENT_REPUTATION_REWARD,
    levels_awarded: awardedLevels,
    tokens_created: createdTokens.map(publicToken),
    overflow_pending: !!liveRow.overflow_token,
    balances: { stardust: updated.stardust },
    transaction: mut.transaction || null,
  };
}

export function serializeCompanyStatus(character, inventoryItems = []) {
  const companies = serializeCompanies(character);
  const eligible = (inventoryItems || [])
    .filter((item) => !item.is_equipped && isPersistedShipmentEligible(item) && isCompanyId(item.manufacturer))
    .map((item) => serializeItem(item, character));
  return {
    companies,
    eligible_items: eligible,
    overflow_companies: companies.filter((c) => c.overflow_pending).map((c) => c.id),
  };
}

function findToken(row, tokenId) {
  if (row.waiting_token && row.waiting_token.id === tokenId) {
    return { token: row.waiting_token, kind: "waiting" };
  }
  if (row.overflow_token && row.overflow_token.id === tokenId) {
    return { token: row.overflow_token, kind: "overflow" };
  }
  return null;
}

function commissionItemName(companyId, slot, rarity) {
  const def = allCompanyDefinitions().find((c) => c.id === companyId);
  const slotLabel = String(slot || "gear").replace(/_/g, " ");
  return `${def?.abbreviation || companyId} ${rarity} ${slotLabel}`;
}

export function redeemCommission({
  user,
  character,
  companyId,
  spendTokenId,
  slot,
  weights = null,
  rng,
}) {
  if (!isCompanyId(companyId)) httpErr(400, "Unknown company", "INVALID_COMPANY");
  const type = canonicalGearSlot(slot);
  if (!type || !companyManufacturesSlot(companyId, type)) {
    httpErr(400, "That slot is not manufactured by this Company", "INVALID_COMPANY_SLOT");
  }
  assertBackpackHasSpace(character, 1);
  const state = readCompanyState(character);
  const row = state[companyId];
  const found = findToken(row, String(spendTokenId || "").trim());
  if (!found) httpErr(404, "Commission token not found", "TOKEN_NOT_FOUND");
  const token = found.token;
  const mode = token.rarity === TOKEN_RARITY_EPIC ? "epic" : "rare";
  const rareWeights = mode === "rare" ? normalizeRareCommissionWeights(weights) : null;
  const generated = GenerateGearItem({
    itemLevel: character.level || 1,
    economicLevel: character.level || 1,
    itemType: type,
    rarity: token.rarity,
    rng,
    className: character.class,
    origin: mode === "epic" ? GEAR_ORIGIN_EPIC_COMMISSION : GEAR_ORIGIN_RARE_COMMISSION,
    manufacturer: companyId,
    shipmentEligible: true,
    commission: {
      mode,
      companyId,
      weights: rareWeights,
    },
  });
  generated.name = commissionItemName(companyId, type, token.rarity);
  generated.base_name = generated.name;
  generated.is_equipped = false;
  const created = entities.Item.create({
    ...generated,
    owner_id: character.created_by_id,
    character_id: character.id,
    is_equipped: false,
  });
  const corr = newCorrelationId();
  recordItemOwnershipChange({
    user,
    action: "item_obtained",
    item: created,
    previousOwnerCharacterId: null,
    newOwnerCharacterId: character.id,
    previousLocation: "commission",
    newLocation: "inventory",
    correlationId: corr,
    actorType: ActorTypes.PLAYER,
  });

  if (row.overflow_token) {
    const kept = found.kind === "waiting" ? row.overflow_token : row.waiting_token;
    row.waiting_token = kept ? { ...kept, status: TOKEN_STATUS_WAITING } : null;
    row.overflow_token = null;
  } else if (found.kind === "waiting") {
    row.waiting_token = null;
  }
  const updated = persistCompanyState(character.id, state);
  return {
    character: updated,
    item: serializeItem(created, updated),
    company: publicCompanyRow(companyId, readCompanyState(updated)[companyId]),
    companies: serializeCompanies(updated),
    spent_token: publicToken(token),
    overflow_cleared: !readCompanyState(updated)[companyId].overflow_token,
  };
}
