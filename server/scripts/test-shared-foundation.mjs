/**
 * Layer 2 — shared gameplay foundation tests (in-process, isolated DB).
 * Run with: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-shared-foundation.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "loot-shared-foundation-"));
process.env.DB_PATH = path.join(tempDir, "foundation.db");

// ── Formula parity (no DB) ───────────────────────────────────
const libStardust = await import("../../src/lib/stardustEconomy.js");
const sharedStardust = await import("../src/shared/stardustEconomy.js");
const libItems = await import("../../src/lib/itemGeneration.js");
const sharedItems = await import("../src/shared/itemGeneration.js");
const { scaleXpReward: webScaleXp, getMissionXpPerFuel } = await import(
  "../../src/lib/gameData.js"
);
const { scaleXpReward: serverScaleXp, expForLevel } = await import(
  "../src/shared/rewards.js"
);
const {
  COLLECTION_BASE_TOTAL,
  getCollectionPercentage,
  applyXpBonus,
} = await import("../src/shared/collectionBonus.js");
const {
  SPECIES_COUNT,
  ARTIFACT_COUNT,
  RELIC_COUNT,
} = await import("../../src/lib/collectibles.js");
const { DUNGEON_PLANETS } = await import("../../src/lib/dungeonData.js");
const {
  assertCharacterCreateShape,
  readPersistedSheetInputs,
  classBaseStats,
  REQUIRED_CHARACTER_CREATE_KEYS,
} = await import("../src/shared/characterSheet.js");

assert.deepEqual(
  Object.keys(sharedStardust).sort(),
  Object.keys(libStardust).sort(),
  "stardustEconomy exports match src/lib",
);
assert.equal(
  sharedStardust.AttributePurchaseCost(3),
  libStardust.AttributePurchaseCost(3),
);
assert.equal(
  sharedStardust.StardustPerFuel(12),
  libStardust.StardustPerFuel(12),
);

assert.deepEqual(
  Object.keys(sharedItems).sort(),
  Object.keys(libItems).sort(),
  "itemGeneration exports match src/lib",
);
assert.equal(
  sharedItems.BaseGearStatBudget(10),
  libItems.BaseGearStatBudget(10),
);

assert.equal(
  COLLECTION_BASE_TOTAL,
  SPECIES_COUNT + ARTIFACT_COUNT + RELIC_COUNT + DUNGEON_PLANETS.length,
);
assert.equal(COLLECTION_BASE_TOTAL, 640);

for (const level of [1, 5, 20, 50]) {
  assert.equal(
    webScaleXp(100, level),
    serverScaleXp(100, level),
    `scaleXpReward parity at level ${level}`,
  );
}
assert.ok(expForLevel(1) > 0);
assert.ok(getMissionXpPerFuel(10) > getMissionXpPerFuel(1));

assert.equal(applyXpBonus(100, 10), 110);
assert.equal(
  getCollectionPercentage(
    {
      discovered_species: [1],
      collected_artifacts: [],
      collected_relics: [],
      discovered_gear: [],
      dungeon_planet: 1,
    },
    0,
  ),
  Math.round((1 / 640) * 1000) / 10,
);

const base = classBaseStats("Vanguard");
assert.ok(base && typeof base.strength === "number");
assert.ok(REQUIRED_CHARACTER_CREATE_KEYS.includes("equipped_items"));

assert.throws(
  () => assertCharacterCreateShape({ name: "X" }),
  (err) => err?.status === 400,
);

// ── Persistence / ownership (isolated DB) ────────────────────
const { entities } = await import("../src/entities.js");
const { sanitizeCreatePayload } = await import("../src/entityAccess.js");
const {
  GameplayContextCodes,
  resolveSelectedCharacter,
} = await import("../src/gameplayContext.js");
const { BuyAttribute } = await import("../src/functions/economy.js");

const account = {
  id: "foundation-user-1",
  email: "foundation@example.com",
  role: "user",
  active_character_id: "",
};

const createdPayload = sanitizeCreatePayload(account, "Character", {
  name: "Foundation",
  race: "Zyrathi",
  class: "Vanguard",
  nova_crystals: 999999,
  stats: { strength: 99 },
});
assertCharacterCreateShape(createdPayload);
assert.equal(createdPayload.nova_crystals, 0);
assert.equal(createdPayload.stardust, 0);
assert.equal(createdPayload.level, 1);
assert.deepEqual(createdPayload.stats, classBaseStats("Vanguard"));

const { applyCharacterCreationStartingGrant, getBalances, STARTING_NOVA_DISPLAY, STARTING_STARDUST } =
  await import("../src/shared/currencyService.js");

const character = entities.Character.create(createdPayload);
const granted = applyCharacterCreationStartingGrant(account, character);
assert.equal(granted.balances.nova_crystals, STARTING_NOVA_DISPLAY);
assert.equal(granted.balances.stardust, STARTING_STARDUST);
assert.equal(granted.balances.nova_crystals, 500);
assert.equal(granted.character.nova_crystals, 1000); // half-units
assert.equal(granted.character.stardust, 0);

// Second character on same account also gets 500 Nova / 0 Stardust
// (build payload without slot-gate; grant path is what we verify here)
const payload2 = {
  ...createdPayload,
  name: "FoundationTwo",
  created_by_id: account.id,
  created_by: account.email,
  nova_crystals: 0,
  stardust: 0,
};
const character2 = entities.Character.create(payload2);
const granted2 = applyCharacterCreationStartingGrant(account, character2);
assert.equal(granted2.balances.nova_crystals, 500);
assert.equal(granted2.balances.stardust, 0);
assert.notEqual(character.id, character2.id);

// Retry grant is idempotent — no double Nova
const replay = applyCharacterCreationStartingGrant(account, granted.character);
assert.equal(replay.replay, true);
assert.equal(getBalances(entities.Character.get(character.id)).nova_crystals, 500);

account.active_character_id = character.id;

const selected = resolveSelectedCharacter(account);
assert.equal(selected.id, character.id);

const sheet = readPersistedSheetInputs(selected);
assert.equal(sheet.class, "Vanguard");
assert.equal(sheet.level, 1);

entities.Character.update(character.id, { stardust: 50_000 });
account.active_character_id = character.id;

const buy = await BuyAttribute(account, { stat: "strength" });
assert.equal(buy.status, 200, JSON.stringify(buy.body));
assert.ok(buy.body?.character || buy.body?.patch);
const afterBuy = entities.Character.get(character.id);
assert.ok((afterBuy.stats?.strength || 0) > (createdPayload.stats.strength || 0));
assert.ok((afterBuy.stardust || 0) < 50_000);

const raw = entities.Character.get(character.id);
const reloaded = entities.Character.get(raw.id);
assert.equal(reloaded.experience, raw.experience);
assert.equal(reloaded.stats.strength, raw.stats.strength);
assert.equal(reloaded.nova_crystals, raw.nova_crystals);

assert.equal(
  resolveSelectedCharacter(
    { id: account.id, email: account.email, role: "user" },
    { required: false },
  ),
  null,
);
assert.throws(
  () =>
    resolveSelectedCharacter({
      id: account.id,
      email: account.email,
      role: "user",
    }),
  (err) => err?.code === GameplayContextCodes.NO_SELECTED_CHARACTER,
);

console.log("PASS shared foundation");
try {
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch {
  // Windows may keep the SQLite handle open briefly; temp dir is disposable.
}
process.exit(0);
