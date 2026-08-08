/**
 * Persistent Cantina offer helpers.
 * Run: npm run test:cantina-offers
 */
import assert from "node:assert/strict";
import {
  CANTINA_STATES,
  canAffordAnyCantinaOffer,
  generateCantinaOfferSet,
  hasValidCantinaOffers,
  lockCantinaOffersPatch,
  normalizeCantinaOffers,
  publicCantinaPayload,
  resolveCantinaState,
  resolveLaunchableCantinaOffer,
  stampCantinaOffers,
} from "../src/shared/cantinaOffers.js";

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
    console.error(`    ${err.stack || err.message}`);
  }
}

console.log("\nCantina persistent offers\n");

const character = { level: 5, fuel: 20, highest_sector: 2, class: "Vanguard" };

test("generateCantinaOfferSet returns 3 sticky offers with art", () => {
  const offers = generateCantinaOfferSet(character);
  assert.equal(offers.length, 3);
  const ids = new Set();
  const scenes = new Set();
  for (const offer of offers) {
    assert.ok(offer.id, "offer id");
    assert.ok(offer.name);
    assert.ok(offer.duration_seconds > 0);
    assert.ok(Number.isInteger(offer.explore_scene));
    assert.match(String(offer.image_id), /^mission_explore_0[1-6]$/);
    assert.ok(offer.rewards && typeof offer.rewards === "object");
    ids.add(offer.id);
    scenes.add(offer.explore_scene);
  }
  assert.equal(ids.size, 3);
  assert.ok(scenes.size >= 1);
});

test("AVAILABLE_OFFERS when persisted set exists", () => {
  const offers = generateCantinaOfferSet(character);
  const ch = { ...character, ...stampCantinaOffers(character, offers) };
  assert.equal(resolveCantinaState(ch), CANTINA_STATES.AVAILABLE_OFFERS);
  assert.equal(hasValidCantinaOffers(ch), true);
});

test("ACTIVE_MISSION blocks generation even with leftover offers", () => {
  const offers = generateCantinaOfferSet(character);
  const ch = {
    ...character,
    ...stampCantinaOffers(character, offers),
    ...lockCantinaOffersPatch(),
    active_mission_id: "m1",
  };
  assert.equal(resolveCantinaState(ch, { status: "in_progress" }), CANTINA_STATES.ACTIVE_MISSION);
  const payload = publicCantinaPayload(ch, CANTINA_STATES.ACTIVE_MISSION, offers);
  assert.deepEqual(payload.offers, []);
});

test("COMPLETED_UNCLAIMED does not expose a new board", () => {
  const ch = { ...character, active_mission_id: "m1" };
  assert.equal(resolveCantinaState(ch, { status: "completed" }), CANTINA_STATES.COMPLETED_UNCLAIMED);
});

test("READY_FOR_NEW_OFFERS when empty or dangling lock", () => {
  assert.equal(resolveCantinaState(character), CANTINA_STATES.READY_FOR_NEW_OFFERS);
  const locked = { ...character, cantina_offers_status: "locked_active" };
  assert.equal(resolveCantinaState(locked), CANTINA_STATES.READY_FOR_NEW_OFFERS);
});

test("resolveLaunchableCantinaOffer is idempotent and rejects unknown ids", () => {
  const offers = generateCantinaOfferSet(character);
  const ch = { ...character, ...stampCantinaOffers(character, offers) };
  const first = resolveLaunchableCantinaOffer(ch, offers[1].id);
  const second = resolveLaunchableCantinaOffer(ch, offers[1].id);
  assert.equal(first.id, second.id);
  assert.equal(first.explore_scene, second.explore_scene);
  assert.equal(first.image_id, second.image_id);
  assert.throws(() => resolveLaunchableCantinaOffer(ch, "not-an-offer"), /Unknown mission offer/);
  const locked = { ...ch, ...lockCantinaOffersPatch() };
  assert.throws(() => resolveLaunchableCantinaOffer(locked, offers[1].id), /No mission offers available/);
});

test("normalize + stamp keeps assigned artwork", () => {
  const offers = generateCantinaOfferSet(character);
  const again = normalizeCantinaOffers(stampCantinaOffers(character, offers).cantina_offers);
  assert.equal(again.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(again[i].id, offers[i].id);
    assert.equal(again[i].explore_scene, offers[i].explore_scene);
    assert.equal(again[i].image_id, offers[i].image_id);
    assert.equal(again[i].name, offers[i].name);
    assert.equal(again[i].duration_seconds, offers[i].duration_seconds);
  }
});

test("low fuel still produces launchable residual offers", () => {
  const broke = { ...character, fuel: 0.5 };
  const offers = generateCantinaOfferSet(broke);
  assert.ok(offers.length >= 1);
  assert.equal(canAffordAnyCantinaOffer(broke, offers), true);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
