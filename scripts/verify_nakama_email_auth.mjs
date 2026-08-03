/**
 * Verify Godot-style Nakama email register + login on staging (or local).
 * Does not print passwords, tokens, or the full server key.
 *
 * Usage:
 *   node scripts/verify_nakama_email_auth.mjs
 *   LOOT_NAKAMA_ENV=staging node scripts/verify_nakama_email_auth.mjs
 *
 * Server key: NAKAMA_SOCKET_SERVER_KEY / LOOT_NAKAMA_SERVER_KEY, or
 * loot&lasers/Config/nakama_secrets.cfg [staging] server_key=
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV = (process.env.LOOT_NAKAMA_ENV || "staging").trim().toLowerCase();

const ENDPOINTS = {
  local: { scheme: "http", host: "127.0.0.1", port: 7350, defaultKey: "defaultkey" },
  staging: { scheme: "http", host: "178.156.210.186", port: 7350, defaultKey: "" },
};

const ep = ENDPOINTS[ENV] || ENDPOINTS.staging;
const base = `${ep.scheme}://${ep.host}:${ep.port}`;

function readSecretKey() {
  const fromEnv =
    process.env.NAKAMA_SOCKET_SERVER_KEY ||
    process.env.LOOT_NAKAMA_SERVER_KEY ||
    "";
  if (fromEnv.trim()) return fromEnv.trim();
  const cfgPath = path.join(ROOT, "loot&lasers", "Config", "nakama_secrets.cfg");
  if (!fs.existsSync(cfgPath)) return ep.defaultKey;
  const text = fs.readFileSync(cfgPath, "utf8");
  const section = ENV === "local" ? null : "[staging]";
  let inSection = ENV === "local";
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("[")) {
      inSection = section != null && t.toLowerCase() === section;
      continue;
    }
    if (!inSection && section) continue;
    const m = t.match(/^server_key\s*=\s*"?([^"]+)"?\s*$/i);
    if (m) return m[1].trim();
  }
  return ep.defaultKey;
}

function basicAuth(serverKey) {
  return Buffer.from(`${serverKey}:`, "utf8").toString("base64");
}

function fingerprint(key) {
  if (!key) return "(missing)";
  return `len=${key.length} tail=${key.slice(-4)}`;
}

async function authEmail(serverKey, email, password, create) {
  const url = `${base}/v2/account/authenticate/email?create=${create ? "true" : "false"}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(serverKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ok: res.ok, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const serverKey = readSecretKey();
  console.log(`env=${ENV} base=${base} key=${fingerprint(serverKey)}`);
  assert(serverKey, "Missing Nakama server key for this environment");

  const stamp = Date.now();
  const emailA = `godot-auth-a-${stamp}@example.com`;
  const emailB = `godot-auth-b-${stamp}@example.com`;
  const password = `TestPass-${stamp}x`;

  console.log("register A...");
  const regA = await authEmail(serverKey, emailA, password, true);
  assert(regA.ok, `register A failed status=${regA.status} err=${regA.body.message || regA.body.error || JSON.stringify(regA.body)}`);
  const userA = regA.body.user_id || regA.body.uid || "(token issued)";
  console.log(`PASS register A user_id=${userA}`);

  console.log("login A...");
  const loginA = await authEmail(serverKey, emailA, password, false);
  assert(loginA.ok, `login A failed status=${loginA.status}`);
  console.log("PASS login A");

  console.log("register B...");
  const regB = await authEmail(serverKey, emailB, password, true);
  assert(regB.ok, `register B failed status=${regB.status}`);
  const userB = regB.body.user_id || regB.body.uid || "(token issued)";
  console.log(`PASS register B user_id=${userB}`);
  assert(String(userA) !== String(userB) || userA === "(token issued)", "A and B must be distinct accounts");

  console.log("login B...");
  const loginB = await authEmail(serverKey, emailB, password, false);
  assert(loginB.ok, `login B failed status=${loginB.status}`);
  console.log("PASS login B");

  console.log("reject wrong password...");
  const bad = await authEmail(serverKey, emailA, "wrong-password-xx", false);
  assert(!bad.ok, "wrong password should fail");
  console.log("PASS wrong password rejected");

  console.log("\nAll Nakama email auth checks passed.");
  console.log("Confirm both users in Nakama Console → Accounts.");
}

main().catch((err) => {
  console.error("FAIL", err.message || err);
  process.exit(1);
});
