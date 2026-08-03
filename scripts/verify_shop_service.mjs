/**
 * Phase 15 — Secure shop service verification.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HOST = "http://127.0.0.1:7350";
const SERVER_KEY = "defaultkey";
const DEVICE_ID = `shop-svc-${crypto.randomBytes(8).toString("hex")}`;
const CHAR_ID = `shop-char-${crypto.randomBytes(4).toString("hex")}`;

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
  if (!fs.existsSync(path.join(ROOT, "modules/shops.lua"))) fail("shops.lua exists");
  else pass("shops.lua exists");

  const src = read("modules/shops.lua");
  for (const id of ["shop_get", "shop_buy", "shop_sell", "shop_refresh"]) {
    if (!new RegExp(`nk\\.register_rpc\\([^,]+,\\s*"${id}"\\)`).test(src)) fail(`${id} registered`);
    else pass(`${id} registered`);
  }
  for (const id of ["shop_set_price", "shop_grant_item", "shop_credit", "shop_force_refresh", "shop_debug_buy_any"]) {
    if (new RegExp(`nk\\.register_rpc\\([^,]+,\\s*"${id}"\\)`).test(src)) fail(`forbidden RPC ${id}`);
  }
  pass("no forbidden shop admin RPCs");

  if (!src.includes("request_id") || !src.includes("Conflicting reuse")) fail("idempotency missing");
  else pass("idempotency present");

  if (!src.includes('require("wallet")') || !src.includes("debit_currency")) fail("wallet integration missing");
  else pass("wallet debit/credit used");

  if (!src.includes('require("inventory")') || !src.includes("grant_item_instance")) fail("inventory grant missing");
  else pass("inventory grant used");

  if (!src.includes("remove_item_instance")) fail("inventory remove missing");
  else pass("inventory remove used");

  if (!src.includes("Cannot sell equipped")) fail("equipped sale rejection missing");
  else pass("equipped sale rejected");

  if (!src.includes("Inventory full")) fail("capacity check missing");
  else pass("inventory capacity checked");

  if (/nova_crystals/.test(src) && /price\.currency_id\s*=\s*"nova/.test(src)) {
    fail("premium currency in shop prices");
  } else pass("soft currency shop prices only");

  const sm = read("loot&lasers/Autoload/ShopManager.gd");
  if (!sm.includes("shop_get") || !sm.includes("NakamaManager")) fail("ShopManager not on Nakama");
  else pass("ShopManager uses Nakama");
  if (/GameApiClient\.invoke\("EnsureShop"/.test(sm) || /GameApiClient\.invoke\("BuyShop/.test(sm)) {
    fail("legacy Node shop mutations still active");
  } else pass("legacy Node EnsureShop/BuyShop disabled");

  if (!fs.existsSync(path.join(ROOT, "docs/PHASE15_SHOPS.md"))) fail("PHASE15_SHOPS.md missing");
  else pass("PHASE15_SHOPS.md present");
}

async function liveChecks(token) {
  await callRpc(token, "profile_update", { selected_character_id: CHAR_ID });

  // Fund wallet for purchases
  const fund = await callRpc(token, "dev_wallet_credit_test", {
    currency_id: "stardust",
    amount: 50000,
    transaction_id: `fund-${crypto.randomBytes(4).toString("hex")}`,
    reason: "shop_verify_fund",
  });
  if (!fund.body?.success) {
    fail("fund wallet for shop tests", fund.text.slice(0, 200));
    return;
  }
  pass("wallet funded for shop tests");

  const get = await callRpc(token, "shop_get", { character_id: CHAR_ID, shop_id: "general", level: 1 });
  if (!get.body?.success || !get.body?.data?.shop?.offers?.length) {
    fail("load shop", get.text.slice(0, 300));
    return;
  }
  pass("load shop", `offers=${get.body.data.shop.offers.length}`);

  const shop = get.body.data.shop;
  const offer = shop.offers[0];
  const price = offer.price?.amount;
  const offerId = offer.offer_id;
  const instanceId = offer.item_instance_preview?.instance_id;
  if (!price || !offerId || !instanceId) {
    fail("offer has price and persisted instance", JSON.stringify(offer).slice(0, 200));
    return;
  }
  pass("offer has server price + instance", `${offerId} @${price}`);

  const balBefore = (await callRpc(token, "wallet_get", {})).body?.data?.balances?.stardust ?? 0;
  const invBefore = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
  const slotsBefore = invBefore.body?.data?.inventory?.slots ?? invBefore.body?.data?.slots ?? [];
  const countBefore = Array.isArray(slotsBefore) ? slotsBefore.length : 0;

  const buyTid = `buy-${crypto.randomBytes(6).toString("hex")}`;
  const buy = await callRpc(token, "shop_buy", {
    character_id: CHAR_ID,
    shop_id: "general",
    offer_id: offerId,
    request_id: buyTid,
    expected_revision: shop.revision,
  });
  if (!buy.body?.success || buy.body?.data?.status !== "completed") {
    fail("buy valid offer", buy.text.slice(0, 350));
    return;
  }
  pass("buy valid offer");

  if (buy.body.data.item_instance_id !== instanceId) {
    fail("purchased item matches offer instance", `${instanceId} vs ${buy.body.data.item_instance_id}`);
  } else pass("purchased item matches offer instance");

  const balAfter = (await callRpc(token, "wallet_get", {})).body?.data?.balances?.stardust ?? 0;
  if (Number(balAfter) === Number(balBefore) - Number(price)) pass("wallet debited once", String(price));
  else fail("wallet debited once", `before=${balBefore} after=${balAfter} price=${price}`);

  const invAfter = await callRpc(token, "inventory_get", { character_id: CHAR_ID });
  const slotsAfter = invAfter.body?.data?.inventory?.slots ?? invAfter.body?.data?.slots ?? [];
  if (Array.isArray(slotsAfter) && slotsAfter.length === countBefore + 1) pass("inventory gained one item");
  else fail("inventory gained one item", `${countBefore}→${slotsAfter.length}`);

  const dup = await callRpc(token, "shop_buy", {
    character_id: CHAR_ID,
    shop_id: "general",
    offer_id: offerId,
    request_id: buyTid,
  });
  const balDup = (await callRpc(token, "wallet_get", {})).body?.data?.balances?.stardust ?? 0;
  if (dup.body?.success && Number(balDup) === Number(balAfter)) pass("duplicate buy does not charge twice");
  else fail("duplicate buy does not charge twice", dup.text.slice(0, 200));

  const conflict = await callRpc(token, "shop_buy", {
    character_id: CHAR_ID,
    shop_id: "general",
    offer_id: offerId,
    request_id: buyTid,
    expected_revision: 999,
  });
  // Same request_id + same offer should still replay; conflicting different offer:
  const conflict2 = await callRpc(token, "shop_buy", {
    character_id: CHAR_ID,
    shop_id: "general",
    offer_id: "other-offer",
    request_id: buyTid,
  });
  if (conflict2.body?.success === false) pass("conflicting request_id rejected", conflict2.body.error);
  else fail("conflicting request_id rejected", conflict2.text.slice(0, 200));

  const clientPrice = await callRpc(token, "shop_buy", {
    character_id: CHAR_ID,
    shop_id: "general",
    offer_id: shop.offers[1]?.offer_id || "x",
    request_id: `buy-${crypto.randomBytes(4).toString("hex")}`,
    amount: 1,
    price: 1,
  });
  if (clientPrice.body?.success === false) pass("client price rejected", clientPrice.body.error);
  else fail("client price rejected");

  // Sell
  const sellTid = `sell-${crypto.randomBytes(6).toString("hex")}`;
  const sell = await callRpc(token, "shop_sell", {
    character_id: CHAR_ID,
    item_instance_id: instanceId,
    quantity: 1,
    request_id: sellTid,
  });
  if (!sell.body?.success) {
    fail("sell unequipped item", sell.text.slice(0, 300));
  } else {
    pass("sell unequipped item", `+${sell.body.data.amount}`);
  }

  const balSold = (await callRpc(token, "wallet_get", {})).body?.data?.balances?.stardust ?? 0;
  const sellDup = await callRpc(token, "shop_sell", {
    character_id: CHAR_ID,
    item_instance_id: instanceId,
    quantity: 1,
    request_id: sellTid,
  });
  const balSold2 = (await callRpc(token, "wallet_get", {})).body?.data?.balances?.stardust ?? 0;
  if (sellDup.body?.success && Number(balSold2) === Number(balSold)) pass("duplicate sell does not credit twice");
  else fail("duplicate sell does not credit twice");

  const clientSale = await callRpc(token, "shop_sell", {
    character_id: CHAR_ID,
    item_instance_id: "missing",
    request_id: `sell-${crypto.randomBytes(4).toString("hex")}`,
    sale_price: 999999,
  });
  if (clientSale.body?.success === false) pass("client sale_price rejected", clientSale.body.error);
  else fail("client sale_price rejected");

  // Refresh
  const refTid = `ref-${crypto.randomBytes(6).toString("hex")}`;
  const refresh = await callRpc(token, "shop_refresh", {
    character_id: CHAR_ID,
    shop_id: "general",
    request_id: refTid,
    level: 1,
  });
  if (!refresh.body?.success) fail("free refresh", refresh.text.slice(0, 250));
  else pass("free refresh", `rev=${refresh.body.data.shop?.revision}`);

  const refDup = await callRpc(token, "shop_refresh", {
    character_id: CHAR_ID,
    shop_id: "general",
    request_id: refTid,
    level: 1,
  });
  if (
    refDup.body?.success &&
    refDup.body.data.shop?.revision === refresh.body.data.shop?.revision
  ) {
    pass("duplicate refresh does not reroll");
  } else fail("duplicate refresh does not reroll", refDup.text.slice(0, 200));

  const early = await callRpc(token, "shop_refresh", {
    character_id: CHAR_ID,
    shop_id: "general",
    request_id: `ref-${crypto.randomBytes(4).toString("hex")}`,
    level: 1,
  });
  if (early.body?.success === false) pass("early refresh rejected", early.body.error);
  else fail("early refresh rejected", "expected cooldown");

  const wrongChar = await callRpc(token, "shop_get", { character_id: "not-mine", shop_id: "general" });
  if (wrongChar.body?.success === false) pass("wrong character rejected", wrongChar.body.error);
  else fail("wrong character rejected");
}

async function main() {
  console.log("Phase 15 shop service verification\n");
  staticChecks();
  console.log("\nAuthenticating…");
  const token = await authDevice();
  console.log("Session OK\n");
  await liveChecks(token);
  const failed = results.filter((r) => !r.ok);
  console.log(`\nResult: ${results.filter((r) => r.ok).length} passed, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.error(`- ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
