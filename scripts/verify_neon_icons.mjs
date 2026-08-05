/**
 * Verify chrome/title neon icon migration (not all content emoji).
 * Run: node scripts/verify_neon_icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "loot&lasers");

let failed = 0;
function pass(m) {
  console.log(`  ✓ ${m}`);
}
function fail(m, d = "") {
  failed += 1;
  console.error(`  ✗ ${m}${d ? " — " + d : ""}`);
}

console.log("\nNeon icon verification (chrome)\n");

const REQUIRED = [
  "Assets/Icons/nav/bell.svg",
  "Assets/Icons/nav/settings.svg",
  "Assets/Icons/nav/x.svg",
  "Assets/Icons/nav/check-check.svg",
  "Assets/Icons/nav/calendar.svg",
  "Assets/Icons/nav/swords.svg",
  "Assets/Icons/nav/triangle-alert.svg",
  "Scripts/UI/UiIcon.gd",
];
for (const rel of REQUIRED) {
  if (fs.existsSync(path.join(ROOT, rel))) pass(`asset ${rel}`);
  else fail(`asset ${rel}`);
}

const shell = fs.readFileSync(path.join(ROOT, "Scenes/Main/game_shell.gd"), "utf8");
if (!shell.includes("🔔") && !shell.includes("⚙")) pass("shell chrome emoji removed");
else fail("shell chrome emoji removed");
if (shell.includes("UiIcon.set_button_icon") && shell.includes("bell")) pass("shell notification uses UiIcon");
else fail("shell notification uses UiIcon");

const hub = fs.readFileSync(path.join(ROOT, "Scenes/UI/hub.gd"), "utf8");
if (hub.includes('_dock_tile("orbit"') || hub.includes("_dock_tile(\"orbit\"")) pass("hub dock neon ids");
else fail("hub dock neon ids");
if (!/_dock_(?:tile|split)\(\s*"[^A-Za-z0-9_-]/.test(hub)) pass("hub dock args alphanumeric");
else fail("hub dock args alphanumeric");

const titleFiles = {
  "Scenes/UI/shop.gd": "shopping-bag",
  "Scenes/UI/mining.gd": "pickaxe",
  "Scenes/UI/arena.gd": "swords",
  "Scenes/UI/settings.gd": "settings",
  "Scenes/UI/notifications.gd": "bell",
  "Scenes/UI/casino.gd": "dice-5",
  "Scenes/UI/progress.gd": "trophy",
};
for (const [rel, icon] of Object.entries(titleFiles)) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (src.includes(`make_title_row("${icon}"`)) pass(`${rel} title ${icon}`);
  else fail(`${rel} title ${icon}`);
  // Ban classic title assignment with leading emoji
  if (/title\.text\s*=\s*"[🔔⚙🛒⛏⚔👑🏆💬💎🗺⚄]/.test(src)) fail(`${rel} still assigns emoji title`);
}

console.log(`\n${failed} failure(s)\n`);
process.exit(failed ? 1 : 0);
