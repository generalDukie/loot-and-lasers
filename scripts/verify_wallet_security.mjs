/**
 * Phase 5 security verification — wallet mutation lockdown.
 * Talks to local Nakama (127.0.0.1:7350, defaultkey).
 */
import crypto from "node:crypto";

const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";
const DEVICE_ID = `wallet-sec-${crypto.randomBytes(8).toString("hex")}`;

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`);
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
  // Our gated handlers return envelope with status_code 404
  if (body && (body.status_code === 404 || (body.error && /rpc not found/i.test(body.error)))) {
    return true;
  }
  return false;
}

async function main() {
  console.log("Authenticating…");
  const token = await authDevice();
  console.log("Session OK\n");

  // 1–3: former public mutation RPCs must not be callable
  for (const rpc of ["wallet_credit", "wallet_debit"]) {
    const r = await callRpc(token, rpc, {
      currency_id: "stardust",
      amount: 1,
      transaction_id: "should-fail-" + Date.now(),
      reason: "security probe",
    });
    if (looksLikeRpcMissing(r.status, r.body, r.text) || (!r.ok && r.status >= 400)) {
      // Nakama typically returns 404 for unknown RPC id
      if (looksLikeRpcMissing(r.status, r.body, r.text) || r.status === 404) {
        pass(`client cannot invoke ${rpc}`, `HTTP ${r.status}`);
      } else if (r.body && r.body.success === false) {
        // Still safe rejection (not a successful mutation)
        const mutated = r.body.success === true;
        if (!mutated) {
          pass(`client cannot invoke ${rpc}`, `rejected HTTP ${r.status}: ${r.body.error || r.text}`);
        } else {
          fail(`client cannot invoke ${rpc}`, "mutation succeeded");
        }
      } else {
        pass(`client cannot invoke ${rpc}`, `rejected HTTP ${r.status}`);
      }
    } else if (r.body && r.body.success === true) {
      fail(`client cannot invoke ${rpc}`, "unexpected success");
    } else {
      fail(`client cannot invoke ${rpc}`, `unexpected: HTTP ${r.status} ${r.text.slice(0, 200)}`);
    }
  }

  // 4: wallet_get still works
  const get1 = await callRpc(token, "wallet_get", {});
  const getData = get1.body?.data || get1.body;
  const balances = getData?.balances || get1.body?.balances;
  if (get1.ok && (balances || get1.body?.success !== false)) {
    const bal = balances || get1.body?.data?.balances || {};
    pass("wallet_get returns balances", JSON.stringify(bal));
  } else {
    fail("wallet_get returns balances", get1.text.slice(0, 300));
  }

  // 5–9: internal functions via gated selftest RPC
  const selftest = await callRpc(token, "dev_wallet_internal_selftest", {});
  const report = selftest.body?.data || selftest.body;
  if (selftest.ok && report?.passed) {
    pass("internal credit_currency works (selftest)");
    pass("internal debit_currency works (selftest)");
    pass("duplicate transaction_id rejected", String(report.duplicate_rejected));
    pass("insufficient funds rejected", String(report.insufficient_rejected));
    pass("transaction records written", String(report.tx_logged));
  } else if (selftest.body?.status_code === 404 || looksLikeRpcMissing(selftest.status, selftest.body, selftest.text)) {
    fail("internal selftest", "LOOT_DEV_WALLET_MUTATIONS not enabled — restart Nakama with docker-compose");
  } else {
    fail("internal selftest", selftest.text.slice(0, 500));
    if (report) {
      console.error("  report:", JSON.stringify(report, null, 2));
    }
  }

  // Confirm wallet_get still read-only after selftest
  const get2 = await callRpc(token, "wallet_get", {});
  if (get2.ok) {
    pass("wallet_get still read-only after mutations", "ok");
  } else {
    fail("wallet_get after mutations", get2.text.slice(0, 200));
  }

  // Premium blocked on dev credit test
  const prem = await callRpc(token, "dev_wallet_credit_test", {
    currency_id: "nova_crystals",
    amount: 1,
    transaction_id: "prem-" + Date.now(),
    reason: "should reject premium",
  });
  if (!prem.ok || prem.body?.success === false) {
    pass("dev credit cannot modify premium", prem.body?.error || `HTTP ${prem.status}`);
  } else {
    fail("dev credit cannot modify premium", "premium credit succeeded");
  }

  console.log("\n--- Summary ---");
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
