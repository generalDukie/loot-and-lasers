/**
 * One-time 1920→2560 design conversion: multiply authored UI sizes by 4/3.
 * Run: node "loot&lasers/scripts/scale_design_to_1440.mjs"
 *
 * After success, set ResolutionManager.USE_LEGACY_CONTENT_LAYOUT = false
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCALE = 4 / 3;
const SKIP = new Set([
  "ResolutionRules.gd",
  "ResolutionManager.gd",
  "scale_design_to_1440.py",
  "scale_design_to_1440.mjs",
]);

function scaleInt(n) {
  if (Math.abs(n) <= 4) return n;
  const s = Math.round(n * SCALE);
  return n > 0 ? Math.max(1, s) : Math.min(-1, s);
}

function convert(text) {
  let out = text;
  out = out.replace(
    /add_theme_font_size_override\(\s*["']font_size["']\s*,\s*(\d+)\s*\)/g,
    (_, n) => `add_theme_font_size_override("font_size", ${scaleInt(+n)})`
  );
  out = out.replace(/\.font_size\s*=\s*(\d+)/g, (_, n) => `.font_size = ${scaleInt(+n)}`);
  out = out.replace(
    /custom_minimum_size\.(x|y)\s*=\s*(\d+)/g,
    (_, axis, n) => `custom_minimum_size.${axis} = ${scaleInt(+n)}`
  );
  out = out.replace(
    /custom_minimum_size\s*=\s*Vector2(i?)\((\d+)\s*,\s*(\d+)\)/g,
    (_, i, a, b) => `custom_minimum_size = Vector2${i}(${scaleInt(+a)}, ${scaleInt(+b)})`
  );
  out = out.replace(/offset_(top|bottom|left|right)\s*=\s*(-?\d+)/g, (m, axis, n) => {
    n = +n;
    if (Math.abs(n) < 6) return m;
    return `offset_${axis} = ${scaleInt(n)}`;
  });
  return out;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === ".godot" || ent.name === "scripts") continue;
      walk(p, out);
    } else if (ent.name.endsWith(".gd")) {
      out.push(p);
    }
  }
  return out;
}

const changed = [];
for (const file of walk(ROOT)) {
  const name = path.basename(file);
  if (SKIP.has(name)) continue;
  const original = fs.readFileSync(file, "utf8");
  const updated = convert(original);
  if (updated !== original) {
    fs.writeFileSync(file, updated);
    changed.push(path.relative(ROOT, file));
  }
}

console.log(`updated ${changed.length} files`);
for (const f of changed) console.log(f);
console.log("\nNext: set ResolutionManager.USE_LEGACY_CONTENT_LAYOUT = false");
