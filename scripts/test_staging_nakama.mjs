/**
 * Staging Nakama smoke test (no Godot required).
 * Reads LOOT_NAKAMA_ENV / NAKAMA_SOCKET_SERVER_KEY like the Godot client.
 * Does not print tokens or the full server key.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ENV = (process.env.LOOT_NAKAMA_ENV || "staging").toLowerCase();
const LOCAL = {
  scheme: "http",
  host: "127.0.0.1",
  port: 7350,
  key: "defaultkey",
};
const STAGING = {
  scheme: "http",
  host: "178.156.210.186",
  port: 7350,
  key: "",
};

function loadStagingKey() {
  const fromEnv =
    process.env.NAKAMA_SOCKET_SERVER_KEY ||
    process.env.LOOT_NAKAMA_SERVER_KEY ||
    "";
  if (fromEnv.trim()) return fromEnv.trim();
  const candidates = [
    path.join(ROOT, "loot&lasers", "Config", "nakama_secrets.cfg"),
    path.join(ROOT, "secrets", "nakama_secrets.cfg"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const m = text.match(/server_key\s*=\s*(.+)/);
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

function fingerprint(key) {
  if (!key) return "missing";
  if (key.length <= 4) return `set(len=${key.length})`;
  return `set(len=${key.length},tail=${key.slice(-2)})`;
}

function cfg() {
  if (ENV === "local") return { ...LOCAL, environment: "local" };
  const key = loadStagingKey();
  return { ...STAGING, key, environment: "staging" };
}

async function authDevice(base, key, deviceId) {
  const res = await fetch(`${base}/v2/account/authenticate/device?create=true`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(key + ":").toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: deviceId }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function parsePayload(body) {
  if (body && typeof body.payload === "string") {
    try {
      return JSON.parse(body.payload);
    } catch {
      return body;
    }
  }
  return body;
}

async function callRpc(base, token, id, payload = {}) {
  const res = await fetch(`${base}/v2/rpc/${encodeURIComponent(id)}?unwrap`, {
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
  return { status: res.status, body: parsePayload(body) };
}

async function main() {
  const c = cfg();
  const base = `${c.scheme}://${c.host}:${c.port}`;
  console.log("Staging/local Nakama smoke test");
  console.log(
    `env=${c.environment} ${c.scheme}://${c.host}:${c.port} key=${fingerprint(c.key)}`
  );
  if (!c.key) {
    console.error(
      "FAIL: staging server key missing. Set NAKAMA_SOCKET_SERVER_KEY or loot&lasers/Config/nakama_secrets.cfg"
    );
    process.exitCode = 1;
    return;
  }

  const deviceId = `staging-smoke-${crypto.randomBytes(4).toString("hex")}`;
  const auth = await authDevice(base, c.key, deviceId);
  if (auth.status >= 400 || !auth.body?.token) {
    console.error("FAIL: authenticate", auth.status, JSON.stringify(auth.body).slice(0, 180));
    process.exitCode = 1;
    return;
  }
  const token = auth.body.token;
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8")
  );
  const userId = payload.uid || payload.user_id || payload.sub;
  console.log("PASS authenticate user_id=" + userId);

  for (const rpc of ["profile_get", "inventory_get"]) {
    const r = await callRpc(base, token, rpc, {});
    const ok = r.status < 400 && (r.body?.success === true || r.body?.payload || r.body);
    if (!ok) {
      console.error(`FAIL ${rpc}`, r.status, JSON.stringify(r.body).slice(0, 200));
      process.exitCode = 1;
      return;
    }
    console.log(`PASS ${rpc}`);
  }

  // Socket handshake is Godot/RealtimeManager-owned; HTTP path confirms client key + host.
  console.log("PASS http client path (socket owned by Godot RealtimeManager — verify in editor)");
  console.log("OK — staging HTTP auth/RPC path succeeded");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
