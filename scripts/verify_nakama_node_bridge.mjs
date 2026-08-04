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

async function bridge(nakamaToken, email) {
  const res = await fetch(`${NODE}/api/auth/nakama-bridge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nakama_token: nakamaToken, email }),
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

function jwtPayload(token) {
  const part = String(token || "").split(".")[1] || "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
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
  const linked = await bridge(session.token, email);
  assert(linked.access_token, "missing Node JWT");
  assert(linked.user?.email === email, "email mismatch");
  const claims = jwtPayload(linked.access_token);
  const nakamaClaims = jwtPayload(session.token);
  assert(claims.sub === linked.nakama_user_id, "gameplay JWT subject is not Nakama user id");
  assert(claims.token_use === "nakama_gameplay", "missing gameplay token use");
  assert(claims.iss === "lootandlasers-node", "unexpected gameplay issuer");
  assert(claims.aud === "lootandlasers-gameplay", "unexpected gameplay audience");
  assert(Number.isSafeInteger(claims.iat), "missing issued-at claim");
  assert(Number.isSafeInteger(claims.exp), "missing expiration claim");
  assert(typeof claims.jti === "string" && claims.jti.length > 0, "missing token id");
  assert(claims.exp <= nakamaClaims.exp, "gameplay JWT outlives Nakama session");
  assert(claims.exp - claims.iat <= 15 * 60, "gameplay JWT exceeds 15 minutes");
  console.log(`PASS bridge node_user=${linked.user.id}`);

  console.log("Node /me...");
  const profile = await me(linked.access_token);
  assert(profile.id === linked.user.id, "me id mismatch");
  console.log("PASS /me");

  console.log("Re-bridge idempotent...");
  const again = await bridge(session.token, email);
  assert(again.user.id === linked.user.id, "re-bridge created different user");
  assert(jwtPayload(again.access_token).jti !== claims.jti, "re-bridge reused token id");
  console.log("PASS re-bridge same user");

  console.log("Concurrent first bridge...");
  const raceEmail = `bridge-race-${stamp}@example.com`;
  const raceSession = await nakamaEmail(raceEmail, password, true);
  const [raceA, raceB] = await Promise.all([
    bridge(raceSession.token, raceEmail),
    bridge(raceSession.token, raceEmail),
  ]);
  assert(raceA.user.id === raceB.user.id, "concurrent bridge created duplicate Node users");
  console.log("PASS concurrent bridge converged");

  console.log("\nNakama→Node bridge checks passed.");
}

main().catch((err) => {
  console.error("FAIL", err.message || err);
  process.exit(1);
});
