/**
 * Statistics / leaderboard authority tests (Restoration 19).
 * Run: npm run test:statistics
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-stats-"));
process.env.DB_PATH = path.join(tmpDir, "test-stats.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  STATISTIC_DEFINITIONS,
  LEADERBOARD_DEFINITIONS,
  serializeCharacterStatistics,
  serializePublicProfileStatistics,
  serializeLeaderboardPage,
  getNearbyArenaEntries,
  sortedArenaCharacters,
  serializeGuildLeaderboardPage,
  getNearbyGuildEntries,
  sortedGuilds,
} = await import("../src/shared/statisticsService.js");
const { computeArenaRank, listArenaLeaderboard } = await import("../src/shared/arenaService.js");
const { computeGuildRank, listGuildLeaderboard } = await import("../src/shared/guildSocialService.js");
const { FUNCTION_HANDLERS } = await import("../src/functions/index.js");
const {
  GetCharacterStatistics,
  GetPublicProfileStatistics,
  GetArenaLeaderboard,
  GetGuildLeaderboard,
} = await import("../src/functions/economyFollowOn.js");

let passed = 0;
let failed = 0;
const FORMER_GUILD_MEMBER_HYDRATION_CAP = 500;

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
  const ch = entities.Character.create({
    name: opts.name || `C-${Math.random().toString(36).slice(2, 7)}`,
    created_by_id: ownerId,
    level: opts.level ?? 10,
    class: opts.class || "vanguard",
    race: opts.race || "human",
    arena_rating: opts.arena_rating ?? 1000,
    arena_wins: opts.arena_wins ?? 0,
    arena_losses: opts.arena_losses ?? 0,
    arena_battles: opts.arena_battles ?? 0,
    arena_streak: opts.arena_streak ?? 0,
    arena_max_streak: opts.arena_max_streak ?? 0,
    missions_completed: opts.missions_completed ?? 0,
    dungeon_clears: opts.dungeon_clears ?? 0,
    highest_damage: opts.highest_damage ?? 0,
    highest_sector: opts.highest_sector ?? 1,
    total_stardust_earned: opts.total_stardust_earned ?? 0,
    stardust: opts.stardust ?? 0,
    ...opts.extra,
  });
  return ch;
}

console.log("\nStatistics / Leaderboards (Restoration 19)\n");

test("statistic definition IDs are unique", () => {
  const ids = STATISTIC_DEFINITIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("statistic definitions have required fields", () => {
  for (const d of STATISTIC_DEFINITIONS) {
    assert.ok(d.id);
    assert.ok(["character", "account"].includes(d.scope));
    assert.ok(d.value_type);
    assert.ok(d.op);
    assert.ok(d.source);
    assert.ok(d.period);
  }
});

test("leaderboard definitions unique and arena_rating present", () => {
  const ids = LEADERBOARD_DEFINITIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("arena_rating"));
  assert.equal(LEADERBOARD_DEFINITIONS[0].nakama_mirror, false);
  assert.equal(LEADERBOARD_DEFINITIONS[0].sort, "desc");
});

test("serialize owner stats includes private earned + balance separately", () => {
  const u = insertUser("u-own", "own@t.test");
  const ch = makeChar(u.id, {
    missions_completed: 7,
    total_stardust_earned: 5000,
    stardust: 200,
    highest_damage: 999,
    arena_max_streak: 4,
  });
  const s = serializeCharacterStatistics(ch, { includePrivate: true });
  assert.equal(s.missions_completed, 7);
  assert.equal(s.total_stardust_earned, 5000);
  assert.equal(s.stardust, 200);
  assert.notEqual(s.total_stardust_earned, s.stardust);
  assert.equal(s.personal_records.highest_damage.value, 999);
  assert.equal(s.personal_records.arena_max_streak.value, 4);
});

test("public profile stats omit currency", () => {
  const u = insertUser("u-pub", "pub@t.test");
  const ch = makeChar(u.id, { total_stardust_earned: 9000, stardust: 400 });
  const s = serializePublicProfileStatistics(ch);
  assert.equal(s.total_stardust_earned, undefined);
  assert.equal(s.stardust, undefined);
  assert.ok(s.missions_completed !== undefined);
});

test("arena rank ordering: rating then wins then id", () => {
  const u = insertUser("u-rank", "rank@t.test");
  const a = makeChar(u.id, { name: "A", arena_rating: 1200, arena_wins: 1 });
  const b = makeChar(u.id, { name: "B", arena_rating: 1200, arena_wins: 5 });
  const c = makeChar(u.id, { name: "C", arena_rating: 1500, arena_wins: 0 });
  const sorted = sortedArenaCharacters().filter((x) =>
    [a.id, b.id, c.id].includes(x.id),
  );
  assert.equal(sorted[0].id, c.id);
  assert.equal(sorted[1].id, b.id);
  assert.equal(sorted[2].id, a.id);
  assert.equal(computeArenaRank(c.id), sortedArenaCharacters().findIndex((x) => x.id === c.id) + 1);
});

test("leaderboard pagination no overlap", () => {
  const u = insertUser("u-page", "page@t.test");
  for (let i = 0; i < 8; i++) {
    makeChar(u.id, { name: `P${i}`, arena_rating: 1000 + i, arena_wins: i });
  }
  const p0 = serializeLeaderboardPage({ limit: 3, offset: 0 });
  const p1 = serializeLeaderboardPage({ limit: 3, offset: 3 });
  const ids0 = new Set(p0.rankings.map((r) => r.character_id));
  for (const r of p1.rankings) {
    assert.equal(ids0.has(r.character_id), false);
  }
  assert.equal(p0.rankings[0].rank, 1);
  assert.equal(p1.rankings[0].rank, 4);
  assert.ok(p0.rankings[0].id);
});

test("arena leaderboard resolves guild tags beyond the former hydration cap", () => {
  const u = insertUser("u-tag-cap", "tag-cap@t.test");
  const target = makeChar(u.id, { name: "TaggedTarget", arena_rating: 1_000_000 });
  const targetGuild = entities.Guild.create({
    name: "Ancient Guild",
    tag: "OLD",
    leader_id: target.id,
    leader_name: target.name,
    member_count: 1,
  });
  entities.GuildMember.create({
    guild_id: targetGuild.id,
    character_id: target.id,
    character_name: target.name,
    role: "leader",
    created_date: "2000-01-01T00:00:00.000Z",
  });
  const fillerGuild = entities.Guild.create({
    name: "Filler Guild",
    tag: "FIL",
    leader_id: "filler-leader",
    leader_name: "Filler",
    member_count: FORMER_GUILD_MEMBER_HYDRATION_CAP + 1,
  });
  for (let index = 0; index <= FORMER_GUILD_MEMBER_HYDRATION_CAP; index += 1) {
    entities.GuildMember.create({
      guild_id: fillerGuild.id,
      character_id: `filler-character-${index}`,
      character_name: `Filler ${index}`,
      role: "member",
      created_date: `2026-01-01T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
    });
  }
  const row = listArenaLeaderboard({ limit: 1, offset: 0 })[0];
  assert.equal(row.character_id, target.id);
  assert.equal(row.guild_tag, "OLD");
});

test("nearby includes self and correct rank", () => {
  const u = insertUser("u-near", "near@t.test");
  const chars = [];
  for (let i = 0; i < 11; i++) {
    chars.push(makeChar(u.id, { name: `N${i}`, arena_rating: 2000 - i * 10, arena_wins: 0 }));
  }
  const mid = chars[5];
  const near = getNearbyArenaEntries(mid.id, { radius: 2 });
  assert.ok(near.player_rank > 0);
  assert.ok(near.entries.some((e) => e.is_self));
  assert.ok(near.entries.length <= 5);
  const self = near.entries.find((e) => e.is_self);
  assert.equal(self.rank, near.player_rank);
});

test("tie group deterministic by character id", () => {
  const u = insertUser("u-tie", "tie@t.test");
  const x = makeChar(u.id, { name: "X", arena_rating: 1111, arena_wins: 3 });
  const y = makeChar(u.id, { name: "Y", arena_rating: 1111, arena_wins: 3 });
  const page = listArenaLeaderboard({ limit: 200, offset: 0 });
  const pair = page.filter((r) => r.character_id === x.id || r.character_id === y.id);
  assert.equal(pair.length, 2);
  const expectedFirst = String(x.id).localeCompare(String(y.id)) < 0 ? x.id : y.id;
  assert.equal(pair[0].character_id, expectedFirst);
});

await testAsync("GetCharacterStatistics returns owner counters", async () => {
  const u = insertUser("u-gcs", "gcs@t.test");
  const ch = makeChar(u.id, { missions_completed: 12, arena_wins: 3 });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, u.id);
  const user = { ...u, active_character_id: ch.id };
  const res = await GetCharacterStatistics(user, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.statistics.missions_completed, 12);
  assert.equal(res.body.statistics.arena_wins, 3);
});

await testAsync("GetCharacterStatistics rejects client mutation keys", async () => {
  const u = insertUser("u-mut", "mut@t.test");
  const ch = makeChar(u.id, {});
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(ch.id, u.id);
  const user = { ...u, active_character_id: ch.id };
  const res = await GetCharacterStatistics(user, { arena_wins: 9999 });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "STAT_CLIENT_MUTATION");
});

await testAsync("GetPublicProfileStatistics hides stardust", async () => {
  const u1 = insertUser("u-p1", "p1@t.test");
  const u2 = insertUser("u-p2", "p2@t.test");
  const viewer = makeChar(u1.id, {});
  const target = makeChar(u2.id, { total_stardust_earned: 777, stardust: 50, missions_completed: 2 });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(viewer.id, u1.id);
  const res = await GetPublicProfileStatistics(
    { ...u1, active_character_id: viewer.id },
    { character_id: target.id },
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.statistics.missions_completed, 2);
  assert.equal(res.body.statistics.total_stardust_earned, undefined);
  assert.equal(res.body.statistics.stardust, undefined);
});

await testAsync("GetArenaLeaderboard page + nearby + player_rank", async () => {
  const u = insertUser("u-lb", "lb@t.test");
  for (let i = 0; i < 5; i++) {
    makeChar(u.id, { name: `L${i}`, arena_rating: 1300 + i * 20 });
  }
  const me = makeChar(u.id, { name: "Me", arena_rating: 1350, arena_wins: 2 });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(me.id, u.id);
  const res = await GetArenaLeaderboard(
    { ...u, active_character_id: me.id },
    { limit: 50, offset: 0, nearby: true, nearby_radius: 3 },
  );
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.rankings));
  assert.ok(res.body.player_rank >= 1);
  assert.ok(res.body.nearby);
  assert.ok(res.body.nearby.entries.some((e) => e.is_self));
  assert.equal(res.body.leaderboard_id, "arena_rating");
});

function makeGuild(opts = {}) {
  return entities.Guild.create({
    name: opts.name || `G-${Math.random().toString(36).slice(2, 7)}`,
    tag: opts.tag || "TAG",
    leader_id: opts.leader_id || "c1",
    leader_name: opts.leader_name || "Lead",
    level: opts.level ?? 1,
    experience: opts.experience ?? 0,
    experience_to_next: opts.experience_to_next ?? 1000,
    member_count: opts.member_count ?? 1,
    created_date: opts.created_date,
  });
}

test("guild ranking definition present", () => {
  const ids = LEADERBOARD_DEFINITIONS.map((d) => d.id);
  assert.ok(ids.includes("guild_level"));
});

test("guild leaderboard is registered as an RPC function", () => {
  assert.equal(FUNCTION_HANDLERS.GetGuildLeaderboard, GetGuildLeaderboard);
});

test("guild rank: level then xp then members then created_date then id", () => {
  const u = insertUser("u-gr", "gr@t.test");
  const low = makeGuild({ name: "Low", tag: "LOW", level: 2, experience: 900, member_count: 40 });
  const midXp = makeGuild({ name: "MidXp", tag: "MXP", level: 5, experience: 10, member_count: 2 });
  const highXp = makeGuild({ name: "HiXp", tag: "HXP", level: 5, experience: 800, member_count: 2 });
  const moreMem = makeGuild({ name: "Mem", tag: "MEM", level: 5, experience: 800, member_count: 9 });
  const top = makeGuild({ name: "Top", tag: "TOP", level: 8, experience: 0, member_count: 1 });
  const ids = new Set([low.id, midXp.id, highXp.id, moreMem.id, top.id]);
  const sorted = sortedGuilds().filter((g) => ids.has(g.id));
  assert.equal(sorted[0].id, top.id);
  assert.equal(sorted[1].id, moreMem.id);
  assert.equal(sorted[2].id, highXp.id);
  assert.equal(sorted[3].id, midXp.id);
  assert.equal(sorted[4].id, low.id);
  assert.equal(computeGuildRank(top.id), sortedGuilds().findIndex((g) => g.id === top.id) + 1);
  void u;
});

test("guild nearby radius zero returns only the selected guild", () => {
  const guild = makeGuild({
    name: "RadiusZero",
    tag: "RZ0",
    level: 3,
    experience: 75,
    member_count: 2,
  });
  const nearby = getNearbyGuildEntries(guild.id, { radius: 0 });
  assert.equal(nearby.radius, 0);
  assert.equal(nearby.entries.length, 1);
  assert.equal(nearby.entries[0].guild_id, guild.id);
});

test("guild pagination no overlap and ordinal ranks", () => {
  const stamp = Date.now();
  for (let i = 0; i < 6; i++) {
    makeGuild({
      name: `GP${i}`,
      tag: `G${i}`,
      level: 1,
      experience: i,
      member_count: 1,
      created_date: new Date(stamp + i).toISOString(),
    });
  }
  const p0 = serializeGuildLeaderboardPage({ limit: 2, offset: 0 });
  const p1 = serializeGuildLeaderboardPage({ limit: 2, offset: 2 });
  const ids0 = new Set(p0.rankings.map((r) => r.guild_id));
  for (const r of p1.rankings) {
    assert.equal(ids0.has(r.guild_id), false);
  }
  assert.equal(p0.leaderboard_id, "guild_level");
  assert.equal(p0.rankings[0].rank, 1);
  assert.equal(p1.rankings[0].rank, 3);
});

test("equal level+xp+members ties by created_date then id", () => {
  const a = makeGuild({
    name: "TieA",
    tag: "TIA",
    level: 4,
    experience: 50,
    member_count: 3,
    created_date: "2026-01-01T00:00:00.000Z",
  });
  const b = makeGuild({
    name: "TieB",
    tag: "TIB",
    level: 4,
    experience: 50,
    member_count: 3,
    created_date: "2026-01-01T00:00:00.000Z",
  });
  const page = listGuildLeaderboard({ limit: 500, offset: 0 });
  const pair = page.filter((r) => r.guild_id === a.id || r.guild_id === b.id);
  assert.equal(pair.length, 2);
  const expectedFirst = String(a.id).localeCompare(String(b.id)) < 0 ? a.id : b.id;
  assert.equal(pair[0].guild_id, expectedFirst);
});

await testAsync("GetGuildLeaderboard page + your guild + no-guild viewer", async () => {
  const u = insertUser("u-glb", "glb@t.test");
  const me = makeChar(u.id, { name: "GMe" });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(me.id, u.id);
  const user = { ...u, active_character_id: me.id };
  const none = await GetGuildLeaderboard(user, { limit: 20, offset: 0, nearby: true });
  assert.equal(none.status, 200);
  assert.equal(none.body.in_guild, false);
  assert.equal(none.body.player_guild_rank, 0);
  assert.equal(none.body.your_guild, null);
  assert.equal(none.body.leaderboard_id, "guild_level");

  const g = makeGuild({ name: "Mine", tag: "MIN", level: 6, experience: 100, leader_id: me.id, leader_name: me.name });
  entities.GuildMember.create({
    guild_id: g.id,
    character_id: me.id,
    character_name: me.name,
    role: "leader",
  });
  const originalGuildFilter = entities.Guild.filter;
  let guildFilterCalls = 0;
  entities.Guild.filter = (...args) => {
    guildFilterCalls += 1;
    return originalGuildFilter(...args);
  };
  let res;
  try {
    res = await GetGuildLeaderboard(user, { limit: 50, offset: 0, nearby: true });
  } finally {
    entities.Guild.filter = originalGuildFilter;
  }
  assert.equal(res.status, 200);
  assert.equal(guildFilterCalls, 1, "one Guild Ranking request builds one sorted guild snapshot");
  assert.equal(res.body.in_guild, true);
  assert.ok(res.body.player_guild_rank >= 1);
  assert.equal(res.body.your_guild.guild_id, g.id);
  assert.ok(res.body.rankings.some((r) => r.is_self && r.guild_id === g.id));
  assert.ok(res.body.nearby.entries.some((e) => e.is_self));
});

await testAsync("client score/rank on leaderboard body is stripped not trusted", async () => {
  const u = insertUser("u-forge", "forge@t.test");
  const me = makeChar(u.id, { arena_rating: 1000 });
  db.prepare("UPDATE users SET active_character_id = ? WHERE id = ?").run(me.id, u.id);
  const res = await GetArenaLeaderboard(
    { ...u, active_character_id: me.id },
    { limit: 10, arena_rating: 99999, rank: 1 },
  );
  assert.equal(res.status, 200);
  const selfRow = res.body.rankings.find((r) => r.character_id === me.id);
  if (selfRow) {
    assert.equal(selfRow.arena_rating, 1000);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
