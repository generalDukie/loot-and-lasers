/**
 * Unit tests for authoritative 16:9 game viewport math.
 * Run: npm run test:game-viewport
 */
import assert from "node:assert/strict";
import {
  calculateGameViewport,
  placeGameViewport,
  resolveGameViewportRect,
  clientToLogicalPoint,
  DESIGN_ASPECT,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
} from "../../src/lib/gameViewport.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function almostEqual(a, b, eps = 0.05) {
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);
}

function assertStrict169({ width, height }) {
  almostEqual(width / height, DESIGN_ASPECT, 0.001);
}

console.log("\nGame viewport tests\n");

test("1920×1080 fills exactly", () => {
  const v = calculateGameViewport(1920, 1080);
  almostEqual(v.width, 1920);
  almostEqual(v.height, 1080);
  assertStrict169(v);
});

test("3440×1440 ultrawide pillarboxes to 2560×1440", () => {
  const v = calculateGameViewport(3440, 1440);
  almostEqual(v.width, 2560);
  almostEqual(v.height, 1440);
  assertStrict169(v);
});

test("1280×1024 letterboxes to 1280×720", () => {
  const v = calculateGameViewport(1280, 1024);
  almostEqual(v.width, 1280);
  almostEqual(v.height, 720);
  assertStrict169(v);
});

test("3840×2160 4K fills exactly", () => {
  const v = calculateGameViewport(3840, 2160);
  almostEqual(v.width, 3840);
  almostEqual(v.height, 2160);
  assertStrict169(v);
});

test("2560×1080 ultrawide uses full height", () => {
  const v = calculateGameViewport(2560, 1080);
  almostEqual(v.height, 1080);
  almostEqual(v.width, 1920);
  assertStrict169(v);
});

test("zero / negative inputs yield empty viewport", () => {
  assert.deepEqual(calculateGameViewport(0, 1080), { width: 0, height: 0 });
  assert.deepEqual(calculateGameViewport(1920, -1), { width: 0, height: 0 });
});

test("placeGameViewport centers by default", () => {
  const size = calculateGameViewport(3440, 1440);
  const placed = placeGameViewport(3440, 1440, size, "center");
  almostEqual(placed.left, (3440 - 2560) / 2);
  almostEqual(placed.top, 0);
});

test("placeGameViewport left anchor", () => {
  const size = { width: 1920, height: 1080 };
  const placed = placeGameViewport(3440, 1440, size, "left");
  almostEqual(placed.left, 0);
});

test("resolveGameViewportRect auto matches calculate + place", () => {
  const r = resolveGameViewportRect(3440, 1440, "auto", "center");
  almostEqual(r.width, 2560);
  almostEqual(r.height, 1440);
  almostEqual(r.left, 440);
  almostEqual(r.top, 0);
});

test("clientToLogicalPoint divides by scale", () => {
  const rect = { left: 100, top: 50, width: 1920, height: 1080 };
  const p = clientToLogicalPoint(100 + 960, 50 + 540, rect, 1);
  almostEqual(p.x, 960);
  almostEqual(p.y, 540);
  const p2 = clientToLogicalPoint(100 + 960, 50 + 540, rect, 2);
  almostEqual(p2.x, 480);
  almostEqual(p2.y, 270);
});

test("design constants are 1920×1080", () => {
  assert.equal(DESIGN_WIDTH, 1920);
  assert.equal(DESIGN_HEIGHT, 1080);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
