/**
 * Focused no-magic-number audit for locked Phase 0–5 live gameplay JS.
 *
 * Flags domain-looking numeric literals in executable code. Does not flag:
 *   - 0 / 1 / -1 structural values
 *   - array indexes `foo[0]`
 *   - named const / export const definitions and their freeze/object tables
 *   - strings / comments
 *   - lines marked `magic-number-ok:`
 *
 * Tests and later-phase product files are out of scope. This is not ESLint
 * `no-magic-numbers` (too noisy for indexes, counters, and test fixtures).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_FILES = [
  "src/lib/productionMath/constants.js",
  "src/lib/productionMath/rounding.js",
  "src/lib/productionMath/progression.js",
  "src/lib/productionMath/economy.js",
  "src/lib/productionMath/gear.js",
  "src/lib/productionMath/combatStats.js",
  "src/lib/productionMath/derivedStatCaps.js",
  "src/lib/productionMath/attributes.js",
  "src/lib/productionMath/pve.js",
  "src/lib/dungeonArchetypeSchedule.js",
  "src/lib/dungeonEngine.js",
  "src/lib/dungeonBadges.js",
  "src/lib/dungeonSkipRequest.js",
  "src/lib/dungeonClientState.js",
  "src/lib/companyClientState.js",
  "server/src/shared/dungeonService.js",
  "src/lib/productionMath/companies.js",
  "server/src/shared/companyService.js",
  "server/src/functions/companies.js",
  "src/lib/productionMath/gearQuality.js",
  "src/lib/gearIntrinsicQuality.js",
  "src/lib/gearPricingQuality.js",
  "src/lib/blackMarket.js",
  "server/src/shared/shopService.js",
  "server/src/shared/missionRewards.js",
  "src/lib/stimActivation.js",
  "src/lib/missionDuration.js",
  "src/lib/missionCombat.js",
  "server/src/shared/missionRewards.js",
  "server/src/shared/miningService.js",
  "server/src/functions/economy.js",
  "src/lib/combatMath.js",
  "src/lib/classPassives.js",
  "src/lib/arenaEngine.js",
  "src/lib/itemGeneration.js",
  "src/lib/characterStats.js",
  "src/lib/statEngine.js",
];

const STRUCTURAL = new Set(["0", "1", "-1"]);
/** Protocol / transport codes — not gameplay rules. */
const HTTP_STATUS = new Set([
  "200", "201", "204",
  "400", "401", "403", "404", "409", "410", "422", "429",
  "500", "502", "503",
]);
const NUMBER_RE = /(?<![\w.])[-+]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][-+]?\d+)?(?![\w.])/g;
const NAMED_CONST_START = /^\s*(export\s+)?const\s+[A-Z][A-Z0-9_]*\s*=/;

function isRegexStart(src, i) {
  let k = i - 1;
  while (k >= 0 && /[ \t]/.test(src[k])) k -= 1;
  if (k < 0) return true;
  return "({[=:,!&|?;".includes(src[k]) || src[k] === "\n";
}

function stripCommentsAndStrings(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      const line = end === -1 ? src.slice(i) : src.slice(i, end);
      out += line.includes("magic-number-ok") ? line : " ".repeat(line.length);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const close = end === -1 ? src.length : end + 2;
      out += src.slice(i, close).replace(/[^\n]/g, " ");
      i = close;
      continue;
    }
    if (c === "'" || c === "\"" || c === "`") {
      const q = c;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === q) {
          j += 1;
          break;
        }
        j += 1;
      }
      out += src.slice(i, j).replace(/[^\n]/g, " ");
      i = j;
      continue;
    }
    if (c === "/" && n !== "/" && n !== "*" && isRegexStart(src, i)) {
      let j = i + 1;
      while (j < src.length && src[j] !== "\n") {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "/") {
          j += 1;
          while (j < src.length && /[a-z]/i.test(src[j])) j += 1;
          break;
        }
        j += 1;
      }
      out += src.slice(i, j).replace(/[^\n]/g, " ");
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function netDepth(line) {
  let depth = 0;
  for (const ch of line) {
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
  }
  return depth;
}

function isArrayIndexUse(line, index) {
  let k = index - 1;
  while (k >= 0 && /\s/.test(line[k])) k -= 1;
  return line[k] === "[";
}

function scanFile(relPath) {
  const abs = path.join(ROOT, relPath);
  const src = fs.readFileSync(abs, "utf8");
  const cleaned = stripCommentsAndStrings(src);
  const lines = src.split(/\r?\n/);
  const cleanedLines = cleaned.split(/\r?\n/);
  const hits = [];
  let namedBlockDepth = 0;

  for (let li = 0; li < cleanedLines.length; li++) {
    const raw = lines[li] || "";
    const line = cleanedLines[li] || "";
    if (NAMED_CONST_START.test(raw)) {
      namedBlockDepth = Math.max(0, namedBlockDepth) + netDepth(line);
      if (namedBlockDepth <= 0) namedBlockDepth = 0;
      continue;
    }
    if (namedBlockDepth > 0) {
      namedBlockDepth += netDepth(line);
      if (namedBlockDepth <= 0) namedBlockDepth = 0;
      continue;
    }
    if (raw.includes("magic-number-ok")) continue;

    NUMBER_RE.lastIndex = 0;
    let match;
    while ((match = NUMBER_RE.exec(line))) {
      const token = match[0];
      if (STRUCTURAL.has(token)) continue;
      if (HTTP_STATUS.has(token)) continue;
      if (isArrayIndexUse(line, match.index)) continue;
      hits.push({
        file: relPath,
        line: li + 1,
        token,
        text: raw.trim(),
      });
    }
  }
  return hits;
}

const allHits = SCAN_FILES.flatMap(scanFile);
for (const hit of allHits) {
  console.error(`${hit.file}:${hit.line}  ${hit.token}  ${hit.text}`);
}

if (allHits.length) {
  console.error(`\nno-magic-number audit: ${allHits.length} suspicious literal(s) in live Phase 0–5 files.`);
  process.exit(1);
}

console.log(`no-magic-number audit: ${SCAN_FILES.length} files scanned, 0 suspicious literals.`);
