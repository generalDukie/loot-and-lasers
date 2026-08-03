/**
 * Verify Nakama → Node auth bridge (dual-stack).
 * Requires local Node :8787 and Nakama :7350 (defaultkey).
 *
 * Usage: node scripts/verify_nakama_node_bridge.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NODE = (process.env.API_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const NAKAMA = (process.env.NAKAMA_HTTP_URL || "http://127.0.0.1:7350").replace(/\/$/, "");
const KEY = process.env.NAKAMA_SOCKET_SERVER_KEY || process.env.LOOT_NAKAMA_SERVER_KEY || "defaultkey";

function basicAuth(serverKey) {
  return Buffer.from(`${serverKey}:`, "utf8").toString("base64");
}

async function nakamaEmail(email, password, create) {
  const res = await fetch(
    `${NAKAMA}/v2/account/authenticate/email?create=${create ? "true" : "false"}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(KEY)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Nakama auth failed ${res.status}: ${body.message || body.error || ""}`);
  return body;
}

async function bridge(nakamaToken, email, password) {
  const res = await fetch(`${NODE}/api/auth/nakama-bridge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nakama_token: nakamaToken, email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Bridge failed ${res.status}: ${body.error || ""}`);
  return body;
}

async function me(jwt) {
  const res = await fetch(`${NODE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`/me failed ${res.status}`);
  return body;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const health = await fetch(`${NODE}/health`).then((r) => r.json());
  assert(health.ok, "Node health failed");
  console.log(`NODE ${NODE} ok · NAKAMA ${NAKAMA}`);

  const stamp = Date.now();
  const email = `bridge-test-${stamp}@example.com`;
  const password = `BridgePass9x${stamp}`;

  console.log("Nakama register...");
  const session = await nakamaEmail(email, password, true);
  assert(session.token, "missing Nakama token");
  console.log("PASS Nakama register");

  console.log("Node bridge...");
  const linked = await bridge(session.token, email, password);
  assert(linked.access_token, "missing Node JWT");
  assert(linked.user?.email === email, "email mismatch");
  console.log(`PASS bridge node_user=${linked.user.id}`);

  console.log("Node /me...");
  const profile = await me(linked.access_token);
  assert(profile.id === linked.user.id, "me id mismatch");
  console.log("PASS /me");

  console.log("Re-bridge idempotent...");
  const again = await bridge(session.token, email, password);
  assert(again.user.id === linked.user.id, "re-bridge created different user");
  console.log("PASS re-bridge same user");

  console.log("\nNakama→Node bridge checks passed.");
}

main().catch((err) => {
  console.error("FAIL", err.message || err);
  process.exit(1);
});
