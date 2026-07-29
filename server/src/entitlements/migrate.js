/**
 * One-shot migration of legacy ownership into entitlement rows.
 */

import { db } from "../db.js";
import { entities } from "../entities.js";
import { ACHIEVEMENTS } from "../shared/achievements.js";
import { grantEntitlement } from "./service.js";
import { titleEntitlementKeyForAchievement } from "./definitions.js";

const META_KEY = "entitlements_migrate_v1";

function metaGet() {
  db.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(META_KEY);
  return row?.value || null;
}

function metaSet(value) {
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(META_KEY, value);
}

/**
 * Import users.purchased_slots and achievement titles into entitlements.
 * Idempotent via meta flag + grant idempotency keys.
 */
export async function migrateLegacyEntitlements() {
  if (metaGet() === "done") {
    return { skipped: true };
  }

  const report = {
    slots: 0,
    titles: 0,
    founders: 0,
    errors: [],
  };

  const users = db.prepare("SELECT id, purchased_slots, legacy_name, role FROM users").all();
  for (const u of users) {
    const purchased = Number(u.purchased_slots) || 0;
    if (purchased > 0) {
      try {
        await grantEntitlement({
          entitlementKey: "account.character_slot",
          accountId: u.id,
          quantity: purchased,
          sourceType: "migration",
          sourceReferenceType: "users.purchased_slots",
          sourceReferenceId: String(purchased),
          idempotencyKey: `migration:slots:${u.id}:v1`,
          createdBy: "migration",
        });
        report.slots += 1;
      } catch (err) {
        report.errors.push({ accountId: u.id, error: err.message });
      }
    }

    if (u.legacy_name === "Founder" || u.role === "admin") {
      try {
        await grantEntitlement({
          entitlementKey: "account.founder_status",
          accountId: u.id,
          quantity: 1,
          sourceType: "migration",
          sourceReferenceType: "legacy_founder",
          sourceReferenceId: u.id,
          idempotencyKey: `migration:founder:${u.id}:v1`,
          createdBy: "migration",
        });
        report.founders += 1;
      } catch (err) {
        report.errors.push({ accountId: u.id, error: err.message });
      }
    }
  }

  // Character achievement titles
  const chars = entities.Character?.list?.("-created_date", 5000) || [];
  for (const ch of chars) {
    const unlocked = new Set(ch.unlocked_achievements || []);
    for (const a of ACHIEVEMENTS) {
      if (!unlocked.has(a.id) || !a.title) continue;
      try {
        await grantEntitlement({
          entitlementKey: titleEntitlementKeyForAchievement(a.id),
          accountId: ch.created_by_id,
          characterId: ch.id,
          quantity: 1,
          sourceType: "migration",
          sourceReferenceType: "achievement",
          sourceReferenceId: a.id,
          idempotencyKey: `migration:title:${ch.id}:${a.id}:v1`,
          createdBy: "migration",
        });
        report.titles += 1;
      } catch (err) {
        report.errors.push({ characterId: ch.id, error: err.message });
      }
    }
  }

  metaSet("done");
  console.log("[entitlements] migration complete", report);
  return report;
}
