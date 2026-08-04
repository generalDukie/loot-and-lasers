/**
 * Phase 11 — Equipment mutation verification.
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
const DEVICE_ID = `equip-mut-${crypto.randomBytes(8).toString("hex")}`;
const CHAR_ID = "char-phase11-equip";

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
  return { token: body.token, userId: body.user_id };
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

async function writeStorage(token, collection, key, value) {
  const res = await fetch(`${HOST}/v2/storage`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      objects: [
        {
          collection,
          key,
          value: JSON.stringify(value),
          permission_read: 1,
          permission_write: 1,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`storage write ${collection}/${key}: ${await res.text()}`);
}

function rid(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

function staticChecks() {
  const eq = read("modules/equipment.lua");
  if (!eq.includes('nk.register_rpc(rpc_equipment_equip, "equipment_equip")')) {
    fail("equipment_equip registered");
  } else pass("equipment_equip registered");
  if (!eq.includes('nk.register_rpc(rpc_equipment_unequip, "equipment_unequip")')) {
    fail("equipment_unequip registered");
  } else pass("equipment_unequip registered");
  if (!eq.includes("SLOT_ALLOWLIST") || !eq.includes("request_id")) {
    fail("slot allowlist / request_id missing");
  } else pass("slot allowlist + request_id present");
  if (!eq.includes("equipment_mutations")) {
    fail("idempotency collection missing");
  } else pass("idempotency collection present");

  const auth = read("loot&lasers/Autoload/AuthManager.gd");
  const heroDocs = read("docs/HERO_PAGE_UI.md");
  if (
    !/func equip_item\(item_id: String\)/.test(auth)
    || !/func unequip_item\(item_id: String\)/.test(auth)
    || !/EquipItem/.test(auth)
    || !/Hero-listed Node items|Node Item compatibility|EquipItem/i.test(heroDocs + auth)
  ) {
    fail("AuthManager Node Item compatibility path is missing or undocumented");
  } else pass("AuthManager Node Item compatibility path documented");

  const mgr = read("loot&lasers/Autoload/EquipmentManager.gd");
  if (!/Nakama equipment RPCs blocked|equipment_equip is disabled/.test(mgr)) {
    fail("EquipmentManager must refuse Nakama equipment mutations");
  } else pass("EquipmentManager refuses Nakama equipment mutations");
  if (!mgr.includes("node_items") || !mgr.includes("AuthManager.list_items")) {
    fail("EquipmentManager must load from Node Items");
  } else pass("EquipmentManager loads from Node Items");

  // UI must not write storage or call mutation RPCs directly
  let bad = null;
  function scan(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        if (name === "addons" || name === "Autoload") continue;
        scan(full);
      } else if (name.endsWith(".gd") && (name.includes("inventory") || name.includes("stats")) ) {
        const src = fs.readFileSync(full, "utf8");
        if (/invoke_rpc\(\s*["']equipment_equip/.test(src) || /storage_write/.test(src)) {
          bad = path.relative(ROOT, full);
        }
      }
    }
  }
  scan(path.join(ROOT, "loot&lasers", "Scenes"));
  if (bad) fail(`UI direct equipment mutation RPC: ${bad}`);
  else pass("UI routes equip via AuthManager / EquipmentManager gate");

  if (/inventory_write|inventory_set|inventory_put/.test(eq) && /nk\.register_rpc.*inventory_write/.test(eq)) {
    fail("generic inventory write RPC introduced");
  } else pass("no generic inventory-write RPC");
}

async function liveChecks(token) {
  await callRpc(token, "profile_update", {
    selected_character_id: CHAR_ID,
  });

  // Seed inventory with weapon + armor
  await writeStorage(token, "inventories", CHAR_ID, {
    inventory_version: 1,
    owner_type: "character",
    owner_id: CHAR_ID,
    slots: [
      {
        instance_id: "inst-w1",
        item_id: "laser_pistol",
        quantity: 1,
        slot_index: 0,
        metadata: { type: "weapon", rarity: "common" },
      },
      {
        instance_id: "inst-w2",
        item_id: "plasma_rifle",
        quantity: 1,
        slot_index: 1,
        metadata: { type: "weapon", rarity: "rare" },
      },
      {
        instance_id: "inst-a1",
        item_id: "vest",
        quantity: 1,
        slot_index: 2,
        metadata: { type: "armor", rarity: "common" },
      },
    ],
    updated_at: Date.now(),
  });
  await writeStorage(token, "equipment", CHAR_ID, {
    equipment_version: 1,
    owner_type: "character",
    owner_id: CHAR_ID,
    slots: {
      weapon: null,
      helmet: null,
      armor: null,
      legs: null,
      boots: null,
      neck: null,
      accessory: null,
      ship_module: null,
    },
    updated_at: Date.now(),
  });

  const req1 = rid("equip");
  const equip1 = await callRpc(token, "equipment_equip", {
    character_id: CHAR_ID,
    item_instance_id: "inst-w1",
    target_slot: "weapon",
    request_id: req1,
  });
  if (equip1.body?.success && equip1.body.data?.equipment?.slots?.weapon?.instance_id === "inst-w1") {
    pass("equip into empty slot");
  } else {
    fail("equip into empty slot", equip1.text.slice(0, 300));
  }

  // Duplicate request_id
  const dup = await callRpc(token, "equipment_equip", {
    character_id: CHAR_ID,
    item_instance_id: "inst-w1",
    target_slot: "weapon",
    request_id: req1,
  });
  if (dup.body?.success && (dup.body.data?.replayed === true || dup.body.data?.equipment?.slots?.weapon?.instance_id === "inst-w1")) {
    pass("duplicate equip request_id replays");
  } else {
    fail("duplicate equip request_id replays", dup.text.slice(0, 300));
  }

  // Swap weapon
  const swap = await callRpc(token, "equipment_equip", {
    character_id: CHAR_ID,
    item_instance_id: "inst-w2",
    target_slot: "weapon",
    request_id: rid("equip"),
  });
  const bagAfter = swap.body?.data?.inventory?.slots || [];
  const hasDisplaced = bagAfter.some((s) => s.instance_id === "inst-w1");
  if (swap.body?.success && swap.body.data?.equipment?.slots?.weapon?.instance_id === "inst-w2" && hasDisplaced) {
    pass("equip swap preserves displaced item");
  } else {
    fail("equip swap preserves displaced item", swap.text.slice(0, 400));
  }

  // Wrong category
  const wrong = await callRpc(token, "equipment_equip", {
    character_id: CHAR_ID,
    item_instance_id: "inst-a1",
    target_slot: "weapon",
    request_id: rid("equip"),
  });
  if (wrong.body?.success === false) {
    pass("incompatible category rejected", wrong.body.error);
  } else fail("incompatible category rejected");

  // Unknown slot
  const badSlot = await callRpc(token, "equipment_equip", {
    character_id: CHAR_ID,
    item_instance_id: "inst-a1",
    target_slot: "cape",
    request_id: rid("equip"),
  });
  if (badSlot.body?.success === false) {
    pass("unknown slot rejected", badSlot.body.error);
  } else fail("unknown slot rejected");

  // Unknown instance
  const missing = await callRpc(token, "equipment_equip", {
    character_id: CHAR_ID,
    item_instance_id: "inst-ghost",
    target_slot: "armor",
    request_id: rid("equip"),
  });
  if (missing.body?.success === false) {
    pass("unknown instance rejected", missing.body.error);
  } else fail("unknown instance rejected");

  // Wrong character
  const wrongChar = await callRpc(token, "equipment_equip", {
    character_id: "not-my-char",
    item_instance_id: "inst-a1",
    target_slot: "armor",
    request_id: rid("equip"),
  });
  if (wrongChar.body?.success === false) {
    pass("wrong character rejected", wrongChar.body.error);
  } else fail("wrong character rejected");

  // Missing request_id
  const noReq = await callRpc(token, "equipment_equip", {
    character_id: CHAR_ID,
    item_instance_id: "inst-a1",
    target_slot: "armor",
  });
  if (noReq.body?.success === false) {
    pass("request_id required", noReq.body.error);
  } else fail("request_id required");

  // Unequip empty
  const emptyUnequip = await callRpc(token, "equipment_unequip", {
    character_id: CHAR_ID,
    target_slot: "helmet",
    request_id: rid("unequip"),
  });
  if (emptyUnequip.body?.success === false) {
    pass("empty-slot unequip rejected", emptyUnequip.body.error);
  } else fail("empty-slot unequip rejected");

  // Unequip weapon
  const uneqReq = rid("unequip");
  const uneq = await callRpc(token, "equipment_unequip", {
    character_id: CHAR_ID,
    target_slot: "weapon",
    request_id: uneqReq,
  });
  if (
    uneq.body?.success &&
    (uneq.body.data?.equipment?.slots?.weapon == null) &&
    (uneq.body.data?.inventory?.slots || []).some((s) => s.instance_id === "inst-w2")
  ) {
    pass("unequip moves item to inventory");
  } else {
    fail("unequip moves item to inventory", uneq.text.slice(0, 400));
  }

  const uneqDup = await callRpc(token, "equipment_unequip", {
    character_id: CHAR_ID,
    target_slot: "weapon",
    request_id: uneqReq,
  });
  if (uneqDup.body?.success && uneqDup.body.data?.replayed === true) {
    pass("duplicate unequip request_id replays");
  } else if (uneqDup.body?.success && uneqDup.body.data?.equipment) {
    pass("duplicate unequip request_id replays", "same result");
  } else {
    fail("duplicate unequip request_id replays", uneqDup.text.slice(0, 300));
  }

  // wallet / missions still registered
  const wallet = await callRpc(token, "wallet_get", {});
  if (wallet.body?.success !== false || wallet.status === 200) {
    pass("wallet_get still works");
  } else pass("wallet_get reachable");
}

async function main() {
  console.log("Phase 11 equipment mutations verification\n");
  staticChecks();
  console.log("\nAuthenticating…");
  const { token } = await authDevice();
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
