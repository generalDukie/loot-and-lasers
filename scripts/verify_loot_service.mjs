/**
 * Phase 13 — Server-authoritative loot generation verification.
 * Local Nakama: 127.0.0.1:7350, defaultkey.
 * Requires LOOT_DEV_LOOT_TEST=1 and LOOT_ENVIRONMENT=development for live tests.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";
const DEVICE_ID = `loot-svc-${crypto.randomBytes(8).toString("hex")}`;
const CHAR_ID = `loot-char-${crypto.randomBytes(4).toString("hex")}`;

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
  if (!res.ok || !body.token) throw new Error("Auth failed: " + JSON.stringify(body));
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
  return { status: res.status, ok: res.ok, body: parseEnvelope(body), text };
}

function looksMissing(status, body, text) {
  const msg = JSON.stringify(body) + " " + text;
  if (status === 404) return true;
  if (/rpc not found/i.test(msg)) return true;
  if (body && (body.status_code === 404 || /rpc not found/i.test(body.error || ""))) return true;
  return false;
}

function staticChecks() {
  if (!fs.existsSync(path.join(ROOT, "modules/loot.lua"))) {
    fail("loot.lua exists");
  } else pass("loot.lua exists");

  if (!fs.existsSync(path.join(ROOT, "modules/data/loot_tables.lua"))) {
    fail("loot_tables.lua exists");
  } else pass("loot_tables.lua exists");

  if (!fs.existsSync(path.join(ROOT, "modules/data/item_definitions.lua"))) {
    fail("item_definitions.lua exists");
  } else pass("item_definitions.lua exists");

  const src = read("modules/loot.lua");
  const forbidden = [
    "loot_generate",
    "roll_loot",
    "grant_random_item",
    "generate_item",
    "loot_debug",
    "loot_from_table",
  ];
  for (const id of forbidden) {
    if (new RegExp(`nk\\.register_rpc\\([^,]+,\\s*"${id}"\\)`).test(src)) {
      fail(`public loot RPC registered: ${id}`);
    }
  }
  pass("no generic public loot-generation RPCs");

  if (!src.includes("transaction_id") || !src.includes("Conflicting reuse")) {
    fail("idempotency / conflict handling missing");
  } else pass("idempotency + conflict handling present");

  if (!src.includes("loot_transactions")) {
    fail("loot_transactions storage missing");
  } else pass("loot_transactions collection present");

  if (!src.includes('require("rewards")') || !src.includes("apply_reward_bundle")) {
    fail("RewardService integration missing");
  } else pass("RewardService.apply_reward_bundle used");

  if (/storage\.write_one\([^)]*inventories/.test(src) || /INV_COLLECTION/.test(src)) {
    fail("loot.lua must not write inventories directly");
  } else pass("loot.lua does not duplicate inventory writes");

  if (!src.includes("LOOT_DEV_LOOT_TEST") || !src.includes("production")) {
    fail("dev gate / production restriction missing");
  } else pass("dev_loot_test gated; production/staging blocked");

  const tables = read("modules/data/loot_tables.lua");
  if (/nova_crystals/.test(tables) || /rarity_weights[\s\S]*legendary/.test(tables)) {
    fail("dev loot tables include legendary/premium");
  } else if (/\bunique\b/.test(tables) && /item_ids/.test(tables) && /unique_/.test(tables)) {
    fail("dev loot tables include unique items");
  } else pass("dev loot tables exclude legendary/unique/premium");

  const defs = read("modules/data/item_definitions.lua");
  for (const id of ["laser_pistol", "plasma_rifle", "scrap_vest"]) {
    if (!defs.includes(id)) {
      fail(`item definition missing: ${id}`);
      return;
    }
  }
  pass("sample item definitions present");

  const inv = read("modules/inventory.lua");
  if (/nk\.register_rpc\([^,]+,\s*"inventory_grant"\)/.test(inv)) {
    fail("inventory_grant publicly registered");
  } else pass("inventory grant remains internal");
  if (!inv.includes("grant_item_instance")) {
    fail("grant_item_instance missing");
  } else pass("inventory.grant_item_instance present");

  const rewards = read("modules/rewards.lua");
  if (!rewards.includes("apply_item_reward") || !rewards.includes("grant_item_instance")) {
    fail("RewardService item path missing");
  } else pass("RewardService item grant path present");
  if (!/source_type.*loot|loot = true/.test(rewards)) {
    fail("loot source_type not authorized in rewards");
  } else pass("loot source_type authorized in RewardService");

  const missions = read("modules/missions.lua");
  if (!/require\("loot"\)/.test(missions) || !/generate_loot_bundle/.test(missions)) {
    fail("missions not wired to loot (Phase 14 expected)");
  } else pass("missions wired to LootService (Phase 14)");

  // UI must not call loot RPCs
  let bad = null;
  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        if (name === "addons") continue;
        scan(full);
      } else if (name.endsWith(".gd")) {
        const text = fs.readFileSync(full, "utf8");
        if (
          /loot_generate|roll_loot|dev_loot_test|grant_random_item/.test(text) &&
          /invoke_rpc|call_rpc/.test(text)
        ) {
          bad = path.relative(ROOT, full);
        }
      }
    }
  }
  scan(path.join(ROOT, "loot&lasers", "Scenes"));
  scan(path.join(ROOT, "loot&lasers", "Autoload"));
  if (bad) fail(`UI calls loot RPC: ${bad}`);
  else pass("no UI loot-generation RPC calls");

  if (!fs.existsSync(path.join(ROOT, "docs/PHASE13_LOOT_GENERATION.md"))) {
    fail("PHASE13_LOOT_GENERATION.md missing");
  } else pass("PHASE13_LOOT_GENERATION.md present");

  const compose = read("docker-compose.yml");
  if (!compose.includes("LOOT_DEV_LOOT_TEST=1")) {
    fail("docker-compose missing LOOT_DEV_LOOT_TEST=1 for local dev");
  } else pass("docker-compose enables LOOT_DEV_LOOT_TEST locally");
}

async function liveChecks(token) {
  await callRpc(token, "profile_update", { selected_character_id: CHAR_ID });

  const forbidden = [
    "loot_generate",
    "roll_loot",
    "grant_random_item",
    "generate_item",
    "loot_debug",
    "loot_from_table",
  ];
  for (const id of forbidden) {
    const r = await callRpc(token, id, { item_id: "laser_pistol" });
    if (looksMissing(r.status, r.body, r.text)) pass(`absent RPC ${id}`);
    else fail(`absent RPC ${id}`, r.text.slice(0, 120));
  }

  const walletBefore = await callRpc(token, "wallet_get", {});
  const balBefore =
    walletBefore.body?.data?.balances?.stardust ?? walletBefore.body?.balances?.stardust ?? 0;

  const invBefore = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
  const slotsBefore = invBefore.body?.data?.inventory?.slots ?? invBefore.body?.data?.slots ?? [];
  const countBefore = Array.isArray(slotsBefore) ? slotsBefore.length : 0;

  const tid = `loot-test-${crypto.randomBytes(6).toString("hex")}`;
  const first = await callRpc(token, "dev_loot_test", {
    test_table_id: "phase13_basic_test",
    transaction_id: tid,
    character_id: CHAR_ID,
  });

  if (looksMissing(first.status, first.body, first.text)) {
    fail("dev_loot_test available", "flag off or RPC missing — set LOOT_DEV_LOOT_TEST=1 and force-recreate");
    return;
  }

  if (!first.body?.success || first.body?.data?.status !== "completed") {
    fail("valid table generates item", first.text.slice(0, 400));
  } else {
    pass("valid table generates item");
  }

  const items = first.body?.data?.generated_items || [];
  const item = items[0];
  const allowedIds = new Set(["laser_pistol", "plasma_rifle", "scrap_vest"]);
  if (item && allowedIds.has(item.item_id)) {
    pass("generated item_id from server pool", item.item_id);
  } else {
    fail("generated item_id from server pool", JSON.stringify(item));
  }

  if (item && ["common", "uncommon", "rare"].includes(item.rarity)) {
    pass("rarity selected server-side", item.rarity);
  } else {
    fail("rarity selected server-side", item?.rarity);
  }

  if (item && typeof item.instance_id === "string" && item.instance_id.startsWith("loot-")) {
    pass("server-generated instance_id", item.instance_id);
  } else {
    fail("server-generated instance_id", item?.instance_id);
  }

  // Client cannot choose outcome fields
  const clientPick = await callRpc(token, "dev_loot_test", {
    test_table_id: "phase13_basic_test",
    transaction_id: `loot-test-${crypto.randomBytes(4).toString("hex")}`,
    character_id: CHAR_ID,
    item_id: "laser_pistol",
    rarity: "legendary",
    seed: "hack",
    affixes: [{ id: "x" }],
    item_level: 99,
  });
  if (clientPick.body?.success === false) {
    pass("client outcome fields rejected", clientPick.body.error);
  } else {
    fail("client outcome fields rejected", clientPick.text.slice(0, 200));
  }

  // Idempotent replay
  const dup = await callRpc(token, "dev_loot_test", {
    test_table_id: "phase13_basic_test",
    transaction_id: tid,
    character_id: CHAR_ID,
  });
  const invMid = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
  const slotsMid = invMid.body?.data?.inventory?.slots ?? invMid.body?.data?.slots ?? [];
  const countMid = Array.isArray(slotsMid) ? slotsMid.length : 0;
  if (
    dup.body?.success &&
    dup.body?.data?.generated_items?.[0]?.instance_id === item?.instance_id &&
    countMid === countBefore + 1
  ) {
    pass("duplicate transaction_id does not reroll or double-grant");
  } else {
    fail(
      "duplicate transaction_id does not reroll or double-grant",
      `countBefore=${countBefore} countMid=${countMid} ${dup.text.slice(0, 200)}`
    );
  }

  // Conflicting reuse
  const conflict = await callRpc(token, "dev_loot_test", {
    test_table_id: "phase13_basic_test",
    transaction_id: tid,
    character_id: "other-char",
  });
  if (conflict.body?.success === false || /conflict|character/i.test(conflict.body?.error || "")) {
    pass("conflicting transaction reuse rejected", conflict.body?.error);
  } else {
    fail("conflicting transaction reuse rejected", conflict.text.slice(0, 250));
  }

  const unknown = await callRpc(token, "dev_loot_test", {
    test_table_id: "not_a_real_table",
    transaction_id: `loot-test-${crypto.randomBytes(4).toString("hex")}`,
    character_id: CHAR_ID,
  });
  if (unknown.body?.success === false) {
    pass("unknown loot table rejected", unknown.body.error);
  } else fail("unknown loot table rejected");

  const spoof = await callRpc(token, "dev_loot_test", {
    test_table_id: "phase13_basic_test",
    transaction_id: `loot-test-${crypto.randomBytes(4).toString("hex")}`,
    character_id: CHAR_ID,
    user_id: "attacker",
  });
  if (spoof.body?.success === false) {
    pass("client user_id rejected", spoof.body.error);
  } else fail("client user_id rejected");

  const walletAfter = await callRpc(token, "wallet_get", {});
  const balAfter =
    walletAfter.body?.data?.balances?.stardust ?? walletAfter.body?.balances?.stardust ?? 0;
  if (Number(balAfter) === Number(balBefore)) {
    pass("wallet unchanged by loot generation");
  } else {
    fail("wallet unchanged by loot generation", `before=${balBefore} after=${balAfter}`);
  }

  // Fill bag to capacity (BAG_CAP_DEFAULT = 10) then assert inventory_full
  let fillOk = true;
  let grants = countMid;
  while (grants < 10) {
    const fillTid = `loot-fill-${crypto.randomBytes(4).toString("hex")}`;
    const fill = await callRpc(token, "dev_loot_test", {
      test_table_id: "phase13_basic_test",
      transaction_id: fillTid,
      character_id: CHAR_ID,
    });
    if (fill.body?.data?.status === "completed") {
      grants += 1;
    } else {
      fillOk = false;
      fail("fill inventory toward capacity", fill.text.slice(0, 200));
      break;
    }
  }
  if (fillOk) {
    const fullTid = `loot-full-${crypto.randomBytes(4).toString("hex")}`;
    const full = await callRpc(token, "dev_loot_test", {
      test_table_id: "phase13_basic_test",
      transaction_id: fullTid,
      character_id: CHAR_ID,
    });
    const invFull = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
    const slotsFull = invFull.body?.data?.inventory?.slots ?? invFull.body?.data?.slots ?? [];
    const countFull = Array.isArray(slotsFull) ? slotsFull.length : 0;
    if (
      (full.body?.success === false || full.body?.data?.status === "inventory_full") &&
      countFull === 10
    ) {
      pass("inventory-full fails safely without duplication", `slots=${countFull}`);
    } else {
      fail(
        "inventory-full fails safely without duplication",
        `status=${full.body?.data?.status} slots=${countFull} ${full.text.slice(0, 200)}`
      );
    }

    // Retry full tid must not add another item
    const fullRetry = await callRpc(token, "dev_loot_test", {
      test_table_id: "phase13_basic_test",
      transaction_id: fullTid,
      character_id: CHAR_ID,
    });
    const invRetry = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
    const slotsRetry = invRetry.body?.data?.inventory?.slots ?? invRetry.body?.data?.slots ?? [];
    if (Array.isArray(slotsRetry) && slotsRetry.length === 10) {
      pass("inventory-full retry does not grant", fullRetry.body?.error || fullRetry.body?.data?.status);
    } else {
      fail("inventory-full retry does not grant", `slots=${slotsRetry.length}`);
    }
  }
}

async function main() {
  console.log("Phase 13 loot service verification\n");
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
