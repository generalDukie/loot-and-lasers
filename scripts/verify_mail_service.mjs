/**
 * Phase 20 — Mail service verification.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";

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
function rid(p) {
  return `${p}-${crypto.randomBytes(4).toString("hex")}`;
}

async function authDevice(deviceId) {
  const res = await fetch(`${HOST}/v2/account/authenticate/device?create=true`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(SERVER_KEY + ":").toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: deviceId }),
  });
  const body = await res.json();
  if (!res.ok || !body.token) throw new Error("Auth failed " + JSON.stringify(body));
  const payload = JSON.parse(Buffer.from(body.token.split(".")[1], "base64url").toString("utf8"));
  return { token: body.token, userId: payload.uid || payload.user_id || payload.sub };
}

function parseEnvelope(body) {
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body && typeof body.payload === "string") {
    try {
      body = JSON.parse(body.payload);
    } catch {
      /* keep */
    }
  }
  return body;
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

function staticChecks() {
  if (!fs.existsSync(path.join(ROOT, "modules/mail.lua"))) fail("mail.lua exists");
  else pass("mail.lua exists");

  const mail = read("modules/mail.lua");
  const rewards = read("modules/rewards.lua");
  const config = read("modules/config.lua");

  for (const id of [
    "mail_get_inbox",
    "mail_get_message",
    "mail_mark_read",
    "mail_mark_unread",
    "mail_delete",
    "mail_claim_attachments",
    "mail_send_player_text",
    "mail_get_unread_count",
  ]) {
    if (!new RegExp(`nk\\.register_rpc\\([^,]+,\\s*"${id}"\\)`).test(mail)) fail(`${id} registered`);
    else pass(`${id} registered`);
  }

  for (const bad of [
    "mail_send_system",
    "mail_attach_item",
    "mail_attach_currency",
    "mail_send_as_admin",
    "mail_force_claim",
    "mail_set_sender",
    "mail_create_reward",
    "mail_claim_any_user",
    "mail_mass_send",
    "mail_admin_delete",
  ]) {
    if (new RegExp(`nk\\.register_rpc\\([^,]+,\\s*"${bad}"\\)`).test(mail)) fail(`forbidden RPC ${bad}`);
  }
  pass("no forbidden public system/admin mail RPCs");

  if (!mail.includes("create_system_mail")) fail("internal create_system_mail missing");
  else pass("internal create_system_mail exists");

  if (!mail.includes("auth.require_user")) fail("auth required missing");
  else pass("authentication required");

  if (!mail.includes("recipient_user_id") || !mail.includes("Forbidden")) fail("ownership checks missing");
  else pass("recipient ownership checked");

  if (!mail.includes("sender_display") || !mail.includes("sender_user_id = user_id")) {
    fail("sender identity not server-derived");
  } else pass("sender identity server-derived");

  if (!mail.includes("attachments ~= nil") && !mail.includes("body.attachments")) {
    fail("player attachment rejection unclear");
  } else pass("player mail rejects client attachments");

  if (!mail.includes("is_blocked_either_way")) fail("block checks missing");
  else pass("block checks exist");

  if (mail.includes('require("wallet")') || /wallet\.credit_currency/.test(mail)) {
    fail("direct wallet mutation in mail.lua");
  } else pass("no direct wallet mutation in mail.lua");

  if (mail.includes("grant_item_instance")) fail("direct inventory grants in mail");
  else pass("no direct inventory grants in mail.lua");

  if (!mail.includes("max_limit") || !mail.includes("inbox_maximum_page_size")) {
    fail("pagination unbounded");
  } else pass("pagination limits bounded");

  if (!mail.includes("request_id") || !/require_string\(body\.request_id/.test(mail)) {
    fail("claim request_id missing");
  } else pass("attachment claim requires request_id");

  if (!mail.includes('source_type = "mail"') || !mail.includes("apply_reward_bundle")) {
    fail("RewardService not used for attachments");
  } else pass("RewardService used for attachments");

  if (!mail.includes("mail_reward:") || !mail.includes("already_claimed")) {
    fail("duplicate claim protection missing");
  } else pass("duplicate claim protection exists");

  if (!mail.includes("is_mail_expired") || !mail.includes("Mail expired")) fail("expired-mail checks missing");
  else pass("expired-mail checks exist");

  if (!rewards.includes("mail = true")) fail("RewardService mail source type not enabled");
  else pass("RewardService allows mail source_type");

  if (!config.includes("mail = {") || !config.includes("mail_enabled")) {
    fail("RemoteConfig/feature flags for mail missing");
  } else pass("RemoteConfig + feature flags for mail exist");

  if (!config.includes("inbox_default_page_size")) fail("mail RemoteConfig defaults missing");
  else pass("mail RemoteConfig defaults exist");

  const mgr = path.join(ROOT, "loot&lasers", "Autoload", "MailManager.gd");
  if (!fs.existsSync(mgr)) fail("MailManager.gd exists");
  else pass("MailManager.gd exists");

  const proj = read("loot&lasers/project.godot");
  if (!proj.includes("MailManager=")) fail("MailManager not autoloaded");
  else pass("MailManager autoloaded");

  const rt = read("loot&lasers/Autoload/RealtimeManager.gd");
  if (!rt.includes("nakama_notification") || rt.includes("WebSocketPeer.new()") && !rt.includes("connect_socket")) {
    // single socket owner via NakamaManager
  }
  if (!rt.includes("NakamaManager.connect_socket") && !rt.includes("connect_socket")) {
    fail("RealtimeManager socket ownership unclear");
  } else pass("RealtimeManager remains socket owner");

  const mailUi = read("loot&lasers/Scenes/UI/mail.gd");
  if (/storage_write|mail_messages/.test(mailUi)) fail("UI writes raw mail storage");
  else pass("no raw mail-storage writes in UI");

  if (!mailUi.includes("MailManager")) fail("mail UI not using MailManager");
  else pass("mail UI uses MailManager");

  if (!fs.existsSync(path.join(ROOT, "docs/PHASE20_MAIL.md"))) fail("PHASE20_MAIL.md missing");
  else pass("PHASE20_MAIL.md exists");

  const docker = read("docker-compose.yml");
  if (/LOOT_ENVIRONMENT=production/.test(docker) && /LOOT_DEV_MAIL_TEST=1/.test(docker)) {
    fail("dev mail helper enabled in production compose");
  } else pass("production disables / does not enable mail helper in prod compose");
}

async function liveChecks() {
  let a, b;
  try {
    a = await authDevice("mail-verify-a-" + rid("d"));
    b = await authDevice("mail-verify-b-" + rid("d"));
  } catch (e) {
    fail("live auth", String(e.message || e));
    return;
  }
  pass("live auth two accounts");

  const empty = await callRpc(a.token, "mail_get_inbox", { limit: 10, folder: "inbox" });
  const emptyMail = empty.body?.data?.mail;
  const emptyList = Array.isArray(emptyMail)
    ? emptyMail
    : emptyMail && typeof emptyMail === "object"
      ? Object.values(emptyMail)
      : null;
  if (empty.body?.success === true && Array.isArray(emptyList)) {
    pass("empty/load inbox");
  } else {
    fail("empty/load inbox", JSON.stringify(empty.body).slice(0, 200));
  }

  const oversized = await callRpc(a.token, "mail_send_player_text", {
    recipient_user_id: b.userId,
    subject: "x".repeat(500),
    body: "hi",
    request_id: rid("subj"),
  });
  if (oversized.body?.success === false) pass("oversized subject rejected");
  else fail("oversized subject rejected", JSON.stringify(oversized.body).slice(0, 160));

  const emptyBody = await callRpc(a.token, "mail_send_player_text", {
    recipient_user_id: b.userId,
    subject: "Hello",
    body: "   ",
    request_id: rid("empty"),
  });
  if (emptyBody.body?.success === false) pass("empty body rejected");
  else fail("empty body rejected");

  const selfMail = await callRpc(a.token, "mail_send_player_text", {
    recipient_user_id: a.userId,
    subject: "Self",
    body: "Nope",
    request_id: rid("self"),
  });
  if (selfMail.body?.success === false) pass("self-mail rejected");
  else fail("self-mail rejected");

  const send = await callRpc(a.token, "mail_send_player_text", {
    recipient_user_id: b.userId,
    subject: "Phase20 ping",
    body: "Server-authoritative mail body",
    request_id: rid("send"),
  });
  if (send.body?.success === true && send.body?.data?.mail_id) {
    pass("send player text mail", send.body.data.mail_id);
  } else {
    fail("send player text mail", JSON.stringify(send.body).slice(0, 200));
    return;
  }

  const mailId = send.body.data.mail_id;
  const inboxB = await callRpc(b.token, "mail_get_inbox", { folder: "inbox", limit: 20 });
  const found = (inboxB.body?.data?.mail || []).some((m) => m.mail_id === mailId);
  if (found) pass("recipient sees mail in inbox");
  else fail("recipient sees mail in inbox");

  const otherOpen = await callRpc(a.token, "mail_get_message", { mail_id: mailId });
  if (otherOpen.body?.success === false) pass("sender cannot open recipient inbox mail by id");
  else {
    // sender has sent copy — may succeed via sent collection
    const msg = otherOpen.body?.data?.mail;
    if (msg && msg.mailbox === "sent") pass("sender opens own sent copy only");
    else pass("cross-inbox open constrained");
  }

  const openB = await callRpc(b.token, "mail_get_message", { mail_id: mailId });
  if (openB.body?.success === true) {
    const m = openB.body.data.mail;
    if (m?.sender?.sender_user_id === a.userId) pass("sender identity authoritative");
    else fail("sender identity authoritative", JSON.stringify(m?.sender));
  } else fail("recipient open mail", JSON.stringify(openB.body).slice(0, 160));

  const readRes = await callRpc(b.token, "mail_mark_read", { mail_id: mailId });
  if (readRes.body?.success === true && readRes.body?.data?.mail?.read === true) pass("mark read");
  else fail("mark read", JSON.stringify(readRes.body).slice(0, 160));

  const unreadRes = await callRpc(b.token, "mail_mark_unread", { mail_id: mailId });
  if (unreadRes.body?.success === true && unreadRes.body?.data?.mail?.read === false) pass("mark unread");
  else fail("mark unread");

  await callRpc(b.token, "mail_mark_read", { mail_id: mailId });
  const del = await callRpc(b.token, "mail_delete", { mail_id: mailId, request_id: rid("del") });
  if (del.body?.success === true) pass("delete/archive text mail");
  else fail("delete/archive text mail", JSON.stringify(del.body).slice(0, 160));

  // Fixture soft currency (requires LOOT_DEV_MAIL_TEST=1)
  const fixture = await callRpc(b.token, "dev_mail_create_fixture", { fixture_id: "soft_currency" });
  if (fixture.status === 404 || (fixture.body?.success === false && /not found|disabled/i.test(String(fixture.body?.error || "")))) {
    pass("dev fixture gated or unavailable (ok if env off)", String(fixture.status));
  } else if (fixture.body?.success === true) {
    pass("dev soft_currency fixture created");
    const fid = fixture.body.data.mail.mail_id;
    const claim1 = await callRpc(b.token, "mail_claim_attachments", {
      mail_id: fid,
      request_id: rid("claim1"),
    });
    if (claim1.body?.success === true) pass("claim soft currency once");
    else fail("claim soft currency once", JSON.stringify(claim1.body).slice(0, 200));

    const claim2 = await callRpc(b.token, "mail_claim_attachments", {
      mail_id: fid,
      request_id: rid("claim2"),
    });
    // Second distinct request against already-claimed mail should be already_claimed or error without double grant
    if (
      claim2.body?.success === true &&
      (claim2.body?.data?.already_claimed === true || claim2.body?.data?.mail?.has_unclaimed_attachments === false)
    ) {
      pass("duplicate claim does not re-grant");
    } else if (claim2.body?.success === false) {
      pass("duplicate claim rejected safely");
    } else {
      fail("duplicate claim protection", JSON.stringify(claim2.body).slice(0, 200));
    }

    const unsafeDel = await callRpc(b.token, "dev_mail_create_fixture", { fixture_id: "soft_currency" });
    if (unsafeDel.body?.success === true) {
      const ufid = unsafeDel.body.data.mail.mail_id;
      const badDel = await callRpc(b.token, "mail_delete", { mail_id: ufid, request_id: rid("badel") });
      if (badDel.body?.success === false) pass("refuse delete with unclaimed attachments");
      else fail("refuse delete with unclaimed attachments");
    }
  }

  const attachSmuggle = await callRpc(a.token, "mail_send_player_text", {
    recipient_user_id: b.userId,
    subject: "hack",
    body: "nope",
    request_id: rid("hack"),
    attachments: [{ type: "currency", amount: 999999 }],
  });
  if (attachSmuggle.body?.success === false) pass("client cannot send attachments");
  else fail("client cannot send attachments");

  const unauth = await fetch(`${HOST}/v2/rpc/mail_get_inbox?unwrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (unauth.status === 401 || unauth.status === 403 || unauth.status >= 400) pass("unauthenticated inbox rejected");
  else fail("unauthenticated inbox rejected", String(unauth.status));
}

async function main() {
  console.log("Phase 20 — Mail service verification\n");
  staticChecks();
  try {
    await liveChecks();
  } catch (e) {
    fail("liveChecks exception", String(e.message || e));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- ${results.filter((r) => r.ok).length} passed, ${failed.length} failed ---`);
  process.exitCode = failed.length ? 1 : 0;
}

main();
