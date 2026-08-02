/**
 * Automated tests for ResolutionRules 16:9 display math (2560×1440 design).
 * Run: node loot&lasers/scripts/test-resolution-rules.mjs
 */
import assert from "node:assert/strict";

const DESIGN_SIZE = { x: 2560, y: 1440 };
const DESIGN_ASPECT = 16 / 9;

function largest16_9Rect(available) {
  if (available.x <= 0 || available.y <= 0) {
    return { position: { x: 0, y: 0 }, size: { x: 0, y: 0 } };
  }
  const availableAspect = available.x / available.y;
  let gameSize;
  if (availableAspect > DESIGN_ASPECT) {
    gameSize = { y: available.y, x: available.y * DESIGN_ASPECT };
  } else {
    gameSize = { x: available.x, y: available.x / DESIGN_ASPECT };
  }
  return {
    position: {
      x: (available.x - gameSize.x) * 0.5,
      y: (available.y - gameSize.y) * 0.5,
    },
    size: gameSize,
  };
}

function uiScale(gameWidth) {
  return gameWidth / DESIGN_SIZE.x;
}

function almostEqual(a, b, eps = 0.5) {
  assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);
}

const cases = [
  { name: "1280x720 fills", available: { x: 1280, y: 720 }, expect: { x: 1280, y: 720 } },
  { name: "1920x1080 fills", available: { x: 1920, y: 1080 }, expect: { x: 1920, y: 1080 } },
  { name: "2560x1440 native", available: { x: 2560, y: 1440 }, expect: { x: 2560, y: 1440 } },
  { name: "3840x2160 fills 4K", available: { x: 3840, y: 2160 }, expect: { x: 3840, y: 2160 } },
  { name: "3440x1440 ultrawide pillarbox", available: { x: 3440, y: 1440 }, expect: { x: 2560, y: 1440 } },
  { name: "5120x1440 super ultrawide", available: { x: 5120, y: 1440 }, expect: { x: 2560, y: 1440 } },
  { name: "1080x1920 tall letterbox", available: { x: 1080, y: 1920 }, expect: { x: 1080, y: 607.5 } },
];

let failed = 0;
for (const c of cases) {
  try {
    const rect = largest16_9Rect(c.available);
    almostEqual(rect.size.x, c.expect.x);
    almostEqual(rect.size.y, c.expect.y);
    almostEqual(rect.position.x * 2 + rect.size.x, c.available.x);
    almostEqual(rect.position.y * 2 + rect.size.y, c.available.y);
    almostEqual(rect.size.x / rect.size.y, DESIGN_ASPECT, 0.001);
    console.log(`ok  ${c.name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${c.name}: ${e.message}`);
  }
}

almostEqual(uiScale(2560), 1);
almostEqual(uiScale(1920), 0.75);
almostEqual(uiScale(3840), 1.5);
console.log("ok  ui_scale factors");

const from1080 = DESIGN_SIZE.x / 1920;
assert.equal(Math.round(12 * from1080), 16);
assert.equal(Math.round(18 * from1080), 24);
assert.equal(Math.round(24 * from1080), 32);
console.log("ok  1080→1440 px conversion table");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll resolution tests passed.");
