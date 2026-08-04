/**
 * Restoration 12A — Shop architecture verification (static).
 * Live Nakama Phase 15 shop RPCs are superseded; Node EnsureShop is authoritative.
 * Unit coverage: npm run test:shops
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

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

function staticChecks() {
  const formulas = read("server/src/shared/economyFormulas.js");
  for (const sym of [
    "generateSimpleShopStock",
    "generateSimpleHotDeal",
    "normalizeShopMeta",
    "getShopWindow",
    "rollHaggle",
    "SHOP_REFRESH_COST",
    "SHOP_GEAR_RARITY_WEIGHTS",
  ]) {
    if (!formulas.includes(sym)) fail(`economyFormulas has ${sym}`);
    else pass(`economyFormulas has ${sym}`);
  }

  const svc = read("server/src/shared/shopService.js");
  for (const sym of ["serializeShopPresentation", "serializeShopVendors", "offerPricing"]) {
    if (!svc.includes(sym)) fail(`shopService has ${sym}`);
    else pass(`shopService has ${sym}`);
  }

  const econ = read("server/src/functions/economy.js");
  for (const fn of ["EnsureShop", "RefreshShop", "BuyShopGear", "BuyShopConsumable"]) {
    if (!econ.includes(`export async function ${fn}`)) fail(`${fn} exported`);
    else pass(`${fn} exported`);
  }
  if (!econ.includes("serializeShopPresentation")) fail("EnsureShop presentation wired");
  else pass("EnsureShop presentation wired");

  const sm = read("loot&lasers/Autoload/ShopManager.gd");
  if (!/GameApiClient\.invoke\("EnsureShop"/.test(sm)) fail("ShopManager EnsureShop");
  else pass("ShopManager uses Node EnsureShop");
  if (!/GameApiClient\.invoke\("RefreshShop"/.test(sm)) fail("ShopManager RefreshShop");
  else pass("ShopManager uses Node RefreshShop");
  if (!/GameApiClient\.invoke\("BuyShopGear"/.test(sm)) fail("ShopManager BuyShopGear");
  else pass("ShopManager uses Node BuyShopGear");
  if (!sm.includes("request_id") || !sm.includes("_new_request_id")) {
    fail("ShopManager purchase idempotency request_id");
  } else pass("ShopManager sends purchase request_id");
  if (sm.includes('invoke_rpc("shop_get"')) fail("ShopManager still on Nakama shop_get");
  else pass("ShopManager left Nakama shop_get");

  const econBuy = read("server/src/functions/economy.js");
  if (!econBuy.includes("buy_shop_gear") || !econBuy.includes("saveWalletOperation")) {
    fail("BuyShopGear wallet_operations idempotency");
  } else pass("BuyShopGear wallet_operations idempotency");
  if (!econBuy.includes("assertShopPurchaseClientSafe")) fail("BuyShop price tamper guard");
  else pass("BuyShop price tamper guard");
  if (!econBuy.includes("SHOP_STOCK_EXPIRED")) fail("BuyShop expired stock guard");
  else pass("BuyShop expired stock guard");

  if (!fs.existsSync(path.join(ROOT, "docs/PHASE_SHOPS_12A.md"))) fail("PHASE_SHOPS_12A.md missing");
  else pass("PHASE_SHOPS_12A.md present");
  if (!fs.existsSync(path.join(ROOT, "docs/PHASE_SHOPS_12B.md"))) fail("PHASE_SHOPS_12B.md missing");
  else pass("PHASE_SHOPS_12B.md present");
  if (!fs.existsSync(path.join(ROOT, "docs/PHASE_SHOPS_12C.md"))) fail("PHASE_SHOPS_12C.md missing");
  else pass("PHASE_SHOPS_12C.md present");

  // Legacy Nakama module may remain on disk but must not be Godot's live path.
  if (fs.existsSync(path.join(ROOT, "modules/shops.lua"))) {
    pass("legacy shops.lua retained (not Godot authority)");
  }

  const legacy = read("src/lib/gameData.js");
  if (!legacy.includes("obsoleteShopClient") || !legacy.includes("generateShopInventory")) {
    fail("legacy web shop generators not isolated");
  } else pass("legacy web shop generators isolated (throw stubs)");

  if (!read("modules/shops.lua").includes("SUPERSEDED")) {
    fail("shops.lua not marked superseded");
  } else pass("Nakama shops.lua marked superseded");

  if (!read("server/src/shared/shopService.js").includes("SHOP_AUTHORITY_MAP")) {
    fail("SHOP_AUTHORITY_MAP missing");
  } else pass("SHOP_AUTHORITY_MAP present");
}

function main() {
  console.log("Restoration 12C shop verification (static)\n");
  staticChecks();
  const failed = results.filter((r) => !r.ok);
  console.log("\nResult: %s passed, %s failed", results.filter((r) => r.ok).length, failed.length);
  console.log("Unit coverage: npm run test:shops && npm run test:shop-purchases && npm run test:shop-stress");
  if (failed.length) {
    for (const f of failed) console.error(`- ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  process.exit(0);
}

main();
