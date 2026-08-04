/**
 * Settings / preferences tests (Restoration 24).
 * Run: npm run test:settings
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-settings-"));
process.env.DB_PATH = path.join(tmpDir, "test-settings.db");

const { db } = await import("../src/db.js");
const {
  getAccountPreferences,
  saveAccountPreferences,
  ACCOUNT_PREFERENCE_KEYS,
  LOCAL_DEVICE_SETTING_KEYS,
  serializeAccountPreferences,
} = await import("../src/shared/preferencesService.js");
const {
  GetAccountPreferences,
  SaveAccountPreferences,
} = await import("../src/functions/index.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
  }
}

function hashPw(pw) {
  return createHash("sha256").update(pw).digest("hex");
}

function insertUser(id, email) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date, legacy_display)
     VALUES (?, ?, ?, 'user', 1, ?, ?, 'surname')`,
  ).run(id, email, hashPw("x"), now, now);
  return { id, email, role: "user", legacy_display: "surname", legacy_name: null };
}

console.log("\nSettings / Preferences (Restoration 24)\n");

test("local device keys exclude account keys", () => {
  for (const k of ACCOUNT_PREFERENCE_KEYS) {
    assert.equal(LOCAL_DEVICE_SETTING_KEYS.includes(k), false);
  }
  assert.ok(LOCAL_DEVICE_SETTING_KEYS.includes("master_volume"));
  assert.ok(LOCAL_DEVICE_SETTING_KEYS.includes("resolution"));
});

test("serialize account preferences", () => {
  const s = serializeAccountPreferences({ legacy_display: "family", legacy_name: "Voss" });
  assert.equal(s.legacy_display, "family");
  assert.equal(s.legacy_name, "Voss");
});

test("save rejects hardware settings", () => {
  const u = insertUser("u-pref1", "p1@t.test");
  assert.throws(
    () => saveAccountPreferences(u.id, { master_volume: 1 }),
    (e) => e.status === 400 && /not synchronizable/i.test(e.message),
  );
});

test("save legacy_display", () => {
  const u = insertUser("u-pref2", "p2@t.test");
  const out = saveAccountPreferences(u.id, { legacy_display: "family" });
  assert.equal(out.legacy_display, "family");
  assert.equal(getAccountPreferences(u.id).legacy_display, "family");
});

await testAsync("RPC Get / Save account preferences", async () => {
  const u = insertUser("u-pref3", "p3@t.test");
  const got = await GetAccountPreferences(u);
  assert.equal(got.status, 200);
  assert.ok(Array.isArray(got.body.local_device_keys));
  assert.ok(got.body.local_device_keys.includes("fullscreen"));
  const saved = await SaveAccountPreferences(u, { preferences: { legacy_display: "family" } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.preferences.legacy_display, "family");
  const denied = await SaveAccountPreferences(u, { preferences: { resolution: "4k" } });
  assert.equal(denied.status, 400);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
