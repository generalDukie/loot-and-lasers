/**
 * Godot dual-stack player flow (automates former Phase C manual gaps):
 *   1. Nakama email register/login (auth SoT)
 *   2. Node nakama-bridge → JWT (gameplay)
 *   3. Create + list + select character
 *   4. Invalid JWT + valid Nakama session → passwordless re-bridge
 *   5. Second account (friend) stays isolated
 *
 * Mirrors AuthManager.login / bridge_node_session / ensure_node_bridge / fetch_me.
 *
 * Usage:
 *   node scripts/verify_godot_auth_gameplay_flow.mjs
 *   LOOT_NAKAMA_ENV=staging node scripts/verify_godot_auth_gameplay_flow.mjs
 *
 * For staging Nakama + local Node, set on the Node process (or both):
 *   NAKAMA_HTTP_URLS=http://127.0.0.1:7350,http://178.156.210.186:7350
 * so the Node bridge can validate staging sessions (test env alone does not
 * reconfigure an already-running API).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const NODE = (process.env.API_URL || process.env.LOOT_NODE_API_URL || "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);
const ENV = (process.env.LOOT_NAKAMA_ENV || "local").trim().toLowerCase();
const NAKAMA_DEFAULTS = {
  local: { host: "127.0.0.1", port: 7350, key: "defaultkey" },
  staging: { host: "178.156.210.186", port: 8443, key: "", scheme: "https" },
};
const ep = NAKAMA_DEFAULTS[ENV] || NAKAMA_DEFAULTS.local;
const NAKAMA = (
  process.env.NAKAMA_HTTP_URL ||
  process.env.LOOT_NAKAMA_HTTP_URL ||
  `${ep.scheme || "http"}://${ep.host}:${ep.port}`
).replace(/\/$/, "");

function readStagingKey() {
  const fromEnv =
    process.env.NAKAMA_SOCKET_SERVER_KEY || process.env.LOOT_NAKAMA_SERVER_KEY || "";
  if (fromEnv.trim()) return fromEnv.trim();
  if (ENV === "local") return "defaultkey";
  const cfgPath = path.join(ROOT, "loot&lasers", "Config", "nakama_secrets.cfg");
  if (!fs.existsSync(cfgPath)) return "";
  const text = fs.readFileSync(cfgPath, "utf8");
  let inStaging = false;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("[")) {
      inStaging = t.toLowerCase() === "[staging]";
      continue;
    }
    if (!inStaging) continue;
    const m = t.match(/^server_key\s*=\s*"?([^"]+)"?\s*$/i);
    if (m) return m[1].trim();
  }
  return "";
}

const KEY = readStagingKey() || ep.key;

let passed = 0;
let failed = 0;

function pass(msg) {
  passed++;
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failed++;
  console.error(`  ✗ ${msg}`);
}

function assert(cond, msg) {
  if (cond) pass(msg);
  else fail(msg);
}

function basicAuth(serverKey) {
  return Buffer.from(`${serverKey}:`, "utf8").toString("base64");
}

function alphaName(prefix = "Flow") {
  const letters = Array.from({ length: 8 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join("");
  return `${prefix}${letters}`;
}

function jwtPayload(token) {
  const part = String(token || "").split(".")[1] || "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
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
  return { ok: res.ok, status: res.status, body };
}

async function bridge(nakamaToken, email) {
  const payload = { nakama_token: nakamaToken, email };
  const res = await fetch(`${NODE}/api/auth/nakama-bridge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function nodeReq(pathname, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${NODE}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

/** AuthManager.fetch_me after JWT wiped: re-bridge then /me. */
async function fetchMeWithReconnect(nakamaToken, email, staleJwt) {
  const meStale = await nodeReq("/api/auth/me", { token: staleJwt });
  if (meStale.ok) {
    return { ok: false, error: "stale JWT unexpectedly accepted" };
  }
  const again = await bridge(nakamaToken, email);
  if (!again.ok || !again.body.access_token) {
    return { ok: false, error: `re-bridge failed: ${again.body.error || again.status}` };
  }
  const me = await nodeReq("/api/auth/me", { token: again.body.access_token });
  return {
    ok: me.ok,
    error: me.ok ? "" : `me after re-bridge ${me.status}`,
    data: me.data,
    access_token: again.body.access_token,
  };
}

async function runPlayer(label) {
  console.log(`\n[${label}]`);
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const email = `godot-flow-${label}-${stamp}@example.com`;
  const password = `FlowPass9x${stamp}`;

  const reg = await nakamaEmail(email, password, true);
  assert(reg.ok && reg.body.token, `${label}: Nakama register`);
  const nakamaToken = reg.body.token;

  const linked = await bridge(nakamaToken, email);
  assert(linked.ok && linked.body.access_token, `${label}: Node bridge`);
  const nodeUserId = linked.body.user?.id;
  assert(!!nodeUserId, `${label}: Node user id`);
  assert(linked.body.user?.email === email, `${label}: bridged email`);
  const gameplayClaims = jwtPayload(linked.body.access_token);
  const nakamaClaims = jwtPayload(nakamaToken);
  assert(gameplayClaims.sub === linked.body.nakama_user_id, `${label}: JWT subject is Nakama user`);
  assert(gameplayClaims.token_use === "nakama_gameplay", `${label}: gameplay token type`);
  assert(gameplayClaims.exp <= nakamaClaims.exp, `${label}: JWT capped by Nakama expiry`);
  assert(gameplayClaims.exp - gameplayClaims.iat <= 15 * 60, `${label}: short gameplay JWT`);

  let jwt = linked.body.access_token;

  const me = await nodeReq("/api/auth/me", { token: jwt });
  assert(me.ok && me.data?.id === nodeUserId, `${label}: /me`);

  const name = alphaName("Op");
  const requestId = `char-${stamp}`;
  const created = await nodeReq("/api/entities/Character", {
    method: "POST",
    token: jwt,
    body: { request_id: requestId, name, race: "human", class: "Vanguard", nova_crystals: 500 },
  });
  assert(created.status === 201 && created.data?.id, `${label}: create character (${created.status})`);
  const characterId = created.data.id;
  assert(created.data.created_by_id === nodeUserId, `${label}: character owned by Node user`);
  assert(
    created.data.nova_crystals === 50 || created.data.nova_crystals === 25,
    `${label}: starter Nova is server-authored`,
  );

  const replay = await nodeReq("/api/entities/Character", {
    method: "POST",
    token: jwt,
    body: { request_id: requestId, name, race: "human", class: "Vanguard", nova_crystals: 500 },
  });
  assert(replay.ok && replay.data?.id === characterId, `${label}: create replay returns same character`);
  const conflict = await nodeReq("/api/entities/Character", {
    method: "POST",
    token: jwt,
    body: {
      request_id: requestId,
      name: alphaName("Different"),
      race: "human",
      class: "Vanguard",
    },
  });
  assert(conflict.status === 409, `${label}: create request conflict is rejected`);

  const clearSelection = await nodeReq("/api/auth/me", {
    method: "PATCH",
    token: jwt,
    body: { active_character_id: null },
  });
  assert(clearSelection.ok && !clearSelection.data?.active_character_id, `${label}: clear selection`);
  const withoutSelection = await nodeReq("/api/functions/BuyFuel", {
    method: "POST",
    token: jwt,
    body: { request_id: `no-selection-${stamp}` },
  });
  assert(withoutSelection.status === 409, `${label}: gameplay rejects missing selection`);

  const select = await nodeReq("/api/auth/me", {
    method: "PATCH",
    token: jwt,
    body: { active_character_id: characterId },
  });
  assert(select.ok && select.data?.active_character_id === characterId, `${label}: select character`);
  const selected = await nodeReq("/api/auth/selected-character", { token: jwt });
  assert(selected.ok && selected.data?.id === characterId, `${label}: load selected character`);

  const list = await nodeReq("/api/entities/Character/filter", {
    method: "POST",
    token: jwt,
    body: { query: { created_by_id: nodeUserId }, sort: "-created_date", limit: 10 },
  });
  assert(
    list.ok && Array.isArray(list.data) && list.data.some((c) => c.id === characterId),
    `${label}: list characters`,
  );

  if (label === "player-a") {
    const beforeXp = Number(selected.data?.experience || 0);
    const launch = await nodeReq("/api/functions/LaunchMission", {
      method: "POST",
      token: jwt,
      body: {
        template: {
          name: "Installer Reward Verification",
          description: "Server-authoritative mission reward test",
          location: "Verification Reach",
          sector: 1,
          level_requirement: 1,
          duration_seconds: 15,
          stardust_efficiency: 1,
          xp_efficiency: 1,
        },
      },
    });
    assert(launch.ok && launch.data?.mission?.id, `${label}: Node mission launch`);
    const missionId = launch.data?.mission?.id;
    const serverRolledGear = launch.data?.mission?.rewards?.loot_drops === true;

    const skip = await nodeReq("/api/functions/SkipMission", {
      method: "POST",
      token: jwt,
      body: { mission_id: missionId },
    });
    assert(skip.ok && skip.data?.mission?.status === "completed", `${label}: Node mission skip`);

    const claimKey = `mission:${missionId}`;
    const claim = await nodeReq("/api/functions/ClaimMission", {
      method: "POST",
      token: jwt,
      body: { mission_id: missionId, won: true, idempotencyKey: claimKey },
    });
    assert(claim.ok && Number(claim.data?.gains?.experience || 0) > 0, `${label}: mission grants XP`);
    const deliveredItems = [
      ...(Array.isArray(claim.data?.items) ? claim.data.items : []),
      ...(Array.isArray(claim.data?.pending_loot) ? claim.data.pending_loot : []),
    ];
    if (serverRolledGear) {
      assert(deliveredItems.length > 0, `${label}: rolled mission gear is delivered`);
    } else {
      pass(`${label}: server-authored mission gear miss recorded`);
    }

    const afterClaim = await nodeReq(`/api/entities/Character/${characterId}`, { token: jwt });
    const xpAdvanced =
      Number(afterClaim.data?.experience || 0) > beforeXp ||
      Number(afterClaim.data?.level || 1) > Number(selected.data?.level || 1);
    assert(afterClaim.ok && xpAdvanced, `${label}: mission XP persists on Character`);
    assert(!afterClaim.data?.active_mission_id, `${label}: mission claim clears active pointer`);

    const claimReplay = await nodeReq("/api/functions/ClaimMission", {
      method: "POST",
      token: jwt,
      body: { mission_id: missionId, won: true, idempotencyKey: claimKey },
    });
    assert(
      claimReplay.ok && claimReplay.data?.idempotentReplay === true,
      `${label}: mission claim retry replays without conflict`,
    );
    const afterReplay = await nodeReq(`/api/entities/Character/${characterId}`, { token: jwt });
    assert(
      Number(afterReplay.data?.experience || 0) === Number(afterClaim.data?.experience || 0)
        && Number(afterReplay.data?.level || 1) === Number(afterClaim.data?.level || 1),
      `${label}: mission claim retry does not duplicate XP`,
    );
  }

  const staleJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.invalid";
  const reconnect = await fetchMeWithReconnect(nakamaToken, email, staleJwt);
  assert(reconnect.ok && reconnect.data?.id === nodeUserId, `${label}: JWT expiry re-bridge`);
  jwt = reconnect.access_token;

  const after = await nodeReq(`/api/entities/Character/${characterId}`, { token: jwt });
  assert(after.ok && after.data?.id === characterId, `${label}: character after reconnect`);

  const login = await nakamaEmail(email, password, false);
  assert(login.ok && login.body.token, `${label}: Nakama login`);
  const bridgedLogin = await bridge(login.body.token, email);
  assert(
    bridgedLogin.ok && bridgedLogin.body.user?.id === nodeUserId,
    `${label}: login re-bridge same Node user`,
  );
  const selectedOnSecondSession = await nodeReq("/api/auth/selected-character", {
    token: bridgedLogin.body.access_token,
  });
  assert(
    selectedOnSecondSession.ok && selectedOnSecondSession.data?.id === characterId,
    `${label}: account-global selection restored on second session`,
  );

  return {
    email,
    password,
    nodeUserId,
    characterId,
    jwt: bridgedLogin.body.access_token,
  };
}

async function main() {
  console.log("Godot auth→gameplay flow");
  console.log(`  env=${ENV} nakama=${NAKAMA} node=${NODE}`);

  if (!KEY) {
    fail("Nakama server key configured");
    process.exit(1);
  }
  pass("Nakama server key configured");

  const health = await nodeReq("/health");
  assert(health.ok && health.data?.ok, "Node health");

  const a = await runPlayer("player-a");
  const b = await runPlayer("player-b");

  assert(a.nodeUserId !== b.nodeUserId, "friend accounts are distinct Node users");
  assert(a.characterId !== b.characterId, "friend characters are distinct");

  const aList = await nodeReq("/api/entities/Character/filter", {
    method: "POST",
    token: a.jwt,
    body: { query: { created_by_id: a.nodeUserId }, limit: 20 },
  });
  assert(
    aList.ok && !aList.data.some((c) => c.id === b.characterId),
    "player-a list excludes friend character",
  );

  // Ownership isolation: a foreign Character is never readable.
  const cross = await nodeReq(`/api/entities/Character/${b.characterId}`, { token: a.jwt });
  assert(!cross.ok && [403, 404].includes(cross.status), "player-a cross-get is denied");

  console.log("\n--- Summary ---");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
  console.log(
    "Godot auth→gameplay flow OK (login, bridge, character, reconnect, friend isolation).",
  );
}

main().catch((err) => {
  console.error("FAIL", err.message || err);
  process.exit(1);
});
