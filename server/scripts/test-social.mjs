/**
 * Social / mail / guild membership tests (Restoration 23).
 * Run: npm run test:social
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-social-"));
process.env.DB_PATH = path.join(tmpDir, "test-social.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const { canCreateType, canWriteDoc } = await import("../src/entityAccess.js");
const {
  serializePublicProfile,
  searchCharacters,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockPlayer,
  setPresence,
  getPresenceMap,
  getSocialState,
} = await import("../src/shared/socialService.js");
const {
  sendPlayerMail,
  listMail,
  markMailRead,
  deleteMail,
  createSystemMail,
} = await import("../src/shared/mailService.js");
const {
  joinGuild,
  leaveGuild,
  inviteToGuild,
  acceptGuildInvite,
  kickGuildMember,
  ensureWeeklyChallenge,
  contributeGuildMission,
  contributeGuildArenaWin,
  toggleGuildWarReady,
  resolveGuildWar,
} = await import("../src/shared/guildSocialService.js");
const {
  GetPublicProfile,
  SearchCharacters,
  SendFriendRequest,
  AcceptFriendRequest,
  SendMessage,
  GetInbox,
  ClaimMailReward,
  JoinGuild,
  LeaveGuild,
  DeleteMyCharacter,
} = await import("../src/functions/index.js");
const { createNotification } = await import("../src/shared/notificationService.js");
const { installFakeClock, resetClockState } = await import("../src/shared/time/index.js");

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
    level: opts.level || 10,
    class: opts.class || "pilot",
    race: opts.race || "human",
    arena_rating: opts.arena_rating || 1200,
  });
}

function pin(user, ch) {
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, user.id);
  return { ...user, active_character_id: ch.id };
}

console.log("\nSocial systems (Restoration 23)\n");

test("clients cannot create social entities via CRUD", () => {
  const user = { id: "u1", role: "user" };
  for (const t of [
    "FriendRequest",
    "Friendship",
    "Block",
    "Mail",
    "ChatMessage",
    "PrivateMessage",
    "PlayerPresence",
    "GuildMember",
    "Guild",
    "GuildLog",
    "GuildChallenge",
    "GuildWar",
    "GuildWarReady",
    "GuildBattle",
    "NexusAssault",
  ]) {
    assert.equal(canCreateType(user, t, {}), false, t);
    assert.equal(canWriteDoc(user, t, { id: "x", owner_id: "c", blocker_id: "c", guild_id: "g" }), false, t);
  }
});

test("public profile hides currency and includes arena fields", () => {
  const u = insertUser("u-p1", "p1@t.test");
  const ch = makeChar(u.id, { name: "PublicHero", arena_rating: 1500 });
  entities.Character.update(ch.id, { stardust: 99999, nova: 50 });
  const profile = serializePublicProfile(ch.id);
  assert.equal(profile.name, "PublicHero");
  assert.ok(profile.arena_rating >= 1000);
  assert.ok(profile.statistics);
  assert.equal(profile.statistics.stardust, undefined);
  assert.equal(profile.stardust, undefined);
});

test("search characters by name", () => {
  const u = insertUser("u-s1", "s1@t.test");
  makeChar(u.id, { name: "ZorpFinder" });
  const hits = searchCharacters("zorp");
  assert.ok(hits.some((h) => h.name === "ZorpFinder"));
});

test("friend send accept remove + duplicate prevention", () => {
  const u1 = insertUser("u-f1", "f1@t.test");
  const u2 = insertUser("u-f2", "f2@t.test");
  const a = makeChar(u1.id, { name: "Alice" });
  const b = makeChar(u2.id, { name: "Bob" });
  assert.throws(() => sendFriendRequest(a, a.id), /yourself/i);
  const sent = sendFriendRequest(a, b.id);
  assert.ok(sent.request?.id);
  assert.throws(() => sendFriendRequest(a, b.id), /pending/i);
  const acc = acceptFriendRequest(b, sent.request.id);
  assert.ok(acc.friendship?.id);
  assert.equal(getSocialState(a.id).friends.length, 1);
  removeFriend(a, b.id);
  assert.equal(getSocialState(a.id).friends.length, 0);
});

test("friend decline + block prevents whisper path helpers", () => {
  const u1 = insertUser("u-b1", "b1@t.test");
  const u2 = insertUser("u-b2", "b2@t.test");
  const a = makeChar(u1.id);
  const b = makeChar(u2.id);
  const sent = sendFriendRequest(a, b.id);
  declineFriendRequest(b, sent.request.id);
  blockPlayer(b, a.id);
  assert.throws(() => sendFriendRequest(a, b.id), /cannot send/i);
});

test("presence set + map online", () => {
  const u = insertUser("u-pr", "pr@t.test");
  const ch = makeChar(u.id);
  const set = setPresence(ch, "online");
  assert.equal(set.presence.online, true);
  const map = getPresenceMap([ch.id]);
  assert.equal(map[ch.id].online, true);
});

test("mail send read delete + system mail", () => {
  const u1 = insertUser("u-m1", "m1@t.test");
  const u2 = insertUser("u-m2", "m2@t.test");
  const a = makeChar(u1.id, { name: "Mailer" });
  const b = makeChar(u2.id, { name: "Inbox" });
  const out = sendPlayerMail(a, b.id, "Hello", "World body");
  assert.ok(out.inbox?.id);
  assert.equal(listMail(b.id).length, 1);
  markMailRead(b.id, out.inbox.id);
  deleteMail(b.id, out.inbox.id);
  assert.equal(listMail(b.id, { folder: "deleted" }).length, 1);
  createSystemMail({ ownerId: b.id, subject: "Sys", body: "x", rewards: { stardust: 10 } });
  assert.ok(listMail(b.id).some((m) => m.has_rewards));
});

test("guild challenge contribute is server-authoritative", () => {
  const u1 = insertUser("u-gc1", "gc1@t.test");
  const leader = makeChar(u1.id, { name: "ChLeader", level: 5 });
  const guild = entities.Guild.create({
    name: `GC-${Math.random().toString(36).slice(2, 6)}`,
    tag: "GC1",
    leader_id: leader.id,
    leader_name: leader.name,
    member_count: 1,
    level: 1,
    experience: 0,
    experience_to_next: 1000,
    total_missions: 0,
    total_stardust: 0,
  });
  entities.GuildMember.create({
    guild_id: guild.id,
    character_id: leader.id,
    character_name: leader.name,
    role: "leader",
    contributed_missions: 0,
    contributed_stardust: 0,
    joined_date: new Date().toISOString(),
  });
  const ensured = ensureWeeklyChallenge(leader);
  assert.ok(ensured.challenge?.id);
  assert.equal(ensured.challenge.progress, 0);
  const out = contributeGuildMission(leader, { name: "Scout", location: "Orbit" }, {
    experience: 100,
    stardust: 50,
  });
  assert.equal(out.success, true);
  assert.equal(out.challenge.progress, 1);
  assert.ok((entities.Guild.get(guild.id).total_missions || 0) >= 1);
  const arena = contributeGuildArenaWin(leader);
  assert.equal(arena.success, true);
  assert.equal(arena.challenge.progress, 2);
});

test("guild join leave invite kick", () => {
  const u1 = insertUser("u-g1", "g1@t.test");
  const u2 = insertUser("u-g2", "g2@t.test");
  const leader = makeChar(u1.id, { name: "Leader" });
  const member = makeChar(u2.id, { name: "Member" });
  const guild = entities.Guild.create({
    name: `G-${Math.random().toString(36).slice(2, 6)}`,
    tag: "TST",
    leader_id: leader.id,
    leader_name: leader.name,
    member_count: 1,
    level: 1,
  });
  entities.GuildMember.create({
    guild_id: guild.id,
    character_id: leader.id,
    character_name: leader.name,
    role: "leader",
    joined_date: new Date().toISOString(),
  });
  const inv = inviteToGuild(leader, member.id);
  assert.ok(inv.mail?.id);
  acceptGuildInvite(member, inv.mail.id);
  assert.ok(entities.GuildMember.filter({ character_id: member.id })[0]);
  kickGuildMember(leader, member.id);
  assert.equal(entities.GuildMember.filter({ character_id: member.id }).length, 0);
  joinGuild(member, guild.id);
  leaveGuild(member);
  assert.equal(entities.GuildMember.filter({ character_id: member.id }).length, 0);
});

await testAsync("RPC profile search friend chat mail guild", async () => {
  const u1 = insertUser("u-rpc1", "rpc1@t.test");
  const u2 = insertUser("u-rpc2", "rpc2@t.test");
  const a = makeChar(u1.id, { name: "RpcAlice" });
  const b = makeChar(u2.id, { name: "RpcBob" });
  const user1 = pin(u1, a);
  const user2 = pin(u2, b);

  const profile = await GetPublicProfile(user1, { character_id: b.id });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.profile.name, "RpcBob");

  const search = await SearchCharacters(user1, { query: "RpcBob" });
  assert.equal(search.status, 200);
  assert.ok(search.body.results.some((r) => r.id === b.id));

  const fr = await SendFriendRequest(user1, { to_character_id: b.id });
  assert.equal(fr.status, 200);
  const acc = await AcceptFriendRequest(user2, { request_id: fr.body.request.id });
  assert.equal(acc.status, 200);

  const chat = await SendMessage(user1, { channel: "global", content: "hello fleet" });
  assert.equal(chat.status, 200);

  const dm = await SendMessage(user1, { channel: "private", recipient_id: b.id, content: "psst" });
  assert.equal(dm.status, 200);

  createSystemMail({
    ownerId: a.id,
    subject: "Reward",
    body: "claim me",
    rewards: { stardust: 5 },
  });
  const inbox = await GetInbox(user1, {});
  assert.equal(inbox.status, 200);
  const rewardMail = inbox.body.mail.find((m) => m.has_rewards);
  assert.ok(rewardMail);
  const claim = await ClaimMailReward(user1, { mail_id: rewardMail.id });
  assert.equal(claim.status, 200);
  const claim2 = await ClaimMailReward(user1, { mail_id: rewardMail.id });
  assert.ok(claim2.status === 409 || claim2.body?.idempotentReplay || claim2.status === 200);

  // Entity create of Friendship still blocked
  assert.equal(canCreateType(user1, "Friendship", {}), false);
});

await testAsync("cross-account mail claim rejected", async () => {
  const u1 = insertUser("u-x1", "x1@t.test");
  const u2 = insertUser("u-x2", "x2@t.test");
  const a = makeChar(u1.id);
  const b = makeChar(u2.id);
  const user2 = pin(u2, b);
  const mail = createSystemMail({
    ownerId: a.id,
    subject: "Mine",
    body: "nope",
    rewards: { stardust: 1 },
  });
  const claim = await ClaimMailReward(user2, { mail_id: mail.id });
  assert.equal(claim.status, 403);
});

test("guild war ready + resolve is server-authoritative", () => {
  resetClockState();
  const now = Date.UTC(2026, 7, 4, 12, 0, 0);
  installFakeClock(now);

  const u1 = insertUser("u-war1", "war1@t.test");
  const u2 = insertUser("u-war2", "war2@t.test");
  const atkLeader = makeChar(u1.id, { name: "AtkLead", level: 10 });
  const defLeader = makeChar(u2.id, { name: "DefLead", level: 8 });
  const atkGuild = entities.Guild.create({
    name: `Atk-${Math.random().toString(36).slice(2, 6)}`,
    tag: "ATK",
    leader_id: atkLeader.id,
    leader_name: atkLeader.name,
    member_count: 1,
    level: 1,
  });
  const defGuild = entities.Guild.create({
    name: `Def-${Math.random().toString(36).slice(2, 6)}`,
    tag: "DEF",
    leader_id: defLeader.id,
    leader_name: defLeader.name,
    member_count: 1,
    level: 1,
  });
  entities.GuildMember.create({
    guild_id: atkGuild.id,
    character_id: atkLeader.id,
    character_name: atkLeader.name,
    role: "leader",
    joined_date: new Date(now).toISOString(),
  });
  entities.GuildMember.create({
    guild_id: defGuild.id,
    character_id: defLeader.id,
    character_name: defLeader.name,
    role: "leader",
    joined_date: new Date(now).toISOString(),
  });
  const war = entities.GuildWar.create({
    attacker_guild_id: atkGuild.id,
    defender_guild_id: defGuild.id,
    attacker_guild_name: atkGuild.name,
    defender_guild_name: defGuild.name,
    status: "readying",
    ready_deadline: new Date(now + 60_000).toISOString(),
    declared_at: new Date(now).toISOString(),
    initiated_by: atkLeader.name,
  });

  assert.equal(toggleGuildWarReady(atkLeader, war.id).ready, true);
  assert.equal(toggleGuildWarReady(defLeader, war.id).ready, true);
  assert.throws(() => resolveGuildWar(atkLeader, war.id), /Ready window/);

  installFakeClock(now + 120_000);
  const resolved = resolveGuildWar(atkLeader, war.id);
  assert.equal(resolved.success, true);
  assert.equal(resolved.war.status, "completed");
  assert.ok(["attacker", "defender"].includes(resolved.winner_side));
  const replay = resolveGuildWar(defLeader, war.id);
  assert.equal(replay.replay, true);
  resetClockState();
});

await testAsync("DeleteMyCharacter purges owned character", async () => {
  const u1 = insertUser("u-del1", "del1@t.test");
  const ch = makeChar(u1.id, { name: "Doomed" });
  entities.Item.create({
    character_id: ch.id,
    name: "Scrap",
    type: "material",
    created_by_id: u1.id,
  });
  entities.GalaxyNews.create({
    message: "Doomed did a thing",
    character_id: ch.id,
    character_name: ch.name,
    entry_type: "victory",
  });
  const user1 = pin(u1, ch);
  const res = await DeleteMyCharacter(user1, { character_id: ch.id });
  assert.equal(res.status, 200);
  assert.equal(entities.Character.get(ch.id), null);
  assert.equal(entities.Item.filter({ character_id: ch.id }).length, 0);
  assert.equal(entities.GalaxyNews.filter({ character_id: ch.id }).length, 0);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
