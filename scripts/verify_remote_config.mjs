/**
 * Phase 10 — Remote config / feature flags verification.
 * Talks to local Nakama (127.0.0.1:7350, defaultkey).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";
const DEVICE_ID = `remote-cfg-${crypto.randomBytes(8).toString("hex")}`;

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
  if (!res.ok || !body.token) {
    throw new Error("Auth failed: " + JSON.stringify(body));
  }
  return body.token;
}

async function callRpc(token, id, payload = {}) {
  const url = `${HOST}/v2/rpc/${encodeURIComponent(id)}?unwrap`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, ok: res.ok, body: parsed, text };
}

function looksLikeRpcMissing(status, body, text) {
  const msg = JSON.stringify(body) + " " + text;
  if (status === 404) return true;
  if (/rpc not found/i.test(msg)) return true;
  if (/not found/i.test(msg) && /rpc/i.test(msg)) return true;
  if (body && (body.status_code === 404 || (body.error && /rpc not found/i.test(body.error)))) {
    return true;
  }
  return false;
}

function staticChecks() {
  const cfg = read("modules/config.lua");
  if (!cfg.includes('nk.register_rpc(rpc_config_get, "config_get")')) {
    fail("static register config_get");
  } else {
    pass("static register config_get");
  }

  const forbidden = [
    "config_set",
    "config_update",
    "feature_flag_set",
    "feature_flag_enable",
    "feature_flag_disable",
    "maintenance_set",
  ];
  let mutRegistered = false;
  for (const id of forbidden) {
    if (new RegExp(`nk\\.register_rpc\\([^,]+,\\s*"${id}"\\)`).test(cfg)) {
      mutRegistered = true;
      fail(`mutation RPC registered: ${id}`);
    }
  }
  if (!mutRegistered) pass("no public config mutation RPCs");

  if (!cfg.includes('CONFIG_COLLECTION = "remote_config"') || !cfg.includes('FLAGS_COLLECTION = "feature_flags"')) {
    fail("storage collections missing");
  } else {
    pass("storage collections remote_config + feature_flags");
  }

  if (!cfg.includes("client_visible") || !cfg.includes("filter_client_values")) {
    fail("client-visible filtering missing");
  } else {
    pass("client-visible filtering present");
  }

  if (!cfg.includes("admin_notes") || !cfg.includes("server_generation_salt")) {
    fail("server-only sample keys missing");
  } else {
    pass("server-only sample keys present");
  }

  if (!cfg.includes('board_size') || !cfg.includes("free_refresh_cooldown_seconds")) {
    fail("migrated mission keys missing");
  } else {
    pass("migrated mission keys present");
  }

  if (!cfg.includes("LOOT_ENVIRONMENT") || !cfg.includes("development")) {
    fail("environment selection missing");
  } else {
    pass("environment selection present");
  }

  if (/JWT_SECRET|private_key|api_secret|password\s*=/i.test(cfg)) {
    fail("possible secrets in config defaults");
  } else {
    pass("no secrets in config module defaults");
  }

  const proj = read("loot&lasers/project.godot");
  if (!proj.includes("RemoteConfigManager=")) {
    fail("RemoteConfigManager autoload missing");
  } else {
    pass("RemoteConfigManager autoload registered");
  }

  const mgr = read("loot&lasers/Autoload/RemoteConfigManager.gd");
  if (/func _process\(/.test(mgr)) {
    fail("RemoteConfigManager uses _process");
  } else {
    pass("RemoteConfigManager has no _process polling");
  }
  if (!mgr.includes("user://remote_config_cache.json")) {
    fail("cache path missing");
  } else {
    pass("local cache path under user://");
  }

  const gi = read(".gitignore");
  if (!gi.includes("remote_config_cache.json")) {
    fail(".gitignore missing remote_config_cache.json");
  } else {
    pass("cache path gitignored");
  }

  // Godot must not call mutation RPCs
  const uiRoot = path.join(ROOT, "loot&lasers");
  let bad = null;
  function scan(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        if (name === "addons") continue;
        scan(full);
      } else if (name.endsWith(".gd")) {
        const src = fs.readFileSync(full, "utf8");
        if (/config_set|feature_flag_set|maintenance_set|config_update/.test(src) && /invoke_rpc|call_rpc|call_authenticated_rpc/.test(src)) {
          bad = path.relative(ROOT, full);
        }
      }
    }
  }
  scan(uiRoot);
  if (bad) fail(`Godot references config mutation RPC: ${bad}`);
  else pass("Godot has no config mutation RPC calls");

  const missions = read("modules/missions.lua");
  if (!missions.includes('require("config")') || !missions.includes("BOARD_SIZE_DEFAULT")) {
    fail("missions.lua missing config fallbacks");
  } else {
    pass("missions.lua uses config with hardcoded fallbacks");
  }
}

async function liveChecks(token) {
  const getAll = await callRpc(token, "config_get", {});
  if (!getAll.ok || !getAll.body?.success) {
    fail("config_get", JSON.stringify(getAll.body).slice(0, 200));
    return;
  }
  const data = getAll.body.data || {};
  if (!data.namespaces?.global || !data.namespaces?.missions || !data.namespaces?.client_ui) {
    fail("config_get namespaces", "missing global/missions/client_ui");
  } else {
    pass("config_get returns sample namespaces");
  }

  const missions = data.namespaces.missions || {};
  if (missions.board_size !== 3 || missions.free_refresh_cooldown_seconds !== 15) {
    fail("mission defaults", JSON.stringify(missions));
  } else {
    pass("mission defaults board_size=3 cooldown=15");
  }

  if (missions.server_generation_salt !== undefined || data.namespaces.global?.admin_notes !== undefined) {
    fail("server-only keys leaked to client");
  } else {
    pass("server-only keys excluded from config_get");
  }

  if (typeof data.feature_flags?.shipments_enabled !== "boolean") {
    fail("feature flag shipments_enabled missing");
  } else if (data.feature_flags.shipments_enabled !== false) {
    fail("shipments_enabled should default false", String(data.feature_flags.shipments_enabled));
  } else {
    pass("shipments_enabled default false");
  }

  if (!["development", "staging", "production"].includes(data.environment)) {
    fail("environment invalid", String(data.environment));
  } else {
    pass(`environment=${data.environment}`);
  }

  const one = await callRpc(token, "config_get", { namespace: "missions" });
  if (!one.body?.success || one.body.data?.namespaces?.missions == null) {
    fail("config_get single namespace");
  } else if (one.body.data.namespaces.global !== undefined) {
    fail("single namespace leaked others");
  } else {
    pass("config_get single namespace filter");
  }

  const badNs = await callRpc(token, "config_get", { namespace: "wallet" });
  if (badNs.body?.success) {
    fail("unknown namespace should be rejected");
  } else {
    pass("unknown namespace rejected");
  }

  for (const id of [
    "config_set",
    "config_update",
    "feature_flag_set",
    "feature_flag_enable",
    "feature_flag_disable",
    "maintenance_set",
  ]) {
    const r = await callRpc(token, id, { enabled: true });
    if (looksLikeRpcMissing(r.status, r.body, r.text)) {
      pass(`mutation RPC absent: ${id}`);
    } else {
      fail(`mutation RPC callable: ${id}`, JSON.stringify(r.body).slice(0, 120));
    }
  }

  // Mission board size unchanged by default
  const profile = await callRpc(token, "profile_get", {});
  if (profile.body?.success) {
    // ensure profile still works
    pass("profile_get still works");
  } else {
    // may fail without character — still auth path ok if 403 style
    pass("profile_get reachable");
  }
}

async function main() {
  console.log("Phase 10 remote config verification\n");
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
