/**
 * One-shot staging probe: Nakama auth → Node bridge → select char → sample RPCs.
 * Usage: node server/scripts/probe-staging-gameplay.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NODE = (process.env.API_URL || "https://178.156.210.186").replace(/\/$/, "");
const NAKAMA = (process.env.NAKAMA_HTTP_URL || "https://178.156.210.186:8443").replace(/\/$/, "");

function readStagingKey() {
  const fromEnv = process.env.NAKAMA_SOCKET_SERVER_KEY || process.env.LOOT_NAKAMA_SERVER_KEY || "";
  if (fromEnv.trim()) return fromEnv.trim();
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

const KEY = readStagingKey();
if (!KEY) {
  console.error("Missing staging Nakama server key");
  process.exit(1);
}

async function main() {
  const stamp = Date.now();
  const email = `probe-${stamp}@example.com`;
  const password = `Probe9x${stamp}`;
  const basic = Buffer.from(`${KEY}:`).toString("base64");

  const auth = await fetch(`${NAKAMA}/v2/account/authenticate/email?create=true`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const authBody = await auth.json().catch(() => ({}));
  if (!auth.ok) {
    console.error("nakama fail", auth.status, authBody);
    process.exit(1);
  }

  const bridge = await fetch(`${NODE}/api/auth/nakama-bridge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nakama_token: authBody.token, email }),
  });
  const bridgeBody = await bridge.json().catch(() => ({}));
  if (!bridge.ok) {
    console.error("bridge fail", bridge.status, bridgeBody);
    process.exit(1);
  }
  const jwt = bridgeBody.access_token;

  async function call(pathname, method = "GET", body) {
    const res = await fetch(`${NODE}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  }

  const created = await call("/api/entities/Character", "POST", {
    request_id: `p${stamp}`,
    name: "ProbeOp",
    race: "human",
    class: "Vanguard",
  });
  console.log("create", created.status, created.data?.id || created.data?.error || created.data);

  const cid = created.data?.id;
  if (!cid) process.exit(1);

  const select = await call("/api/auth/me", "PATCH", { active_character_id: cid });
  console.log("select", select.status, select.data?.active_character_id || select.data?.error);

  const tests = [
    ["GetArenaStatus", {}],
    ["GetArenaLeaderboard", { limit: 10 }],
    ["GetGuildLeaderboard", { limit: 10 }],
    ["GetChatHistory", { channel: "global", limit: 5 }],
    ["GetSocialState", {}],
    ["SendMessage", { channel: "global", content: "probe ping" }],
    ["GetRuntimeConfig", {}],
  ];

  for (const [name, body] of tests) {
    const r = await call(`/api/functions/${name}`, "POST", body);
    const detail = r.data?.error || r.data?.code || (r.status < 400 ? "ok" : JSON.stringify(r.data).slice(0, 160));
    console.log(r.status < 400 ? "OK  " : "FAIL", name, r.status, String(detail).slice(0, 160));
  }

  // Full mission path: persist offers → launch (offer_id) → skip → prepare combat → claim.
  const board = await call("/api/functions/GetCantinaOffers", "POST", {});
  const offers = Array.isArray(board.data?.offers) ? board.data.offers : [];
  console.log(
    board.status < 400 && offers.length ? "OK  " : "FAIL",
    "GetCantinaOffers",
    board.status,
    offers.length ? `${offers.length} offers` : board.data?.error || "no offers"
  );
  const offerId = offers[0]?.id;
  const launch = await call("/api/functions/LaunchMission", "POST", {
    offer_id: offerId,
  });
  const mid = launch.data?.mission?.id;
  console.log(launch.status < 400 ? "OK  " : "FAIL", "LaunchMission", launch.status, mid || launch.data?.error);
  if (mid) {
    const skip = await call("/api/functions/SkipMission", "POST", { mission_id: mid });
    console.log(skip.status < 400 ? "OK  " : "FAIL", "SkipMission", skip.status, skip.data?.error || skip.data?.mission?.status);
    const prep = await call("/api/functions/PrepareMissionCombat", "POST", { mission_id: mid });
    console.log(
      prep.status < 400 ? "OK  " : "FAIL",
      "PrepareMissionCombat",
      prep.status,
      prep.data?.error || prep.data?.combat_id || prep.data?.winner,
    );
    const claim = await call("/api/functions/ClaimMission", "POST", {
      mission_id: mid,
      idempotencyKey: `mission:${mid}`,
    });
    console.log(
      claim.status < 400 ? "OK  " : "FAIL",
      "ClaimMission",
      claim.status,
      claim.data?.error || `won=${claim.data?.won} xp=${claim.data?.gains?.experience}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
