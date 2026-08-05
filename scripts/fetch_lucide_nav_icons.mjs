/**
 * Fetch Lucide-static SVGs into Assets/Icons/nav with white strokes (match existing pack).
 * Run: node scripts/fetch_lucide_nav_icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "loot&lasers", "Assets", "Icons", "nav");

const IDS = [
  "bell",
  "settings",
  "x",
  "check-check",
  "calendar",
  "lock",
  "trash-2",
  "swords",
  "gift",
  "book-open",
  "volume-2",
  "music",
  "vibrate",
  "rotate-ccw",
  "flame",
  "shield",
  "target",
  "skull",
  "star",
  "alert-triangle",
  "triangle-alert",
  "alert-circle",
  "octagon-alert",
  "package",
  "sparkles",
  "clock",
  "map",
  "scroll-text",
  "antenna",
  "radio",
  "sofa",
  "circle-dollar-sign",
  "dices",
  "landmark",
  "inbox",
  "send",
  "wrench",
  "ban",
  "circle-check",
  "circle-x",
  "loader",
  "sword",
  "axe",
  "hammer",
  "heart",
  "brain",
  "wind",
  "clover",
  "bot",
  "drama",
  "sparkle",
  "telescope",
  "satellite",
  "earth",
  "building-2",
  "hourglass",
  "badge-check",
  "undo-2",
  "check",
  "plus",
  "minus",
  "eye",
  "eye-off",
  "key-round",
  "log-out",
  "refresh-cw",
  "play",
  "pause",
  "skip-forward",
];

fs.mkdirSync(OUT, { recursive: true });

let ok = 0;
let fail = 0;
for (const id of IDS) {
  const existing = path.join(OUT, `${id}.svg`);
  // Don't overwrite the hand-curated existing nav set unless missing.
  if (fs.existsSync(existing) && ["user","beer","orbit","rocket","users","message-square","mail","zap","trophy","crown","shopping-bag","dice-5","pickaxe"].includes(id)) {
    console.log(`skip existing ${id}`);
    continue;
  }
  const url = `https://unpkg.com/lucide-static@0.469.0/icons/${id}.svg`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let svg = await res.text();
    svg = svg.replaceAll("currentColor", "#ffffff");
    if (!svg.includes('stroke="#ffffff"') && svg.includes("<svg")) {
      svg = svg.replace("<svg", '<svg stroke="#ffffff"');
    }
    // Match existing pack license comment style if missing
    if (!svg.includes("@license lucide-static")) {
      svg = `<!-- @license lucide-static v0.469.0 - ISC -->\n${svg}`;
    }
    fs.writeFileSync(existing, svg, "utf8");
    console.log(`ok ${id}`);
    ok += 1;
  } catch (err) {
    console.error(`FAIL ${id}: ${err.message}`);
    fail += 1;
  }
}
console.log(`\n${ok} written, ${fail} failed`);
process.exit(fail ? 1 : 0);
