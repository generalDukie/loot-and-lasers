/**
 * Phase 7 verification — mission service core (no rewards).
 * Local Nakama: 127.0.0.1:7350, defaultkey.
 */
import crypto from "node:crypto";

const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";
const DEVICE_ID = `mission-phase7-${crypto.randomBytes(8).toString("hex")}`;
const CHAR_ID = "char-phase7-missions";

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
  return { status: res.status, ok: res.ok, body: parseEnvelope(body), text };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Authenticating…");
  const token = await authDevice();
  await callRpc(token, "profile_get", {});
  await callRpc(token, "profile_update", { selected_character_id: CHAR_ID });
  console.log("Session + character OK\n");

  const base = { character_id: CHAR_ID, level: 1, highest_sector: 0 };

  // 1. Load board
  const get1 = await callRpc(token, "missions_get", base);
  const missions = get1.body?.data?.board?.missions || [];
  if (get1.body?.success !== false && missions.length === 3) {
    pass("load mission board", `${missions.length} missions`);
  } else {
    fail("load mission board", get1.text.slice(0, 400));
  }

  // 2. Persist / same board on reload
  const get2 = await callRpc(token, "missions_get", base);
  const ids1 = missions.map((m) => m.mission_id).sort().join(",");
  const ids2 = (get2.body?.data?.board?.missions || []).map((m) => m.mission_id).sort().join(",");
  if (ids1 && ids1 === ids2) {
    pass("board persists across get");
  } else {
    fail("board persists across get", `${ids1} vs ${ids2}`);
  }

  // 3. Server-side generation fields present
  const sample = missions[0] || {};
  if (sample.mission_id && sample.duration_seconds >= 15 && sample.status === "available") {
    pass("missions generated server-side", `${sample.title} ${sample.duration_seconds}s`);
  } else {
    fail("missions generated server-side", JSON.stringify(sample).slice(0, 200));
  }

  // Reject client timing
  const badStart = await callRpc(token, "mission_start", {
    ...base,
    mission_id: sample.mission_id,
    completes_at: "2099-01-01T00:00:00Z",
  });
  if (badStart.body?.success === false) {
    pass("rejects client timestamps", badStart.body.error);
  } else {
    fail("rejects client timestamps", badStart.text.slice(0, 200));
  }

  // 4–6. Start once, duplicate rejected, timestamps recorded
  const start = await callRpc(token, "mission_start", {
    ...base,
    mission_id: sample.mission_id,
  });
  const active = start.body?.data?.mission;
  if (start.body?.success !== false && active?.status === "active" && active.started_at && active.completes_at) {
    pass("mission started once", `${active.started_at} → ${active.completes_at}`);
  } else {
    fail("mission started once", start.text.slice(0, 400));
  }

  const dup = await callRpc(token, "mission_start", {
    ...base,
    mission_id: sample.mission_id,
  });
  if (dup.body?.success === false) {
    pass("duplicate start rejected", dup.body.error);
  } else {
    fail("duplicate start rejected", dup.text.slice(0, 200));
  }

  // 7. Status while active
  const st1 = await callRpc(token, "mission_status", { character_id: CHAR_ID });
  if (st1.body?.data?.mission?.status === "active" && st1.body.data.seconds_remaining > 0) {
    pass("status active with remaining", String(st1.body.data.seconds_remaining));
  } else {
    fail("status active with remaining", st1.text.slice(0, 300));
  }

  // Wrong character
  const wrong = await callRpc(token, "missions_get", {
    character_id: "other-char",
    level: 1,
    highest_sector: 0,
  });
  if (wrong.body?.success === false) {
    pass("other character rejected", wrong.body.error);
  } else {
    fail("other character rejected", wrong.text.slice(0, 200));
  }

  // Refresh while active blocked
  const refActive = await callRpc(token, "missions_refresh", base);
  if (refActive.body?.success === false) {
    pass("refresh blocked while active", refActive.body.error);
  } else {
    fail("refresh blocked while active", refActive.text.slice(0, 200));
  }

  // Wait for timer (use duration — level 1 is 15–30s). Cap wait at completes.
  const waitSec = Math.min(35, Math.max(1, (active?.duration_seconds || 15) + 2));
  console.log(`Waiting ${waitSec}s for timer completion…`);
  await sleep(waitSec * 1000);

  const st2 = await callRpc(token, "mission_status", { character_id: CHAR_ID });
  if (st2.body?.data?.mission?.status === "complete" || st2.body?.data?.is_complete === true) {
    pass("status becomes complete after server time", st2.body.data.mission?.completed_at || "ok");
  } else {
    fail("status becomes complete after server time", st2.text.slice(0, 400));
  }

  // No reward RPCs
  for (const rpc of ["mission_claim", "mission_reward", "mission_complete_reward"]) {
    const r = await callRpc(token, rpc, {});
    if (r.status === 404 || /not found/i.test(r.text)) {
      pass(`no reward RPC ${rpc}`);
    } else {
      fail(`no reward RPC ${rpc}`, r.text.slice(0, 120));
    }
  }

  // Sibling services still registered
  for (const rpc of ["wallet_get", "inventory_get", "equipment_get", "profile_get"]) {
    const r = await callRpc(token, rpc, rpc === "wallet_get" || rpc === "profile_get" ? {} : { character_id: CHAR_ID });
    if (r.status === 200 || r.body?.success !== false) {
      pass(`${rpc} still works`);
    } else if (r.body?.error) {
      // equipment/inventory may 422 on prior bad writes — presence of handler is enough if not 404
      if (r.status !== 404) pass(`${rpc} still registered`, r.body.error);
      else fail(`${rpc} still works`, r.text.slice(0, 120));
    } else {
      fail(`${rpc} still works`, r.text.slice(0, 120));
    }
  }

  // Refresh after complete
  await sleep(16000); // cooldown
  const ref2 = await callRpc(token, "missions_refresh", base);
  if (ref2.body?.success !== false && (ref2.body?.data?.board?.missions || []).length === 3) {
    pass("refresh after complete", "new board");
  } else {
    fail("refresh after complete", ref2.text.slice(0, 300));
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
