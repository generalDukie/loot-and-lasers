/**
 * Phase 3 verification — player profile service (profile_get / profile_update).
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
const DEVICE_ID = `profile-phase3-${crypto.randomBytes(8).toString("hex")}`;
const DEVICE_ID_B = `profile-phase3-b-${crypto.randomBytes(8).toString("hex")}`;

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`);
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function parseEnvelope(body) {
  if (body == null) return body;
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
  if (!res.ok || !body.token) throw new Error("Auth failed: " + JSON.stringify(body));
  const payload = JSON.parse(Buffer.from(body.token.split(".")[1], "base64url").toString("utf8"));
  return { token: body.token, userId: payload.uid || payload.user_id || payload.sub };
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

function checkStatic() {
  const cat = "static files";
  const required = [
    "modules/profile.lua",
    "loot&lasers/Autoload/ProfileManager.gd",
    "docs/PHASE3_PROFILE.md",
    "docs/NAKAMA_RPC.md",
  ];
  for (const rel of required) {
    if (!exists(rel)) {
      fail(cat, `missing ${rel}`);
      return;
    }
  }
  const lua = read("modules/profile.lua");
  const mgr = read("loot&lasers/Autoload/ProfileManager.gd");
  const auth = read("loot&lasers/Autoload/AuthManager.gd");
  const project = read("loot&lasers/project.godot");
  const rpcDoc = read("docs/NAKAMA_RPC.md");

  if (!/profile_get/.test(lua) || !/profile_update/.test(lua)) {
    fail(cat, "profile.lua missing RPC registration");
    return;
  }
  if (!/permission_write\s*=\s*0/.test(lua)) {
    fail(cat, "profile storage must be server-write only");
    return;
  }
  if (!/player_profiles/.test(lua)) {
    fail(cat, "expected collection player_profiles");
    return;
  }
  if (!/ProfileManager/.test(project)) {
    fail(cat, "ProfileManager not in project.godot");
    return;
  }
  if (!/ensure_profile/.test(auth)) {
    fail(cat, "AuthManager missing account profile hook");
    return;
  }
  if (/ProfileManager\.set_selected_character_id/.test(auth)) {
    fail(cat, "AuthManager must keep selected Character authoritative on Node");
    return;
  }
  if (!/_save_busy/.test(mgr)) {
    fail(cat, "ProfileManager missing save busy-guard");
    return;
  }
  if (/invoke_rpc\(\s*["']profile_/.test(mgr) || /RPC_GET|RPC_UPDATE/.test(mgr)) {
    fail(cat, "ProfileManager must not call Nakama profile RPCs");
    return;
  }
  if (!/SaveAccountPreferences|select_character|node_local_projection/.test(mgr)) {
    fail(cat, "ProfileManager must project from Node");
    return;
  }
  pass(cat, "ProfileManager is Node projection (no Nakama profile RPCs)");
  if (!/profile_get/.test(rpcDoc) || !/PHASE3_PROFILE/.test(rpcDoc)) {
    fail(cat, "NAKAMA_RPC.md missing Phase 3 docs");
    return;
  }
  // Gameplay managers must not be rewritten by Phase 3 (spot-check files exist, not emptied).
  for (const rel of [
    "loot&lasers/Autoload/MissionManager.gd",
    "loot&lasers/Autoload/InventoryManager.gd",
    "loot&lasers/Autoload/ArenaManager.gd",
  ]) {
    if (!exists(rel) || read(rel).length < 100) {
      fail(cat, `${rel} missing or truncated`);
      return;
    }
  }
  pass(cat, "account profile hooks present; selected Character remains on Node");
}

async function checkLive() {
  const a = await authDevice(DEVICE_ID);
  const first = await callRpc(a.token, "profile_get", {});
  if (!first.body?.success || !first.body?.data?.account_id) {
    fail("profile_get create", JSON.stringify(first.body).slice(0, 300));
    return;
  }
  if (first.body.data.account_id !== a.userId) {
    fail("account_id forced", `got ${first.body.data.account_id} want ${a.userId}`);
    return;
  }
  pass("profile_get creates profile", first.body.data.account_id.slice(0, 8));

  const second = await callRpc(a.token, "profile_get", {});
  if (
    !second.body?.success ||
    second.body.data.account_id !== first.body.data.account_id ||
    second.body.data.created_at !== first.body.data.created_at
  ) {
    fail("profile_get idempotent", JSON.stringify(second.body).slice(0, 300));
    return;
  }
  pass("profile_get idempotent after re-read");

  const badField = await callRpc(a.token, "profile_update", {
    display_name: "Valid Name",
    account_id: "attacker",
  });
  if (badField.body?.success) {
    fail("reject unknown field account_id", "update unexpectedly succeeded");
    return;
  }
  pass("reject unknown field account_id");

  const badName = await callRpc(a.token, "profile_update", { display_name: "Nova2" });
  if (badName.body?.success) {
    fail("reject digits in display_name", "update unexpectedly succeeded");
    return;
  }
  pass("reject digits in display_name");

  const badApp = await callRpc(a.token, "profile_update", {
    appearance: { skin_color: "#fff", unknown_key: "x" },
  });
  if (badApp.body?.success) {
    fail("reject unknown appearance key", "update unexpectedly succeeded");
    return;
  }
  pass("reject unknown appearance key");

  const upd = await callRpc(a.token, "profile_update", {
    display_name: "Nova Vex",
    selected_character_id: "char-phase3-verify",
    appearance: { skin_color: "#2D5A3D", eye_style: "Standard Optics" },
    avatar_portrait: "default",
  });
  if (!upd.body?.success || upd.body.data.display_name !== "Nova Vex") {
    fail("profile_update allowlisted", JSON.stringify(upd.body).slice(0, 300));
    return;
  }
  if (upd.body.data.account_id !== a.userId) {
    fail("update keeps session account_id", upd.body.data.account_id);
    return;
  }
  pass("profile_update allowlisted fields");

  const after = await callRpc(a.token, "profile_get", {});
  if (
    !after.body?.success ||
    after.body.data.display_name !== "Nova Vex" ||
    after.body.data.selected_character_id !== "char-phase3-verify"
  ) {
    fail("update persists", JSON.stringify(after.body).slice(0, 300));
    return;
  }
  pass("update persists on profile_get");

  const b = await authDevice(DEVICE_ID_B);
  const other = await callRpc(b.token, "profile_get", {});
  if (!other.body?.success) {
    fail("second user profile_get", JSON.stringify(other.body).slice(0, 200));
    return;
  }
  if (other.body.data.account_id === a.userId) {
    fail("ownership isolation", "second user got first user account_id");
    return;
  }
  if (other.body.data.display_name === "Nova Vex") {
    fail("ownership isolation", "second user inherited first display_name");
    return;
  }
  pass("cannot read another user's profile via own session");
}

async function main() {
  console.log("Phase 3 — Profile service verification\n");
  checkStatic();
  try {
    await checkLive();
  } catch (err) {
    fail("live nakama", String(err.message || err));
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Summary ---");
  console.log(`Result: ${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main();
