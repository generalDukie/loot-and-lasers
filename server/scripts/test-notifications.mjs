/**
 * Notification authority tests (Restoration 22).
 * Run: npm run test:notifications
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-notif-"));
process.env.DB_PATH = path.join(tmpDir, "test-notif.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const { canCreateType, canWriteDoc } = await import("../src/entityAccess.js");
const {
  createNotification,
  listNotifications,
  getUnreadCounts,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  notifyAchievementsUnlocked,
  CLIENT_CREATABLE_TYPES,
} = await import("../src/shared/notificationService.js");
const {
  GetNotifications,
  CreateNotification,
  MarkNotificationRead,
  MarkAllNotificationsRead,
  DismissNotification,
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
    `INSERT INTO users (id, email, password_hash, role, email_verified, created_date, updated_date)
     VALUES (?, ?, ?, 'user', 1, ?, ?)`,
  ).run(id, email, hashPw("x"), now, now);
  return { id, email, role: "user", active_character_id: null };
}

function makeChar(ownerId, opts = {}) {
  return entities.Character.create({
    name: opts.name || `C-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: ownerId,
    level: 10,
  });
}

console.log("\nNotifications (Restoration 22)\n");

test("clients cannot create or mutate AppNotification via entity CRUD", () => {
  const user = { id: "u1", role: "user" };
  assert.equal(canCreateType(user, "AppNotification", { owner_id: "x" }), false);
  assert.equal(
    canWriteDoc(user, "AppNotification", { id: "n1", owner_id: "char-owned", created_by_id: "u1" }),
    false,
  );
});

test("create + list + unread counts", () => {
  const u = insertUser("u-n1", "n1@t.test");
  const ch = makeChar(u.id);
  const a = createNotification({
    owner_id: ch.id,
    type: "system",
    title: "Hello",
    body: "World",
  });
  assert.ok(a.notification?.id);
  assert.equal(a.notification.read, false);
  const list = listNotifications(ch.id);
  assert.equal(list.length, 1);
  assert.equal(getUnreadCounts(ch.id).total, 1);
});

test("idempotency key prevents duplicate", () => {
  const u = insertUser("u-n2", "n2@t.test");
  const ch = makeChar(u.id);
  const key = `test:${ch.id}:once`;
  const a = createNotification({
    owner_id: ch.id,
    type: "achievement",
    title: "Unlocked",
    body: "x",
    idempotency_key: key,
  });
  const b = createNotification({
    owner_id: ch.id,
    type: "achievement",
    title: "Unlocked",
    body: "x",
    idempotency_key: key,
  });
  assert.equal(b.replay, true);
  assert.equal(a.notification.id, b.notification.id);
  assert.equal(listNotifications(ch.id).length, 1);
});

test("mark read + dismiss + mark all", () => {
  const u = insertUser("u-n3", "n3@t.test");
  const ch = makeChar(u.id);
  const n1 = createNotification({ owner_id: ch.id, type: "mail", title: "A", body: "1" }).notification;
  const n2 = createNotification({ owner_id: ch.id, type: "system", title: "B", body: "2" }).notification;
  markNotificationRead(ch.id, n1.id);
  assert.equal(getUnreadCounts(ch.id).total, 1);
  dismissNotification(ch.id, n2.id);
  assert.equal(getUnreadCounts(ch.id).total, 0);
  createNotification({ owner_id: ch.id, type: "system", title: "C", body: "3" });
  markAllNotificationsRead(ch.id);
  assert.equal(getUnreadCounts(ch.id).total, 0);
});

test("cross-owner mark read rejected", () => {
  const u1 = insertUser("u-n4a", "n4a@t.test");
  const u2 = insertUser("u-n4b", "n4b@t.test");
  const a = makeChar(u1.id);
  const b = makeChar(u2.id);
  const n = createNotification({ owner_id: a.id, type: "system", title: "X", body: "y" }).notification;
  assert.throws(() => markNotificationRead(b.id, n.id), (e) => e.status === 403);
});

test("achievement fan-out idempotent", () => {
  const u = insertUser("u-n5", "n5@t.test");
  const ch = makeChar(u.id);
  notifyAchievementsUnlocked(ch.id, ["first_blood", "initiate"]);
  notifyAchievementsUnlocked(ch.id, ["first_blood", "initiate"]);
  const list = listNotifications(ch.id);
  assert.equal(list.filter((n) => n.type === "achievement").length, 2);
});

test("expiration hides from unread", () => {
  const u = insertUser("u-n6", "n6@t.test");
  const ch = makeChar(u.id);
  createNotification({
    owner_id: ch.id,
    type: "maintenance",
    title: "Gone",
    body: "x",
    expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  assert.equal(listNotifications(ch.id, { unreadOnly: true }).length, 0);
});

await testAsync("RPC Get / Mark / Create whitelist", async () => {
  const u = insertUser("u-n7", "n7@t.test");
  const ch = makeChar(u.id);
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, u.id);
  const user = { ...u, active_character_id: ch.id };
  createNotification({ owner_id: ch.id, type: "system", title: "Hi", body: "there" });
  const got = await GetNotifications(user, {});
  assert.equal(got.status, 200);
  assert.ok(got.body.notifications.length >= 1);
  const id = got.body.notifications[0].id;
  const marked = await MarkNotificationRead(user, { id });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.notification.read, true);
  const denied = await CreateNotification(user, {
    owner_id: ch.id,
    type: "achievement",
    title: "Forge",
    body: "nope",
  });
  assert.equal(denied.status, 403);
  assert.ok(CLIENT_CREATABLE_TYPES.includes("friend_request"));
  const ok = await CreateNotification(user, {
    owner_id: ch.id,
    type: "system",
    title: "Social",
    body: "ok",
  });
  assert.equal(ok.status, 200);
  await MarkAllNotificationsRead(user, {});
  await DismissNotification(user, { id: ok.body.notification.id });
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
