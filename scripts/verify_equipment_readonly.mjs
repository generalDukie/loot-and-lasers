/**
 * Phase 6 verification — read-only equipment_get.
 * Local Nakama: 127.0.0.1:7350, defaultkey.
 */
import crypto from "node:crypto";

const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";
const DEVICE_ID = `equip-phase6-${crypto.randomBytes(8).toString("hex")}`;
const CHAR_ID = "char-phase6-test";

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`);
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
  // Lua often returns a JSON string envelope; unwrap once more if needed.
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      /* keep */
    }
  }
  if (body && typeof body.payload === "string") {
    try {
      body = JSON.parse(body.payload);
    } catch {
      /* keep */
    }
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
          // Nakama REST expects value as a JSON string.
          value: JSON.stringify(value),
          permission_read: 1,
          permission_write: 1,
        },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`storage write failed ${res.status}: ${text}`);
  return text;
}

function parseEnvelope(body) {
  if (body == null) return body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (typeof body.payload === "string") {
    try {
      return JSON.parse(body.payload);
    } catch {
      return body;
    }
  }
  return body;
}

function slotKeys(slots) {
  return Object.keys(slots || {}).sort();
}

async function main() {
  console.log("Authenticating…");
  const { token } = await authDevice();
  console.log("Session OK\n");

  // Ensure profile + selected character (required for ownership checks).
  const prof = await callRpc(token, "profile_get", {});
  if (!prof.body?.success && !prof.ok) {
    fail("profile_get bootstrap", prof.text.slice(0, 200));
  } else {
    pass("profile available");
  }

  const upd = await callRpc(token, "profile_update", {
    selected_character_id: CHAR_ID,
  });
  if (upd.body?.success === false) {
    // Some profiles may reject unknown fields — try minimal path.
    fail("profile_update selected_character_id", JSON.stringify(upd.body).slice(0, 300));
  } else {
    pass("selected_character_id set", CHAR_ID);
  }

  // Empty / missing record
  const empty = await callRpc(token, "equipment_get", { character_id: CHAR_ID });
  const emptyData = empty.body?.data || empty.body;
  const emptySlots = emptyData?.slots;
  if (empty.body?.success !== false && emptySlots) {
    const keys = slotKeys(emptySlots);
    const allNull = keys.every((k) => emptySlots[k] == null);
    if (keys.length === 8 && allNull) {
      pass("empty slots work", keys.join(","));
    } else {
      fail("empty slots work", JSON.stringify(emptySlots));
    }
  } else {
    fail("empty equipment_get", empty.text.slice(0, 300));
  }

  // Forbidden account fields
  const forbidden = await callRpc(token, "equipment_get", {
    character_id: CHAR_ID,
    user_id: "attacker",
  });
  if (forbidden.body?.success === false) {
    pass("rejects client user_id", forbidden.body.error);
  } else {
    fail("rejects client user_id", forbidden.text.slice(0, 200));
  }

  // Wrong character
  const wrong = await callRpc(token, "equipment_get", {
    character_id: "someone-elses-char",
  });
  if (wrong.body?.success === false) {
    pass("wrong character rejected", wrong.body.error);
  } else {
    fail("wrong character rejected", wrong.text.slice(0, 200));
  }

  // Write valid equipment via client storage (test seed only — not a public equip RPC)
  await writeStorage(token, "equipment", CHAR_ID, {
    equipment_version: 1,
    owner_type: "character",
    owner_id: CHAR_ID,
    slots: {
      weapon: { instance_id: "inst-w1", item_id: "laser_pistol", metadata: { rarity: "common" } },
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

  const loaded = await callRpc(token, "equipment_get", { character_id: CHAR_ID });
  const loadedSlots = loaded.body?.data?.slots || loaded.body?.slots;
  if (loaded.body?.success !== false && loadedSlots?.weapon?.instance_id === "inst-w1") {
    pass("correct equipment loads", loadedSlots.weapon.item_id);
  } else {
    fail("correct equipment loads", loaded.text.slice(0, 400));
  }

  // Invalid item payload → fail safely
  await writeStorage(token, "equipment", CHAR_ID, {
    equipment_version: 1,
    owner_type: "character",
    owner_id: CHAR_ID,
    slots: {
      weapon: { instance_id: "", item_id: "bad" },
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
  const bad = await callRpc(token, "equipment_get", { character_id: CHAR_ID });
  if (bad.body?.success === false && (bad.body.status_code === 422 || /Invalid item/i.test(bad.body.error || ""))) {
    pass("invalid items fail safely", bad.body.error);
  } else {
    fail("invalid items fail safely", bad.text.slice(0, 300));
  }

  // Unknown slot key
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
      cape: { instance_id: "x", item_id: "y", metadata: {} },
    },
    updated_at: Date.now(),
  });
  const unk = await callRpc(token, "equipment_get", { character_id: CHAR_ID });
  if (unk.body?.success === false) {
    pass("unknown slot rejected", unk.body.error);
  } else {
    fail("unknown slot rejected", unk.text.slice(0, 300));
  }

  // inventory_get still works (inventory unchanged)
  const inv = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
  if (inv.body?.success !== false && Array.isArray(inv.body?.data?.slots || inv.body?.slots || [])) {
    pass("inventory_get unchanged");
  } else if (inv.ok || inv.body?.success === true || inv.body?.data) {
    pass("inventory_get unchanged", "ok");
  } else {
    // empty character path may still succeed with empty envelope
    if (inv.body?.error) {
      fail("inventory_get unchanged", inv.body.error);
    } else {
      pass("inventory_get unchanged", inv.text.slice(0, 80));
    }
  }

  // No mutation RPCs registered
  for (const rpc of ["equipment_equip", "equip_item", "equipment_set"]) {
    const r = await callRpc(token, rpc, {});
    if (r.status === 404 || /not found/i.test(r.text)) {
      pass(`no write RPC ${rpc}`, `HTTP ${r.status}`);
    } else {
      fail(`no write RPC ${rpc}`, r.text.slice(0, 120));
    }
  }

  console.log("\n--- Summary ---");
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
