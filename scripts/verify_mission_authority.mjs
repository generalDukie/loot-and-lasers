/**
 * Phase 8 verification — Nakama sole mission authority (no rewards/fuel debit).
 */
import crypto from "node:crypto";

const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";
const DEVICE_ID = `mission-phase8-${crypto.randomBytes(8).toString("hex")}`;
const CHAR_ID = "char-phase8-migrate";

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`);
}
function parseEnvelope(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body && typeof body.payload === "string") {
    try {
      return JSON.parse(body.payload);
    } catch {
      return body;
    }
  }
  return body;
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
  if (!res.ok || !body.token) throw new Error("Auth failed");
  return body.token;
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
  return { status: res.status, body: parseEnvelope(body), text };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const token = await authDevice();
  await callRpc(token, "profile_get", {});
  await callRpc(token, "profile_update", { selected_character_id: CHAR_ID });
  const base = { character_id: CHAR_ID, level: 1, highest_sector: 0 };

  const board = await callRpc(token, "missions_get", base);
  const missions = board.body?.data?.board?.missions || [];
  if (missions.length === 3) pass("Cantina board from missions_get", String(missions.length));
  else fail("Cantina board from missions_get", board.text.slice(0, 300));

  const mid = missions[0]?.mission_id;
  const start = await callRpc(token, "mission_start", { character_id: CHAR_ID, mission_id: mid });
  if (start.body?.data?.mission?.status === "active") {
    pass("start uses mission_start", start.body.data.mission.completes_at);
  } else fail("start uses mission_start", start.text.slice(0, 300));

  // Simulate reopen
  const status = await callRpc(token, "mission_status", { character_id: CHAR_ID });
  if (status.body?.data?.mission?.mission_id === mid && status.body.data.mission.status === "active") {
    pass("reopen restores active from Nakama");
  } else fail("reopen restores active from Nakama", status.text.slice(0, 300));

  if ((status.body?.data?.seconds_remaining ?? 0) > 0) {
    pass("countdown remaining from Nakama", String(status.body.data.seconds_remaining));
  } else fail("countdown remaining from Nakama");

  const wait = Math.min(35, (missions[0]?.duration_seconds || 15) + 2);
  console.log(`Waiting ${wait}s…`);
  await sleep(wait * 1000);

  const done = await callRpc(token, "mission_status", { character_id: CHAR_ID });
  if (done.body?.data?.mission?.status === "complete" || done.body?.data?.is_complete) {
    pass("completion from Nakama");
  } else fail("completion from Nakama", done.text.slice(0, 300));

  // Legacy LaunchMission absent; mission_claim is Phase 14 (present)
  {
    const r = await callRpc(token, "LaunchMission", {});
    if (r.status === 404 || /not found/i.test(r.text)) pass("no LaunchMission on Nakama");
    else fail("no LaunchMission on Nakama", r.text.slice(0, 100));
  }
  {
    const r = await callRpc(token, "mission_claim", { character_id: CHAR_ID, mission_id: "x", request_id: "probe-1" });
    if (r.status === 404 || /rpc not found/i.test(r.text + JSON.stringify(r.body))) {
      fail("mission_claim present (Phase 14)", r.text.slice(0, 100));
    } else pass("mission_claim present (Phase 14)");
  }

  // Wallet unchanged path still read-only
  const w = await callRpc(token, "wallet_get", {});
  if (w.body?.success !== false) pass("wallet untouched (get works)");
  else fail("wallet untouched", w.text.slice(0, 120));

  console.log("\n--- Summary ---");
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
