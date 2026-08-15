/**
 * Authoritative save-integrity validators (Restoration 25).
 *
 * Evidence over inference. Auto-repair only when deterministic.
 * Godot / Nakama must never call repair paths as gameplay authority.
 */
import { db } from "../db.js";
import { entities } from "../entities.js";
import {
  CLASS_BASE_STATS,
  getActiveStims,
  MAX_ACTIVE_STAT_TYPES,
  STARDUST_MAX,
} from "./economyFormulas.js";
import { ATTR_KEYS, readPermanentAttributes } from "./characterAttributes.js";
import { EQUIPMENT_SLOTS, listOwnedItems } from "./inventoryEquipment.js";
import { readNovaHalfUnits } from "./currencyService.js";
import { getClaimByKey } from "../rewards/store.js";
import {
  insertQuarantineRecord,
  insertRepairAudit,
  listOpenQuarantine,
  ensureIntegritySchema,
} from "./integrityStore.js";
import { clock } from "./time/clock.js";
import { ARENA_DEFAULT_RATING } from "../arena/config.js";

export const INTEGRITY_VALIDATOR_VERSION = "integrity_v1";

export const IntegritySeverity = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
});

const VALID_CLASSES = new Set(Object.keys(CLASS_BASE_STATS));
const EQUIP_SLOT_SET = new Set(EQUIPMENT_SLOTS);
const ACCOUNT_CHARACTER_QUERY_LIMIT = 50;
const CHARACTER_ITEM_AUDIT_LIMIT = 1_000;
const CHARACTER_ITEM_REPAIR_LIMIT = 500;
const CHARACTER_MISSION_AUDIT_LIMIT = 100;
const ARENA_HISTORY_AUDIT_LIMIT = 50;
const SCHEDULE_AUDIT_LIMIT = 200;
const DEFAULT_ORPHAN_SCAN_LIMIT = 200;
const MAX_ORPHAN_SCAN_LIMIT = 1_000;
const QUARANTINE_SAMPLE_LIMIT = 10;

function finding(severity, code, message, meta = {}) {
  return {
    severity,
    code,
    message,
    ...meta,
    validator_version: INTEGRITY_VALIDATOR_VERSION,
  };
}

function emptyReport(scope) {
  return {
    scope,
    validator_version: INTEGRITY_VALIDATOR_VERSION,
    started_at: clock.nowIso(),
    completed_at: null,
    records_scanned: 0,
    findings: [],
    repaired: [],
    quarantined: [],
    errors: [],
  };
}

function finalize(report) {
  report.completed_at = clock.nowIso();
  report.by_severity = {
    critical: report.findings.filter((f) => f.severity === IntegritySeverity.CRITICAL).length,
    high: report.findings.filter((f) => f.severity === IntegritySeverity.HIGH).length,
    medium: report.findings.filter((f) => f.severity === IntegritySeverity.MEDIUM).length,
    low: report.findings.filter((f) => f.severity === IntegritySeverity.LOW).length,
  };
  report.ok =
    report.by_severity.critical === 0 &&
    report.by_severity.high === 0 &&
    report.errors.length === 0;
  return report;
}

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code || "INTEGRITY_ERROR";
  throw e;
}

/** Account ↔ Nakama mapping + owned characters. */
export function ValidateAccountIntegrity(accountId) {
  const report = emptyReport({ type: "account", account_id: accountId });
  if (!accountId) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "MISSING_ACCOUNT_ID", "accountId required"),
    );
    return finalize(report);
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(accountId);
  report.records_scanned += 1;
  if (!user) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "ACCOUNT_NOT_FOUND", "No users row", {
        account_id: accountId,
      }),
    );
    return finalize(report);
  }

  const nakamaId = user.nakama_user_id ? String(user.nakama_user_id).trim() : "";
  if (nakamaId) {
    const dupes = db
      .prepare(
        `SELECT id FROM users
         WHERE nakama_user_id = ? AND id <> ?`,
      )
      .all(nakamaId, accountId);
    report.records_scanned += dupes.length;
    if (dupes.length) {
      report.findings.push(
        finding(
          IntegritySeverity.CRITICAL,
          "DUPLICATE_NAKAMA_MAPPING",
          "Multiple accounts share Nakama user id",
          { nakama_user_id: nakamaId, other_account_ids: dupes.map((d) => d.id) },
        ),
      );
    }
  }

  const characters = entities.Character.filter(
    { created_by_id: accountId },
    "-created_date",
    ACCOUNT_CHARACTER_QUERY_LIMIT,
  ) || [];
  report.records_scanned += characters.length;

  if (user.active_character_id) {
    const active = characters.find((c) => c.id === user.active_character_id);
    if (!active) {
      const orphan = entities.Character.get(user.active_character_id);
      if (!orphan) {
        report.findings.push(
          finding(
            IntegritySeverity.HIGH,
            "ACTIVE_CHARACTER_MISSING",
            "active_character_id points to missing Character",
            { character_id: user.active_character_id },
          ),
        );
      } else if (orphan.created_by_id !== accountId) {
        report.findings.push(
          finding(
            IntegritySeverity.CRITICAL,
            "CROSS_ACCOUNT_ACTIVE_CHARACTER",
            "active_character_id belongs to another account",
            {
              character_id: user.active_character_id,
              owner_id: orphan.created_by_id,
            },
          ),
        );
      }
    }
  }

  for (const ch of characters) {
    if (ch.created_by_id !== accountId) {
      report.findings.push(
        finding(
          IntegritySeverity.CRITICAL,
          "CHARACTER_OWNER_MISMATCH",
          "Character created_by_id mismatch",
          { character_id: ch.id, created_by_id: ch.created_by_id },
        ),
      );
    }
  }

  return finalize(report);
}

/** Structural character validation — not balance expectations. */
export function ValidateCharacterIntegrity(characterId) {
  const report = emptyReport({ type: "character", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing", {
        character_id: characterId,
      }),
    );
    return finalize(report);
  }

  if (!ch.created_by_id) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NO_OWNER", "Missing created_by_id", {
        character_id: characterId,
      }),
    );
  } else {
    const owner = db.prepare("SELECT id FROM users WHERE id = ?").get(ch.created_by_id);
    if (!owner) {
      report.findings.push(
        finding(IntegritySeverity.CRITICAL, "OWNER_ACCOUNT_MISSING", "Owner users row missing", {
          character_id: characterId,
          account_id: ch.created_by_id,
        }),
      );
    }
  }

  if (!VALID_CLASSES.has(ch.class)) {
    report.findings.push(
      finding(IntegritySeverity.HIGH, "INVALID_CLASS", "Unsupported class value", {
        character_id: characterId,
        class: ch.class,
      }),
    );
  }

  const level = Number(ch.level);
  if (!Number.isInteger(level) || level < 1) {
    report.findings.push(
      finding(IntegritySeverity.HIGH, "INVALID_LEVEL", "Level must be integer >= 1", {
        character_id: characterId,
        level: ch.level,
      }),
    );
  }

  const xp = Number(ch.experience);
  if (!Number.isFinite(xp) || xp < 0 || !Number.isInteger(xp)) {
    report.findings.push(
      finding(IntegritySeverity.HIGH, "INVALID_XP", "XP must be nonnegative integer", {
        character_id: characterId,
        experience: ch.experience,
      }),
    );
  }

  const attrs = readPermanentAttributes(ch);
  for (const k of ATTR_KEYS) {
    const raw = ch.stats?.[k];
    const v = attrs[k];
    if (raw != null && (Number(raw) < 0 || !Number.isFinite(Number(raw)))) {
      report.findings.push(
        finding(
          IntegritySeverity.HIGH,
          "INVALID_PERMANENT_ATTR",
          `Permanent attribute ${k} invalid`,
          { character_id: characterId, attribute: k, value: raw },
        ),
      );
    } else if (!Number.isInteger(v) || v < 0) {
      report.findings.push(
        finding(
          IntegritySeverity.HIGH,
          "INVALID_PERMANENT_ATTR",
          `Permanent attribute ${k} invalid`,
          { character_id: characterId, attribute: k, value: ch.stats?.[k] },
        ),
      );
    }
  }

  // Stim bonuses must not be confused with permanent attrs — flag if active_buffs
  // contain permanent-looking fields written onto stats (heuristic: never auto-subtract).
  const active = getActiveStims(ch);
  if (active.length > MAX_ACTIVE_STAT_TYPES) {
    report.findings.push(
      finding(
        IntegritySeverity.HIGH,
        "STIM_TOO_MANY_ACTIVE",
        `More than ${MAX_ACTIVE_STAT_TYPES} active stims`,
        {
        character_id: characterId,
        count: active.length,
        },
      ),
    );
  }
  const byStat = new Map();
  for (const s of active) {
    const stat = s.stat || s.attribute;
    if (!stat) continue;
    byStat.set(stat, (byStat.get(stat) || 0) + 1);
  }
  for (const [stat, count] of byStat) {
    if (count > 1) {
      report.findings.push(
        finding(
          IntegritySeverity.HIGH,
          "STIM_DUPLICATE_ATTRIBUTE",
          "Multiple active stims for one attribute",
          { character_id: characterId, attribute: stat, count },
        ),
      );
    }
  }

  return finalize(report);
}

export function ValidateInventoryIntegrity(characterId) {
  const report = emptyReport({ type: "inventory", character_id: characterId });
  const ch = entities.Character.get(characterId);
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing", {
        character_id: characterId,
      }),
    );
    return finalize(report);
  }

  const items = listOwnedItems(characterId, CHARACTER_ITEM_AUDIT_LIMIT);
  report.records_scanned += items.length;
  const seenIds = new Set();

  for (const item of items) {
    if (seenIds.has(item.id)) {
      report.findings.push(
        finding(IntegritySeverity.CRITICAL, "DUPLICATE_ITEM_ID", "Duplicate item id in scan", {
          item_id: item.id,
        }),
      );
    }
    seenIds.add(item.id);

    if (!item.character_id) {
      report.findings.push(
        finding(IntegritySeverity.CRITICAL, "ORPHAN_ITEM_NO_OWNER", "Item missing character_id", {
          item_id: item.id,
        }),
      );
    } else if (item.character_id !== characterId) {
      report.findings.push(
        finding(IntegritySeverity.CRITICAL, "ITEM_OWNER_MISMATCH", "Item owner mismatch", {
          item_id: item.id,
          character_id: item.character_id,
        }),
      );
    }

    const qty = item.quantity != null ? Number(item.quantity) : 1;
    if (!Number.isFinite(qty) || qty < 0) {
      report.findings.push(
        finding(IntegritySeverity.HIGH, "NEGATIVE_STACK", "Invalid stack quantity", {
          item_id: item.id,
          quantity: item.quantity,
        }),
      );
    }

    if (!item.type && !item.consumable) {
      report.findings.push(
        finding(IntegritySeverity.MEDIUM, "ITEM_MISSING_TYPE", "Item missing type", {
          item_id: item.id,
        }),
      );
    }
  }

  // Orphans: items claiming this character but filtered wrong — also scan global orphans
  // when scope is character-only we only check owned list.

  return finalize(report);
}

export function ValidateEquipmentIntegrity(characterId) {
  const report = emptyReport({ type: "equipment", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing", {
        character_id: characterId,
      }),
    );
    return finalize(report);
  }

  const eq = ch.equipped_items && typeof ch.equipped_items === "object" ? ch.equipped_items : {};
  const slotCounts = {};

  for (const [slot, itemId] of Object.entries(eq)) {
    if (!itemId) continue;
    report.records_scanned += 1;
    if (!EQUIP_SLOT_SET.has(slot) && !EQUIP_SLOT_SET.has(String(slot))) {
      // Some legacy maps key by item type rather than slot name — accept type keys.
      if (!EQUIPMENT_SLOTS.includes(slot)) {
        report.findings.push(
          finding(IntegritySeverity.MEDIUM, "UNKNOWN_EQUIP_SLOT", "Unknown equipment slot key", {
            character_id: characterId,
            slot,
            item_id: itemId,
          }),
        );
      }
    }

    slotCounts[slot] = (slotCounts[slot] || 0) + 1;
    if (slotCounts[slot] > 1) {
      report.findings.push(
        finding(IntegritySeverity.HIGH, "MULTI_ITEM_SLOT", "Multiple items in single-capacity slot", {
          character_id: characterId,
          slot,
        }),
      );
    }

    const item = entities.Item.get(itemId);
    if (!item) {
      report.findings.push(
        finding(
          IntegritySeverity.HIGH,
          "EQUIPPED_ITEM_MISSING",
          "Equipped reference points to missing item — do not invent replacement",
          { character_id: characterId, slot, item_id: itemId },
        ),
      );
      continue;
    }
    if (item.character_id !== characterId) {
      report.findings.push(
        finding(
          IntegritySeverity.CRITICAL,
          "EQUIPPED_WRONG_OWNER",
          "Equipped item belongs to another character",
          {
            character_id: characterId,
            item_id: itemId,
            item_owner: item.character_id,
          },
        ),
      );
    }
    if (item.type && slot !== item.type && EQUIP_SLOT_SET.has(item.type) && slot !== item.type) {
      // Soft check: slot key should match item type when both are equipment types.
      if (EQUIP_SLOT_SET.has(slot) && slot !== item.type) {
        report.findings.push(
          finding(IntegritySeverity.MEDIUM, "SLOT_TYPE_MISMATCH", "Slot key does not match item type", {
            character_id: characterId,
            slot,
            item_type: item.type,
            item_id: itemId,
          }),
        );
      }
    }
    if (!item.is_equipped) {
      report.findings.push(
        finding(
          IntegritySeverity.MEDIUM,
          "EQUIP_FLAG_DESYNC",
          "equipped_items map references item with is_equipped=false",
          { character_id: characterId, item_id: itemId },
        ),
      );
    }
  }

  // Items marked equipped but not in map
  const owned = listOwnedItems(characterId, CHARACTER_ITEM_REPAIR_LIMIT);
  report.records_scanned += owned.length;
  const mappedIds = new Set(Object.values(eq).filter(Boolean).map(String));
  for (const item of owned) {
    if (item.is_equipped && !mappedIds.has(String(item.id))) {
      report.findings.push(
        finding(
          IntegritySeverity.MEDIUM,
          "EQUIPPED_NOT_IN_MAP",
          "Item is_equipped but absent from Character.equipped_items",
          { character_id: characterId, item_id: item.id },
        ),
      );
    }
  }

  return finalize(report);
}

export function ValidateCurrencyIntegrity(characterId) {
  const report = emptyReport({ type: "currency", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing", {
        character_id: characterId,
      }),
    );
    return finalize(report);
  }

  const sd = Number(ch.stardust);
  if (!Number.isInteger(sd) || sd < 0) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "INVALID_STARDUST", "Stardust must be nonnegative integer", {
        character_id: characterId,
        stardust: ch.stardust,
      }),
    );
  } else if (sd > STARDUST_MAX) {
    report.findings.push(
      finding(IntegritySeverity.HIGH, "STARDUST_ABOVE_CEILING", "Stardust exceeds clamp ceiling", {
        character_id: characterId,
        stardust: sd,
        ceiling: STARDUST_MAX,
      }),
    );
  }

  const nova = Number(ch.nova_crystals);
  if (!Number.isInteger(nova) || nova < 0) {
    report.findings.push(
      finding(
        IntegritySeverity.CRITICAL,
        "INVALID_NOVA",
        "Nova half-units must be nonnegative integer",
        { character_id: characterId, nova_crystals: ch.nova_crystals },
      ),
    );
  }

  const fuel = Number(ch.fuel);
  if (!Number.isFinite(fuel) || fuel < 0) {
    report.findings.push(
      finding(IntegritySeverity.HIGH, "INVALID_FUEL", "Fuel must be nonnegative", {
        character_id: characterId,
        fuel: ch.fuel,
      }),
    );
  }

  return finalize(report);
}

/**
 * Ledger reconciliation. Incomplete history must NOT zero the balance.
 * Classifies mismatch; does not auto-overwrite.
 */
export function ReconcileCurrencyLedger(accountId, { characterId = null } = {}) {
  const report = emptyReport({
    type: "currency_ledger",
    account_id: accountId,
    character_id: characterId,
  });

  const rows = db
    .prepare(
      `SELECT operation_type, operation_key, result_json, created_at
       FROM wallet_operations WHERE account_id = ? ORDER BY created_at ASC`,
    )
    .all(accountId);
  report.records_scanned = rows.length;

  const baseline = db
    .prepare(`SELECT value FROM app_meta WHERE key = ?`)
    .get(`ledger_baseline:${accountId}`);

  let character = null;
  if (characterId) character = entities.Character.get(characterId);
  else {
    const list = entities.Character.filter({ created_by_id: accountId }, "-created_date", 1) || [];
    character = list[0] || null;
  }

  report.current_balances = character
    ? {
        stardust: character.stardust,
        nova_half_units: readNovaHalfUnits(character),
        fuel: character.fuel,
      }
    : null;

  if (!baseline && rows.length === 0) {
    report.findings.push(
      finding(
        IntegritySeverity.LOW,
        "LEDGER_EMPTY_NO_BASELINE",
        "No wallet_operations and no migration baseline — current balance preserved; history incomplete",
        { account_id: accountId },
      ),
    );
    report.classification = "incomplete_history";
    return finalize(report);
  }

  // Full replay of all econ_* ops is not always possible from result_json alone.
  // Report presence of receipts vs character balances without inventing opening balance.
  report.ledger_entry_count = rows.length;
  report.has_migration_baseline = !!baseline;
  report.classification = baseline ? "baseline_present" : "ledger_partial";
  report.findings.push(
    finding(
      IntegritySeverity.LOW,
      "LEDGER_RECONCILE_INFORMATIONAL",
      "Balances preserved; ledger used as audit evidence only when complete",
      {
        account_id: accountId,
        entries: rows.length,
        baseline: baseline?.value || null,
      },
    ),
  );

  // Detect duplicate operation keys already prevented by PK — scan for suspicious result duplicates.
  const keys = new Set();
  for (const row of rows) {
    const k = `${row.operation_type}|${row.operation_key}`;
    if (keys.has(k)) {
      report.findings.push(
        finding(IntegritySeverity.CRITICAL, "DUPLICATE_LEDGER_KEY", "Duplicate ledger key", {
          operation_type: row.operation_type,
          operation_key: row.operation_key,
        }),
      );
    }
    keys.add(k);
  }

  return finalize(report);
}

export function ValidateTransactionIntegrity({ claimKey = null, accountId = null, operationType = null, operationKey = null } = {}) {
  const report = emptyReport({
    type: "transaction",
    claim_key: claimKey,
    account_id: accountId,
    operation_type: operationType,
    operation_key: operationKey,
  });

  if (claimKey) {
    const claim = getClaimByKey(claimKey);
    report.records_scanned += 1;
    if (!claim) {
      report.findings.push(
        finding(IntegritySeverity.MEDIUM, "CLAIM_NOT_FOUND", "No reward claim for key", {
          claim_key: claimKey,
        }),
      );
    } else if (claim.status === "completed" && !claim.delivered_payload && !claim.deliveredPayload) {
      // store may use camelCase
      const delivered = claim.deliveredPayload ?? claim.delivered_payload;
      if (!delivered) {
        report.findings.push(
          finding(
            IntegritySeverity.HIGH,
            "CLAIM_COMPLETED_NO_DELIVERY",
            "Claim completed without delivered payload — candidate for recovery",
            { claim_key: claimKey, claim_id: claim.id || claim.claimId },
          ),
        );
      }
    }
    report.claim = claim
      ? {
          id: claim.id || claim.claimId,
          status: claim.status,
          claim_key: claim.claimKey || claim.claim_key,
        }
      : null;
  }

  if (accountId && operationType && operationKey) {
    const row = db
      .prepare(
        `SELECT * FROM wallet_operations
         WHERE account_id = ? AND operation_type = ? AND operation_key = ?`,
      )
      .get(accountId, operationType, operationKey);
    report.records_scanned += 1;
    if (!row) {
      report.findings.push(
        finding(IntegritySeverity.MEDIUM, "WALLET_OP_NOT_FOUND", "No wallet receipt", {
          account_id: accountId,
          operation_type: operationType,
          operation_key: operationKey,
        }),
      );
    } else {
      report.wallet_receipt = true;
    }
  }

  return finalize(report);
}

export function ValidateMissionIntegrity(characterId) {
  const report = emptyReport({ type: "mission", character_id: characterId });
  const missions =
    entities.Mission.filter(
      { character_id: characterId },
      "-created_date",
      CHARACTER_MISSION_AUDIT_LIMIT,
    ) || [];
  // Also match created_by / owner patterns used historically
  const alt =
    entities.Mission.filter(
      { created_by_id: characterId },
      "-created_date",
      CHARACTER_MISSION_AUDIT_LIMIT,
    ) || [];
  const byId = new Map();
  for (const m of [...missions, ...alt]) byId.set(m.id, m);
  const list = [...byId.values()];
  report.records_scanned = list.length;

  const active = list.filter((m) => {
    const st = String(m.status || m.state || "").toLowerCase();
    return st === "active" || st === "in_progress" || st === "running";
  });
  if (active.length > 1) {
    report.findings.push(
      finding(IntegritySeverity.HIGH, "DUPLICATE_ACTIVE_MISSION", "Multiple active missions", {
        character_id: characterId,
        mission_ids: active.map((m) => m.id),
      }),
    );
  }

  for (const m of list) {
    const claimKey = `mission:${m.id}`;
    const claim = getClaimByKey(claimKey);
    const st = String(m.status || m.state || "").toLowerCase();
    if ((st === "completed" || st === "claimed") && claim && claim.status === "completed") {
      // ok
    }
    if (st === "reward_pending" || m.reward_pending) {
      report.findings.push(
        finding(
          IntegritySeverity.HIGH,
          "MISSION_REWARD_PENDING",
          "Mission has pending reward settlement",
          { mission_id: m.id, character_id: characterId },
        ),
      );
    }
  }

  return finalize(report);
}

export function ValidateShopIntegrity(characterId) {
  const report = emptyReport({ type: "shop", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing"),
    );
    return finalize(report);
  }
  const sm = ch.shop_meta;
  if (sm && typeof sm === "object") {
    if (sm.generation_id == null && sm.shop_generation_id == null && !sm.seed) {
      report.findings.push(
        finding(
          IntegritySeverity.LOW,
          "SHOP_META_NO_GENERATION",
          "shop_meta lacks generation id (may be legacy)",
          { character_id: characterId },
        ),
      );
    }
  }
  return finalize(report);
}

export function ValidateMiningIntegrity(characterId) {
  const report = emptyReport({ type: "mining", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing"),
    );
    return finalize(report);
  }
  // Mining state lives on Character (session fields). Structural checks only.
  if (ch.mining_started_at && ch.mining_collected && ch.mining_reward == null) {
    report.findings.push(
      finding(
        IntegritySeverity.HIGH,
        "MINING_COLLECTED_NO_REWARD",
        "Mining marked collected without reward snapshot",
        { character_id: characterId },
      ),
    );
  }
  return finalize(report);
}

export function ValidateDungeonIntegrity(characterId) {
  const report = emptyReport({ type: "dungeon", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing"),
    );
    return finalize(report);
  }
  // Preserve defeated-enemy state; only flag structural impossibilities.
  if (ch.dungeon_cooldown_until) {
    const t = Date.parse(ch.dungeon_cooldown_until);
    if (Number.isNaN(t)) {
      report.findings.push(
        finding(IntegritySeverity.MEDIUM, "DUNGEON_BAD_COOLDOWN", "Invalid cooldown timestamp", {
          character_id: characterId,
        }),
      );
    }
  }
  return finalize(report);
}

export function ValidateArenaIntegrity(characterId) {
  const report = emptyReport({ type: "arena", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing"),
    );
    return finalize(report);
  }
  const rating = Number(ch.arena_rating ?? ARENA_DEFAULT_RATING);
  if (!Number.isFinite(rating) || rating < 0) {
    report.findings.push(
      finding(IntegritySeverity.HIGH, "INVALID_ARENA_RATING", "Arena rating invalid", {
        character_id: characterId,
        arena_rating: ch.arena_rating,
      }),
    );
  }

  try {
    const challenges = db
      .prepare(
        `SELECT id, status FROM arena_challenges
         WHERE challenger_character_id = ? OR opponent_character_id = ?
         LIMIT ${ARENA_HISTORY_AUDIT_LIMIT}`,
      )
      .all(characterId, characterId);
    report.records_scanned += challenges.length;
  } catch {
    report.findings.push(
      finding(
        IntegritySeverity.LOW,
        "ARENA_HISTORY_UNAVAILABLE",
        "Could not scan arena_challenges — current rating preserved",
        { character_id: characterId },
      ),
    );
  }

  return finalize(report);
}

export function ValidateStimIntegrity(characterId) {
  const report = emptyReport({ type: "stim", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing", {
        character_id: characterId,
      }),
    );
    return finalize(report);
  }

  const active = getActiveStims(ch);
  report.records_scanned += active.length;
  if (active.length > MAX_ACTIVE_STAT_TYPES) {
    report.findings.push(
      finding(
        IntegritySeverity.HIGH,
        "STIM_TOO_MANY_ACTIVE",
        `More than ${MAX_ACTIVE_STAT_TYPES} active stims`,
        {
        character_id: characterId,
        count: active.length,
        },
      ),
    );
  }
  const byStat = new Map();
  for (const s of active) {
    const stat = s.stat || s.attribute;
    if (!stat) continue;
    byStat.set(stat, (byStat.get(stat) || 0) + 1);
  }
  for (const [stat, count] of byStat) {
    if (count > 1) {
      report.findings.push(
        finding(
          IntegritySeverity.HIGH,
          "STIM_DUPLICATE_ATTRIBUTE",
          "Multiple active stims for one attribute",
          { character_id: characterId, attribute: stat, count },
        ),
      );
    }
  }
  return finalize(report);
}

export function ValidateCasinoIntegrity(characterId) {
  const report = emptyReport({ type: "casino", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing"),
    );
    return finalize(report);
  }
  // Casino outcomes are committed via wallet_operations + character patches.
  // No separate wager table required for structural pass.
  return finalize(report);
}

export function ReconcileStatistics(characterId) {
  const report = emptyReport({ type: "statistics", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing"),
    );
    return finalize(report);
  }
  report.findings.push(
    finding(
      IntegritySeverity.LOW,
      "STATISTICS_REBUILD_DEFERRED",
      "Use Prompt 19 rebuild tooling for full statistics reconciliation — not run on every login",
      { character_id: characterId },
    ),
  );
  return finalize(report);
}

export function ReconcileAchievements(characterId) {
  const report = emptyReport({ type: "achievements", character_id: characterId });
  const ch = entities.Character.get(characterId);
  report.records_scanned += 1;
  if (!ch) {
    report.findings.push(
      finding(IntegritySeverity.CRITICAL, "CHARACTER_NOT_FOUND", "Character missing"),
    );
    return finalize(report);
  }
  // Do not revoke claimed achievements because rebuilt stats are lower.
  return finalize(report);
}

export function ValidateSchedulerIntegrity() {
  const report = emptyReport({ type: "scheduler" });
  try {
    const schedules = db.prepare(
      `SELECT id, status, last_run_at FROM schedules LIMIT ${SCHEDULE_AUDIT_LIMIT}`,
    ).all();
    report.records_scanned = schedules.length;
  } catch (err) {
    report.errors.push(String(err.message || err));
  }
  return finalize(report);
}

/** Scan orphan items globally (optional heavy check). */
export function detectOrphanItems({ limit = DEFAULT_ORPHAN_SCAN_LIMIT } = {}) {
  const findings = [];
  const items = entities.Item.list(
    "-created_date",
    Math.min(MAX_ORPHAN_SCAN_LIMIT, limit),
  ) || [];
  for (const item of items) {
    if (!item.character_id) {
      findings.push(
        finding(IntegritySeverity.HIGH, "ORPHAN_ITEM", "Item has no character_id", {
          item_id: item.id,
        }),
      );
      continue;
    }
    const ch = entities.Character.get(item.character_id);
    if (!ch) {
      findings.push(
        finding(IntegritySeverity.HIGH, "ORPHAN_ITEM_DELETED_OWNER", "Item owner character missing", {
          item_id: item.id,
          character_id: item.character_id,
        }),
      );
    }
  }
  return findings;
}

export function QuarantineRecord(input) {
  ensureIntegritySchema();
  return insertQuarantineRecord({
    ...input,
    validatorVersion: input.validatorVersion || INTEGRITY_VALIDATOR_VERSION,
  });
}

/**
 * Safe automatic repairs only. Ambiguous cases quarantine.
 * @param {{ repairType, characterId?, dryRun?, actor? }} opts
 */
export function ApplyDataRepair(opts = {}) {
  const {
    repairType,
    characterId = null,
    dryRun = true,
    actor = "system",
  } = opts;

  if (!repairType) httpErr(400, "repairType required", "VALIDATION_ERROR");

  if (repairType === "clear_expired_stim_buffs") {
    const ch = entities.Character.get(characterId);
    if (!ch) httpErr(404, "Character not found");
    const now = clock.nowMs();
    const before = ch.active_buffs || [];
    const after = (before || []).filter((b) => b && new Date(b.expires_at).getTime() > now);
    if (dryRun) {
      return {
        dry_run: true,
        repair_type: repairType,
        would_remove: before.length - after.length,
        before_count: before.length,
        after_count: after.length,
      };
    }
    if (before.length !== after.length) {
      entities.Character.update(ch.id, { active_buffs: after });
      const auditId = insertRepairAudit({
        repairType,
        targetEntityType: "Character",
        targetEntityId: ch.id,
        before: { active_buffs: before },
        after: { active_buffs: after },
        evidence: { rule: "expires_at <= now" },
        actor,
        automated: true,
        reason: "Remove expired stim effects from active_buffs",
      });
      return { dry_run: false, repaired: true, audit_id: auditId, removed: before.length - after.length };
    }
    return { dry_run: false, repaired: false, removed: 0 };
  }

  if (repairType === "clear_invalid_equip_refs") {
    const ch = entities.Character.get(characterId);
    if (!ch) httpErr(404, "Character not found");
    const eq = { ...(ch.equipped_items || {}) };
    const before = { ...eq };
    const removed = [];
    for (const [slot, itemId] of Object.entries(eq)) {
      if (!itemId) continue;
      const item = entities.Item.get(itemId);
      if (!item || item.character_id !== ch.id) {
        removed.push({ slot, item_id: itemId, reason: !item ? "missing" : "wrong_owner" });
        delete eq[slot];
      }
    }
    if (dryRun) {
      return { dry_run: true, repair_type: repairType, would_clear: removed };
    }
    if (removed.length) {
      // Quarantine evidence — do not invent replacement items.
      for (const r of removed) {
        insertQuarantineRecord({
          entityType: "EquipmentRef",
          entityId: r.item_id,
          ownerId: ch.created_by_id,
          issueCode: "INVALID_EQUIP_REF_CLEARED",
          severity: IntegritySeverity.HIGH,
          payload: { character_id: ch.id, ...r, equipped_items_before: before },
        });
      }
      entities.Character.update(ch.id, { equipped_items: eq });
      const auditId = insertRepairAudit({
        repairType,
        targetEntityType: "Character",
        targetEntityId: ch.id,
        before: { equipped_items: before },
        after: { equipped_items: eq },
        evidence: { removed },
        actor,
        automated: true,
        reason: "Cleared invalid equipment references; no replacement items created",
      });
      return { dry_run: false, repaired: true, audit_id: auditId, cleared: removed };
    }
    return { dry_run: false, repaired: false, cleared: [] };
  }

  httpErr(400, `Unsupported or unsafe repairType: ${repairType}`, "UNSAFE_REPAIR");
}

/**
 * Full or scoped integrity audit.
 * @param {{ accountId?, characterId?, quarantine?: boolean, includeOrphans?: boolean }} opts
 */
export function RunIntegrityAudit(opts = {}) {
  ensureIntegritySchema();
  const started = clock.nowIso();
  const sections = {};
  const allFindings = [];
  const quarantined = [];

  if (opts.accountId) {
    sections.account = ValidateAccountIntegrity(opts.accountId);
    allFindings.push(...sections.account.findings);
  }

  if (opts.characterId) {
    const cid = opts.characterId;
    sections.character = ValidateCharacterIntegrity(cid);
    sections.inventory = ValidateInventoryIntegrity(cid);
    sections.equipment = ValidateEquipmentIntegrity(cid);
    sections.currency = ValidateCurrencyIntegrity(cid);
    sections.mission = ValidateMissionIntegrity(cid);
    sections.shop = ValidateShopIntegrity(cid);
    sections.mining = ValidateMiningIntegrity(cid);
    sections.dungeon = ValidateDungeonIntegrity(cid);
    sections.arena = ValidateArenaIntegrity(cid);
    sections.casino = ValidateCasinoIntegrity(cid);
    sections.statistics = ReconcileStatistics(cid);
    sections.achievements = ReconcileAchievements(cid);
    for (const s of Object.values(sections)) {
      if (s?.findings) allFindings.push(...s.findings);
    }
    const ch = entities.Character.get(cid);
    if (ch?.created_by_id) {
      sections.ledger = ReconcileCurrencyLedger(ch.created_by_id, { characterId: cid });
      allFindings.push(...sections.ledger.findings);
    }
  }

  if (opts.includeScheduler) {
    sections.scheduler = ValidateSchedulerIntegrity();
    allFindings.push(...sections.scheduler.findings);
  }

  if (opts.includeOrphans) {
    const orphans = detectOrphanItems({
      limit: opts.orphanLimit || DEFAULT_ORPHAN_SCAN_LIMIT,
    });
    sections.orphans = { findings: orphans, records_scanned: orphans.length };
    allFindings.push(...orphans);
  }

  if (opts.quarantine) {
    for (const f of allFindings) {
      if (f.severity === IntegritySeverity.CRITICAL || f.severity === IntegritySeverity.HIGH) {
        const q = insertQuarantineRecord({
          entityType: f.character_id ? "Character" : f.item_id ? "Item" : "Finding",
          entityId: f.character_id || f.item_id || f.account_id || null,
          ownerId: opts.accountId || null,
          issueCode: f.code,
          severity: f.severity,
          payload: f,
        });
        quarantined.push(q.id);
      }
    }
  }

  const by_severity = {
    critical: allFindings.filter((f) => f.severity === IntegritySeverity.CRITICAL).length,
    high: allFindings.filter((f) => f.severity === IntegritySeverity.HIGH).length,
    medium: allFindings.filter((f) => f.severity === IntegritySeverity.MEDIUM).length,
    low: allFindings.filter((f) => f.severity === IntegritySeverity.LOW).length,
  };

  return {
    validator_version: INTEGRITY_VALIDATOR_VERSION,
    started_at: started,
    completed_at: clock.nowIso(),
    sections,
    findings: allFindings,
    by_severity,
    quarantined,
    open_quarantine_sample: listOpenQuarantine({ limit: QUARANTINE_SAMPLE_LIMIT }),
    ok: by_severity.critical === 0 && by_severity.high === 0,
  };
}

/** Player-safe recovery presentation payload (no internal repair controls). */
export function SerializeRecoveryState(character, { maintenance = false, reviewRequired = false } = {}) {
  let pending_loot_count = 0;
  try {
    const rows = db
      .prepare(
        `SELECT COUNT(*) AS c FROM reward_pending_loot
         WHERE character_id = ? AND status = 'pending'`,
      )
      .all(character?.id);
    pending_loot_count = rows[0]?.c || 0;
  } catch {
    pending_loot_count = 0;
  }

  return {
    character_id: character?.id || null,
    account_id: character?.created_by_id || null,
    schema_version: INTEGRITY_VALIDATOR_VERSION,
    maintenance,
    character_review_required: !!reviewRequired,
    pending_loot_count,
    authoritative: true,
    client_cache_may_overwrite: false,
  };
}
