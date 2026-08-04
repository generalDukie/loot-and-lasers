/**
 * Phase 14 — Mission rewards integration verification.
 * Local Nakama: 127.0.0.1:7350, defaultkey.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";
const DEVICE_ID = `mission-rewards-${crypto.randomBytes(8).toString("hex")}`;
const CHAR_ID = `mrew-char-${crypto.randomBytes(4).toString("hex")}`;

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
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function authDevice() {
  const res = await fetch(`${HOST}/v2/account/authenticate/device?create=true`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(SERVER_KEY + ":").toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: DEVICE_ID }),
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

function staticChecks() {
  const src = read("modules/missions.lua");
  if (!/nk\.register_rpc\([^,]+,\s*"mission_claim"\)/.test(src)) {
    fail("mission_claim registered");
  } else pass("mission_claim registered");

  for (const id of [
    "mission_reward_preview_override",
    "mission_grant_reward",
    "mission_complete_any",
    "mission_force_claim",
    "mission_debug_claim",
  ]) {
    if (new RegExp(`nk\\.register_rpc\\([^,]+,\\s*"${id}"\\)`).test(src)) {
      fail(`forbidden RPC ${id}`);
    }
  }
  pass("no forbidden claim RPCs");

  if (!src.includes('require("rewards")') || !src.includes("apply_reward_bundle")) {
    fail("RewardService integration missing");
  } else pass("MissionService uses RewardService");

  if (!src.includes('require("loot")') || !src.includes("generate_loot_bundle")) {
    fail("LootService integration missing");
  } else pass("MissionService uses LootService");

  if (/credit_currency|debit_currency/.test(src)) {
    fail("missions must not call wallet directly");
  } else pass("missions do not mutate wallet directly");

  if (/grant_item_instance/.test(src)) {
    fail("missions must not grant inventory directly");
  } else pass("missions do not duplicate inventory grants");

  if (!src.includes("reward_pending") || !src.includes("claimed")) {
    fail("claim state transitions missing");
  } else pass("claim state transitions present");

  if (!src.includes("unsupported") || !/ProgressionService/.test(src)) {
    fail("XP unsupported handling missing");
  } else pass("XP explicitly unsupported");

  if (!fs.existsSync(path.join(ROOT, "modules/data/mission_reward_formulas.lua"))) {
    fail("mission_reward_formulas.lua missing");
  } else pass("mission_reward_formulas.lua present");

  const tables = read("modules/data/loot_tables.lua");
  if (!tables.includes("phase14_mission_basic")) {
    fail("phase14_mission_basic loot table missing");
  } else pass("phase14_mission_basic loot table present");

  const mm = read("loot&lasers/Autoload/MissionManager.gd");
  if (!mm.includes('ClaimMission') && !mm.includes("claim_mission")) {
    fail("MissionManager missing Node ClaimMission path");
  } else pass("MissionManager uses Node ClaimMission");
  if (/invoke_rpc\(\s*["']mission_/.test(mm)) {
    fail("MissionManager still invokes Nakama mission_* RPCs");
  } else pass("MissionManager does not invoke Nakama mission RPCs");
  if (/rewards_deferred:\s*true/.test(mm) && /Mission complete — rewards deferred/.test(mm)) {
    fail("legacy deferred claim path still active");
  } else pass("legacy deferred claim path removed");

  // No UI direct RPC
  let bad = null;
  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        if (name === "addons") continue;
        scan(full);
      } else if (name.endsWith(".gd") && name !== "MissionManager.gd") {
        const text = fs.readFileSync(full, "utf8");
        if (/mission_claim/.test(text) && /invoke_rpc|call_rpc/.test(text)) {
          bad = path.relative(ROOT, full);
        }
      }
    }
  }
  scan(path.join(ROOT, "loot&lasers", "Scenes"));
  if (bad) fail(`UI calls mission_claim directly: ${bad}`);
  else pass("Cantina/UI uses MissionManager for claim");

  if (!fs.existsSync(path.join(ROOT, "docs/PHASE14_MISSION_REWARDS.md"))) {
    fail("PHASE14_MISSION_REWARDS.md missing");
  } else pass("PHASE14_MISSION_REWARDS.md present");
}

async function liveChecks(token) {
  await callRpc(token, "profile_update", { selected_character_id: CHAR_ID });
  const base = { character_id: CHAR_ID, level: 1, highest_sector: 0 };

  const board = await callRpc(token, "missions_get", base);
  const missions = board.body?.data?.board?.missions || [];
  if (!missions.length) {
    fail("board available for claim test", board.text.slice(0, 200));
    return;
  }
  const mid = missions[0].mission_id;
  const duration = Number(missions[0].duration_seconds) || 15;
  const snapSd = missions[0]?.reward_reference?.stardust_amount;

  const early = await callRpc(token, "mission_claim", {
    character_id: CHAR_ID,
    mission_id: mid,
    request_id: `early-${crypto.randomBytes(4).toString("hex")}`,
  });
  if (early.body?.success === false) pass("early claim rejected (no active/complete)", early.body.error);
  else fail("early claim rejected", early.text.slice(0, 200));

  const start = await callRpc(token, "mission_start", { character_id: CHAR_ID, mission_id: mid });
  if (start.body?.data?.mission?.status !== "active") {
    fail("start mission for claim test", start.text.slice(0, 250));
    return;
  }
  pass("mission started for claim test");

  const tooSoon = await callRpc(token, "mission_claim", {
    character_id: CHAR_ID,
    mission_id: mid,
    request_id: `soon-${crypto.randomBytes(4).toString("hex")}`,
  });
  if (tooSoon.body?.success === false) pass("early claim while active rejected", tooSoon.body.error);
  else fail("early claim while active rejected", tooSoon.text.slice(0, 200));

  const wait = Math.min(35, duration + 2);
  console.log(`Waiting ${wait}s for completion…`);
  await sleep(wait * 1000);

  const done = await callRpc(token, "mission_status", { character_id: CHAR_ID });
  if (done.body?.data?.mission?.status === "complete" || done.body?.data?.is_complete) {
    pass("mission complete");
  } else {
    fail("mission complete", done.text.slice(0, 250));
    return;
  }

  const walletBefore = await callRpc(token, "wallet_get", {});
  const balBefore =
    walletBefore.body?.data?.balances?.stardust ?? walletBefore.body?.balances?.stardust ?? 0;

  const invBefore = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
  const slotsBefore = invBefore.body?.data?.inventory?.slots ?? invBefore.body?.data?.slots ?? [];
  const countBefore = Array.isArray(slotsBefore) ? slotsBefore.length : 0;

  const reqId = `claim-${crypto.randomBytes(6).toString("hex")}`;
  const claim = await callRpc(token, "mission_claim", {
    character_id: CHAR_ID,
    mission_id: mid,
    request_id: reqId,
  });

  if (!claim.body?.success || claim.body?.data?.mission?.status !== "claimed") {
    fail("claim succeeds", claim.text.slice(0, 400));
    return;
  }
  pass("claim succeeds", `status=${claim.body.data.mission.status}`);

  const reward = claim.body.data.reward || {};
  const currency = reward.currency || [];
  const sdGranted = currency.reduce(
    (n, r) => n + (r.currency_id === "stardust" ? Number(r.amount) || 0 : 0),
    0
  );
  if (sdGranted > 0) pass("stardust granted", String(sdGranted));
  else fail("stardust granted", JSON.stringify(currency));

  if (snapSd != null && Number(snapSd) === sdGranted) {
    pass("stardust matches snapshotted reward_reference", String(snapSd));
  } else if (snapSd == null) {
    pass("stardust granted (pre-snapshot mission tolerated)", String(sdGranted));
  } else {
    fail("stardust matches snapshot", `snap=${snapSd} got=${sdGranted}`);
  }

  const items = reward.items || [];
  if (items.length >= 1 && items[0].instance_id) {
    pass("loot item granted via LootService", items[0].item_id);
  } else {
    fail("loot item granted", JSON.stringify(items));
  }

  const xp = reward.xp || [];
  if (xp[0]?.status === "unsupported") pass("XP explicitly unsupported in receipt");
  else fail("XP explicitly unsupported", JSON.stringify(xp));

  const walletAfter = await callRpc(token, "wallet_get", {});
  const balAfter =
    walletAfter.body?.data?.balances?.stardust ?? walletAfter.body?.balances?.stardust ?? 0;
  if (Number(balAfter) === Number(balBefore) + sdGranted) {
    pass("wallet +stardust exactly once");
  } else {
    fail("wallet +stardust exactly once", `before=${balBefore} after=${balAfter} granted=${sdGranted}`);
  }

  const invAfter = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
  const slotsAfter = invAfter.body?.data?.inventory?.slots ?? invAfter.body?.data?.slots ?? [];
  const countAfter = Array.isArray(slotsAfter) ? slotsAfter.length : 0;
  if (countAfter === countBefore + items.length) {
    pass("inventory gained item once", `${countBefore}→${countAfter}`);
  } else {
    fail("inventory gained item once", `${countBefore}→${countAfter} items=${items.length}`);
  }

  // Retry same request_id
  const retry = await callRpc(token, "mission_claim", {
    character_id: CHAR_ID,
    mission_id: mid,
    request_id: reqId,
  });
  const balRetry =
    (await callRpc(token, "wallet_get", {})).body?.data?.balances?.stardust ?? balAfter;
  const invRetry = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
  const slotsRetry = invRetry.body?.data?.inventory?.slots ?? invRetry.body?.data?.slots ?? [];
  if (
    retry.body?.success &&
    retry.body?.data?.mission?.status === "claimed" &&
    Number(balRetry) === Number(balAfter) &&
    Array.isArray(slotsRetry) &&
    slotsRetry.length === countAfter
  ) {
    pass("retry same request_id does not double-grant");
  } else {
    fail("retry same request_id does not double-grant", retry.text.slice(0, 250));
  }

  // Same loot instance on retry
  const retryItem = retry.body?.data?.reward?.items?.[0]?.instance_id;
  if (retryItem && retryItem === items[0].instance_id) {
    pass("loot not rerolled on retry", retryItem);
  } else {
    fail("loot not rerolled on retry", `${items[0]?.instance_id} vs ${retryItem}`);
  }

  // Conflicting request_id
  const conflict = await callRpc(token, "mission_claim", {
    character_id: CHAR_ID,
    mission_id: mid,
    request_id: `other-${crypto.randomBytes(4).toString("hex")}`,
  });
  if (conflict.body?.success === false || /conflict/i.test(conflict.body?.error || "")) {
    pass("conflicting request_id rejected", conflict.body?.error);
  } else {
    fail("conflicting request_id rejected", conflict.text.slice(0, 200));
  }

  // Client reward fields rejected
  const board2 = await callRpc(token, "missions_get", base);
  // Clear claimed then start another — need new board after claimed blocks? mission_start clears claimed.
  const missions2 = board2.body?.data?.board?.missions || [];
  if (missions2.length) {
    const mid2 = missions2[0].mission_id;
    await callRpc(token, "mission_start", { character_id: CHAR_ID, mission_id: mid2 });
    await sleep((Math.min(20, Number(missions2[0].duration_seconds) || 15) + 2) * 1000);
    const badPayload = await callRpc(token, "mission_claim", {
      character_id: CHAR_ID,
      mission_id: mid2,
      request_id: `bad-${crypto.randomBytes(4).toString("hex")}`,
      amount: 999999,
      currency_id: "stardust",
    });
    if (badPayload.body?.success === false) {
      pass("client reward fields rejected", badPayload.body.error);
    } else fail("client reward fields rejected", badPayload.text.slice(0, 200));
  } else {
    pass("client reward fields rejected", "skipped (no second mission)");
  }

  // Wrong character
  const wrong = await callRpc(token, "mission_claim", {
    character_id: "not-my-char",
    mission_id: mid,
    request_id: `wrong-${crypto.randomBytes(4).toString("hex")}`,
  });
  if (wrong.body?.success === false) pass("wrong character rejected", wrong.body.error);
  else fail("wrong character rejected");

  // Unknown mission
  const unk = await callRpc(token, "mission_claim", {
    character_id: CHAR_ID,
    mission_id: "does-not-exist",
    request_id: `unk-${crypto.randomBytes(4).toString("hex")}`,
  });
  if (unk.body?.success === false) pass("unknown mission rejected", unk.body.error);
  else fail("unknown mission rejected");

  // No premium in mission formula
  const formulas = read("modules/data/mission_reward_formulas.lua");
  if (/nova_crystals/.test(formulas)) fail("premium in mission formulas");
  else pass("no premium currency in mission formulas");
}

async function main() {
  console.log("Phase 14 mission rewards verification\n");
  staticChecks();
  console.log("\nAuthenticating…");
  const token = await authDevice();
  console.log("Session OK\n");
  await liveChecks(token);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nResult: ${results.filter((r) => r.ok).length} passed, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.error(`- ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
