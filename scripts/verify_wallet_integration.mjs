/**
 * Static wallet integration gate.
 * Runtime bridge/idempotency behavior is covered by the focused server test.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function requireFile(rel) {
  if (!fs.existsSync(path.join(ROOT, rel))) failures.push(`missing ${rel}`);
}

function expect(rel, pattern, message) {
  requireFile(rel);
  if (!fs.existsSync(path.join(ROOT, rel))) return;
  if (!pattern.test(read(rel))) failures.push(`${rel}: ${message}`);
}

function reject(rel, pattern, message) {
  requireFile(rel);
  if (!fs.existsSync(path.join(ROOT, rel))) return;
  if (pattern.test(read(rel))) failures.push(`${rel}: ${message}`);
}

const project = read("loot&lasers/project.godot");
const autoloadCount = (project.match(/^CurrencyManager=/gm) || []).length;
if (autoloadCount !== 1) failures.push(`CurrencyManager autoload count is ${autoloadCount}, expected 1`);

expect(
  "loot&lasers/Autoload/CurrencyManager.gd",
  /CURRENCY_FUEL[\s\S]*CURRENCY_STARDUST[\s\S]*CURRENCY_NOVA/,
  "must normalize Fuel, Stardust, and Nova",
);
expect(
  "loot&lasers/Autoload/CurrencyManager.gd",
  /signal balances_changed[\s\S]*signal balance_changed/,
  "missing shared balance signals",
);
expect(
  "loot&lasers/Autoload/CurrencyManager.gd",
  /func reconcile_wallet[\s\S]*func apply_character_snapshot[\s\S]*func apply_authoritative_wallet/,
  "missing authoritative result/reconciliation APIs",
);
reject(
  "loot&lasers/Autoload/CurrencyManager.gd",
  /invoke_rpc\(\s*["']wallet_get/,
  "client wallet must reconcile the compatibility-authoritative Character ledger",
);

expect(
  "loot&lasers/Autoload/GameManager.gd",
  /func apply_active_character[\s\S]*CurrencyManager\.apply_character_snapshot/,
  "Character replacements must fan out through CurrencyManager",
);
expect(
  "loot&lasers/Autoload/AuthManager.gd",
  /GameManager\.clear_active_character[\s\S]*stop_node/,
  "logout/account switching must clear Character and wallet state",
);
expect(
  "loot&lasers/Autoload/RealtimeManager.gd",
  /start_node_wallet_events[\s\S]*wallet_updated[\s\S]*_reconcile_wallet_once/,
  "missing wallet realtime route/reconnect reconciliation",
);
expect(
  "loot&lasers/Autoload/AuthManager.gd",
  /start_node_wallet_events/,
  "wallet realtime must start after auth rather than waiting for Hub",
);

const activeWalletPages = [
  "loot&lasers/Scenes/Main/game_shell.gd",
  "loot&lasers/Scenes/UI/arena.gd",
  "loot&lasers/Scenes/UI/cantina.gd",
  "loot&lasers/Scenes/UI/casino.gd",
  "loot&lasers/Scenes/UI/crystal_store.gd",
  "loot&lasers/Scenes/UI/guild.gd",
  "loot&lasers/Scenes/UI/guild_wars.gd",
  "loot&lasers/Scenes/UI/inventory.gd",
  "loot&lasers/Scenes/UI/mining.gd",
  "loot&lasers/Scenes/UI/mission_run.gd",
  "loot&lasers/Scenes/UI/shop.gd",
  "loot&lasers/Scenes/UI/ship.gd",
  "loot&lasers/Scenes/UI/stats.gd",
  "loot&lasers/Scenes/UI/void.gd",
];
for (const rel of activeWalletPages) {
  if (!fs.existsSync(path.join(ROOT, rel))) continue;
  const src = read(rel);
  if (/active_character\.get\(\s*["'](?:fuel|stardust|nova_crystals)["']/.test(src)) {
    failures.push(`${rel}: active-player currency still reads GameManager directly`);
  }
}

const scenesRoot = path.join(ROOT, "loot&lasers", "Scenes");
function scanUi(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) scanUi(full);
    else if (entry.name.endsWith(".gd")) {
      const src = fs.readFileSync(full, "utf8");
      if (/active_character\[\s*["'](?:fuel|stardust|nova_crystals)["']\s*\]\s*=/.test(src)) {
        failures.push(`${path.relative(ROOT, full)}: UI directly mutates a balance`);
      }
    }
  }
}
scanUi(scenesRoot);

expect(
  "loot&lasers/Autoload/StatsManager.gd",
  /CurrencyManager\.can_afford/,
  "attribute affordability preview must use CurrencyManager",
);
reject(
  "loot&lasers/Autoload/StatsManager.gd",
  /_apply_optimistic_buy|c\["stardust"\]\s*=/,
  "attribute purchase must not optimistically mutate currency",
);

expect(
  "server/src/db.js",
  /CREATE TABLE IF NOT EXISTS wallet_operations/,
  "missing wallet operation receipts",
);
expect(
  "server/src/functions/economy.js",
  /mission_skip_nova[\s\S]*idempotent_replay/,
  "mission skip Nova debit must be idempotent",
);
expect(
  "server/src/functions/economy.js",
  /buy_fuel[\s\S]*idempotent_replay/,
  "Fuel purchase must be idempotent when request_id is supplied",
);
expect(
  "server/src/walletBridge.js",
  /OPERATION_NOT_ALLOWED/,
  "private bridge must allowlist operations",
);
expect(
  "server/src/walletBridge.js",
  /timingSafeEqual[\s\S]*LOOT_WALLET_BRIDGE_SECRET[\s\S]*BRIDGE_DISABLED/,
  "private bridge must use constant-time auth and fail closed",
);
expect(
  "server/src/walletBridge.js",
  /FUEL_PRECISION_SCALE\s*=\s*100[\s\S]*mission_start_fuel[\s\S]*Math\.round\(rawAmount \* FUEL_PRECISION_SCALE\)/,
  "mission Fuel bridge must support authoritative hundredths",
);
expect(
  "modules/lib/wallet_bridge.lua",
  /LOOT_NODE_INTERNAL_URL[\s\S]*LOOT_WALLET_BRIDGE_SECRET[\s\S]*nk\.http_request/,
  "missing trusted Nakama-to-Node bridge",
);
for (const [rel, marker] of [
  ["modules/missions.lua", /mission_start_fuel[\s\S]*mission_claim_stardust[\s\S]*mission_skip_nova/],
  ["modules/shops.lua", /shop_buy_stardust[\s\S]*shop_sell_stardust/],
  ["modules/mail.lua", /mail_reward_stardust/],
]) {
  expect(rel, marker, "required Nakama currency paths do not use the trusted bridge");
}
expect(
  "server/src/realtime.js",
  /broadcastWalletUpdated[\s\S]*sub\.user\?\.id !== accountId/,
  "wallet realtime events must be account-scoped on the existing socket",
);
expect(
  "server/scripts/test-wallet-bridge.mjs",
  /idempotent_replay[\s\S]*mission-fractional[\s\S]*balances\.fuel/,
  "wallet bridge tests must cover replay and fractional Fuel",
);

requireFile("docs/WALLET_ARCHITECTURE.md");
for (const rel of [
  "docs/BACKEND_ARCHITECTURE.md",
  "docs/NAKAMA_RPC.md",
  "docs/ROADMAP.md",
  "docs/BACKEND_VERIFICATION.md",
]) {
  expect(rel, /CurrencyManager|wallet/i, "wallet integration documentation missing");
}

if (failures.length) {
  console.error("WALLET_INTEGRATION_VERIFY_FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("WALLET_INTEGRATION_VERIFY_OK");
