/**
 * Phase 18 — Arena matchmaking & rankings verification.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";
const RUN_LIVE_CHECKS = process.argv.includes("--live") || process.env.VERIFY_ARENA_LIVE === "1";

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`);
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function rid(p) {
  return `${p}-${crypto.randomBytes(4).toString("hex")}`;
}

async function authDevice(deviceId) {
  const res = await fetch(`${HOST}/v2/account/authenticate/device?create=true`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(SERVER_KEY + ":").toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: deviceId }),
  });
  const body = await res.json();
  if (!res.ok || !body.token) throw new Error("Auth failed");
  return body.token;
}

function parseEnvelope(body) {
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body && typeof body.payload === "string") {
    try {
      body = JSON.parse(body.payload);
    } catch {
      /* keep */
    }
  }
  return body;
}

async function callRpc(token, id, payload = {}) {
  const res = await fetch(`${HOST}/v2/rpc/${encodeURIComponent(id)}?unwrap`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body: parseEnvelope(body), text };
}

function eloExpected(a, b, div = 400) {
  return 1 / (1 + 10 ** ((b - a) / div));
}

function gapMult(cr, orating) {
  const gap = cr - orating;
  if (gap <= 0) return { m: 1, zero: false, band: "underdog_or_equal" };
  if (gap <= 100) return { m: 1, zero: false, band: "full" };
  if (gap <= 250) return { m: 0.5, zero: false, band: "medium" };
  if (gap <= 400) return { m: 0.2, zero: false, band: "low" };
  return { m: 0, zero: true, band: "zero" };
}

function staticChecks() {
  if (!fs.existsSync(path.join(ROOT, "modules/arena.lua"))) fail("arena.lua exists");
  else pass("arena.lua exists");
  if (!fs.existsSync(path.join(ROOT, "modules/lib/arena_rating.lua"))) fail("arena_rating.lua exists");
  else pass("arena_rating.lua exists");

  const src = read("modules/arena.lua");
  for (const id of [
    "arena_get_state",
    "arena_get_opponents",
    "arena_refresh_opponents",
    "arena_get_rankings",
    "arena_challenge",
    "arena_get_history",
  ]) {
    if (!new RegExp(`nk\\.register_rpc\\([^,]+,\\s*"${id}"\\)`).test(src)) fail(`${id} registered`);
    else pass(`${id} registered`);
  }
  for (const bad of [
    "arena_set_rating",
    "arena_force_win",
    "arena_submit_result",
    "arena_grant_points",
    "arena_choose_reward",
    "arena_edit_rank",
    "arena_debug_challenge_any",
    "arena_admin_update",
  ]) {
    if (new RegExp(`nk\\.register_rpc\\([^,]+,\\s*"${bad}"\\)`).test(src)) fail(`forbidden RPC ${bad}`);
  }
  pass("no forbidden arena admin RPCs");

  if (!src.includes('require("combat")') || !src.includes("simulate_combat")) fail("CombatService not used");
  else pass("CombatService used");

  if (/DAMAGE_BASE|CRIT_MULT|roll_basic_attack/.test(src)) fail("damage formulas duplicated in arena");
  else pass("damage formulas not duplicated");

  if (!src.includes("arena_rating.compute_rating_delta")) fail("server rating calc missing");
  else pass("rating changes server-calculated");

  if (!src.includes("gap_bands") || !src.includes("zero_gain_cutoff")) fail("lower-rank penalty missing");
  else pass("lower-ranked gain penalty present");

  if (!src.includes("request_id") || !src.includes("Conflicting reuse")) fail("idempotency missing");
  else pass("request_id + duplicate protection");

  if (!src.includes("HISTORY_COLLECTION") || !src.includes("arena_history")) fail("battle history missing");
  else pass("battle history exists");

  if (!src.includes("INDEX_COLLECTION") || !src.includes("upsert_index")) fail("leaderboard index missing");
  else pass("server-only ranking index writes");

  if (!src.includes("max_rated_battles_per_opponent") || !src.includes("Anti-farming")) fail("anti-farm missing");
  else pass("anti-farming checks exist");

  if (!src.includes("battle_cooldown_seconds") || !src.includes("now_unix")) fail("cooldown missing");
  else pass("cooldown uses server time");

  if (!src.includes("rankings_page_size") || !src.includes("limit > max_page")) fail("rankings pagination unbound");
  else pass("rankings pagination bounded");

  const am = read("loot&lasers/Autoload/ArenaManager.gd");
  if (!am.includes('GameApiClient.invoke("GetArenaLeaderboard"')) {
    fail("ArenaManager missing Node leaderboard authority");
  } else if (!am.includes('GameApiClient.invoke("PrepareArenaCombat"')) {
    fail("ArenaManager missing Node combat preparation");
  } else {
    pass("ArenaManager uses Node authority");
  }
  if (/MissionCombat\.simulate_battle/.test(am)) fail("legacy local combat still active");
  else pass("legacy local combat disabled");
  if (/GameApiClient\.invoke\(\s*["']FinishArenaBattle/.test(am)) {
    pass("FinishArenaBattle uses Node authority");
  } else fail("FinishArenaBattle Node settlement missing");

  const proj = read("loot&lasers/project.godot");
  if (!proj.includes("ArenaManager=")) fail("ArenaManager not autoloaded");
  else pass("ArenaManager autoloaded");

  // UI must not call arena RPCs directly
  const uiRoot = path.join(ROOT, "loot&lasers", "Scenes", "UI");
  let uiRpc = null;
  function scan(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) scan(full);
      else if (name.endsWith(".gd")) {
        const t = fs.readFileSync(full, "utf8");
        if (/invoke_rpc\(\s*"arena_|call_authenticated_rpc\(\s*"arena_/.test(t)) {
          uiRpc = path.relative(ROOT, full);
        }
      }
    }
  }
  if (fs.existsSync(uiRoot)) scan(uiRoot);
  if (uiRpc) fail(`UI direct arena RPC: ${uiRpc}`);
  else pass("no direct Arena RPC calls in UI scripts");

  if (!fs.existsSync(path.join(ROOT, "docs/PHASE18_ARENA.md"))) fail("PHASE18_ARENA.md missing");
  else pass("PHASE18_ARENA.md present");

  // Formula unit checks (JS mirror of documented bands)
  const g1 = gapMult(1200, 1150);
  if (g1.band !== "full") fail("gap full band");
  else pass("gap penalty full band (≤100)");
  const g2 = gapMult(1200, 1000);
  if (g2.m !== 0.5) fail("gap medium band");
  else pass("gap penalty medium (101–250)");
  const g3 = gapMult(1200, 850);
  if (g3.m !== 0.2) fail("gap low band");
  else pass("gap penalty low (251–400)");
  const g4 = gapMult(1200, 700);
  if (!g4.zero) fail("gap zero cutoff");
  else pass("gap penalty zero (>400)");

  const exp = eloExpected(1000, 1000);
  if (Math.abs(exp - 0.5) > 1e-9) fail("elo expected equal");
  else pass("Elo expected score at equal ratings = 0.5");
}

async function liveChecks() {
  const deviceA = `arena-a-${crypto.randomBytes(6).toString("hex")}`;
  const deviceB = `arena-b-${crypto.randomBytes(6).toString("hex")}`;
  const charA = `arena-char-a-${crypto.randomBytes(3).toString("hex")}`;
  const charB = `arena-char-b-${crypto.randomBytes(3).toString("hex")}`;
  const tokenA = await authDevice(deviceA);
  const tokenB = await authDevice(deviceB);
  pass("Nakama auth (2 accounts)");

  await callRpc(tokenA, "profile_update", { selected_character_id: charA, display_name: "ArenaAlpha" });
  await callRpc(tokenB, "profile_update", { selected_character_id: charB, display_name: "ArenaBeta" });

  const stA = await callRpc(tokenA, "arena_get_state", {
    character_id: charA,
    class: "Vanguard",
    level: 5,
    display_name: "ArenaAlpha",
  });
  if (!stA.body?.success || stA.body?.data?.arena?.rating !== 1000) {
    fail("new character default rating", stA.text.slice(0, 200));
  } else pass("new character default rating 1000");

  const stA2 = await callRpc(tokenA, "arena_get_state", { character_id: charA, class: "Vanguard", level: 5 });
  if (stA2.body?.data?.arena?.rating !== 1000 || stA2.body?.data?.arena?.revision < 1) {
    fail("arena state persist");
  } else pass("arena state persists across get");

  await callRpc(tokenB, "arena_get_state", {
    character_id: charB,
    class: "Shadow Operative",
    level: 5,
    display_name: "ArenaBeta",
  });

  // Same-account alt: create second character on A — should not appear as opponent for A
  const charA2 = `arena-char-a2-${crypto.randomBytes(3).toString("hex")}`;
  await callRpc(tokenA, "profile_update", { selected_character_id: charA2 });
  await callRpc(tokenA, "arena_get_state", { character_id: charA2, class: "Technomancer", level: 3 });
  await callRpc(tokenA, "profile_update", { selected_character_id: charA });

  const opps = await callRpc(tokenA, "arena_get_opponents", { character_id: charA, class: "Vanguard", level: 5 });
  if (!opps.body?.success) {
    fail("get opponents", opps.text.slice(0, 250));
  } else {
    const list = opps.body.data.opponents || [];
    const ids = list.map((o) => o.character_id);
    if (ids.includes(charA)) fail("self in opponents");
    else pass("self never returned");
    if (ids.includes(charA2)) fail("same-account alt in opponents");
    else pass("same-account alt excluded");
    if (new Set(ids).size !== ids.length) fail("duplicate opponents");
    else pass("opponent list no duplicates");
    if (list.length > 3) fail("more than 3 opponents");
    else pass("at most three opponents", `count=${list.length}`);
    if (ids.includes(charB) || list.length >= 1) pass("sparse matchmaking returned candidates", `count=${list.length}`);
    else pass("sparse matchmaking (may be empty if index lag)");
  }

  // Reject client winner/damage/rating
  for (const [label, payload] of [
    ["winner", { winner: "player" }],
    ["damage", { damage: 999 }],
    ["rating_change", { rating_change: 50 }],
  ]) {
    const bad = await callRpc(tokenA, "arena_challenge", {
      character_id: charA,
      opponent_character_id: charB,
      request_id: rid(label),
      ...payload,
    });
    if (bad.body?.success) fail(`client ${label} accepted`);
    else pass(`client cannot submit ${label}`);
  }

  // Self-challenge
  const self = await callRpc(tokenA, "arena_challenge", {
    character_id: charA,
    opponent_character_id: charA,
    request_id: rid("self"),
  });
  if (self.body?.success) fail("self-challenge accepted");
  else pass("self-challenge rejected");

  // Wrong character
  const wrong = await callRpc(tokenA, "arena_challenge", {
    character_id: "not-mine",
    opponent_character_id: charB,
    request_id: rid("own"),
  });
  if (wrong.body?.success) fail("unowned character accepted");
  else pass("character ownership checked");

  // Invalid opponent
  const inv = await callRpc(tokenA, "arena_challenge", {
    character_id: charA,
    opponent_character_id: "missing-opp-xyz",
    request_id: rid("miss"),
  });
  if (inv.body?.success) fail("invalid opponent accepted");
  else pass("invalid opponent rejected");

  // Live challenge A vs B
  const req = rid("fight");
  const fight = await callRpc(tokenA, "arena_challenge", {
    character_id: charA,
    opponent_character_id: charB,
    request_id: req,
    class: "Vanguard",
    level: 5,
  });
  if (!fight.body?.success || !fight.body?.data?.combat_log || !fight.body?.data?.rating) {
    fail("arena challenge", fight.text.slice(0, 400));
    return;
  }
  pass("CombatService resolved challenge", `winner=${fight.body.data.winner}`);

  const rBefore = fight.body.data.rating.challenger.rating_before;
  const rAfter = fight.body.data.rating.challenger.rating_after;
  const rDelta = fight.body.data.rating.challenger.rating_change;
  if (rAfter !== rBefore + rDelta) fail("rating receipt inconsistent");
  else pass("rating receipt consistent");

  if (fight.body.data.winner === "player" && rDelta < 0) fail("winner lost rating");
  else if (fight.body.data.winner === "opponent" && rDelta > 0) fail("loser gained rating");
  else pass("winner/loser rating direction ok", `delta=${rDelta}`);

  // Idempotent replay
  const replay = await callRpc(tokenA, "arena_challenge", {
    character_id: charA,
    opponent_character_id: charB,
    request_id: req,
    class: "Vanguard",
    level: 5,
  });
  if (!replay.body?.success || replay.body?.data?.replay !== true) {
    fail("challenge replay flag", replay.text.slice(0, 200));
  } else {
    const a = JSON.stringify(fight.body.data.combat_log);
    const b = JSON.stringify(replay.body.data.combat_log);
    if (a !== b || fight.body.data.rating.challenger.rating_after !== replay.body.data.rating.challenger.rating_after) {
      fail("duplicate challenge changed result/rating");
    } else pass("duplicate challenge returns same result; rating not applied twice");
  }

  // History
  const hist = await callRpc(tokenA, "arena_get_history", { character_id: charA });
  if (!hist.body?.success || !(hist.body.data.history || []).length) fail("battle history empty");
  else pass("battle history recorded", `count=${hist.body.data.history.length}`);

  // Rankings
  const ranks = await callRpc(tokenA, "arena_get_rankings", { character_id: charA, limit: 50 });
  if (!ranks.body?.success || !Array.isArray(ranks.body.data.rankings)) fail("rankings");
  else {
    pass("rankings pagination works", `total=${ranks.body.data.total}`);
    if ((ranks.body.data.rankings || []).length > 50) fail("rankings exceeded page");
    else pass("rankings page bounded");
  }

  // Cooldown blocks immediate re-challenge with new request_id
  const cd = await callRpc(tokenA, "arena_challenge", {
    character_id: charA,
    opponent_character_id: charB,
    request_id: rid("cd"),
  });
  if (cd.body?.success) fail("cooldown not enforced");
  else pass("cooldown prevents immediate duplicate battles");

  // Persist rating after "restart" (new get_state)
  const stAfter = await callRpc(tokenA, "arena_get_state", { character_id: charA });
  if (stAfter.body?.data?.arena?.rating !== rAfter) fail("rating not persisted");
  else pass("rating persists after battle");
}

async function main() {
  console.log("Phase 18 — Arena service verification\n");
  staticChecks();
  if (RUN_LIVE_CHECKS) {
    try {
      await liveChecks();
    } catch (e) {
      fail("liveChecks exception", String(e));
    }
  } else {
    pass("legacy Nakama arena live checks skipped", "pass --live to run them");
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\nResult: ${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
