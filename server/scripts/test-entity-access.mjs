import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "loot-entity-access-"));
process.env.DB_PATH = path.join(tempDir, "access.db");

const { db } = await import("../src/db.js");
const { entities } = await import("../src/entities.js");
const {
  canReadDoc,
  scopeReadQuery,
} = await import("../src/entityAccess.js");
const {
  GameplayContextCodes,
  resolveSelectedCharacter,
} = await import("../src/gameplayContext.js");
const {
  apiErrorBody,
  normalizeFunctionBody,
} = await import("../src/apiResponse.js");

const accountA = { id: "account-a", email: "a@example.com", role: "user" };
const accountB = { id: "account-b", email: "b@example.com", role: "user" };
const admin = { id: "admin", email: "admin@example.com", role: "admin" };

const characterA = entities.Character.create({
  id: "character-a",
  name: "Alpha",
  created_by_id: accountA.id,
  created_by: accountA.email,
});
const characterB = entities.Character.create({
  id: "character-b",
  name: "Bravo",
  created_by_id: accountB.id,
  created_by: accountB.email,
});

function visible(user, type, query = {}) {
  const scoped = scopeReadQuery(user, type, query);
  return entities[type].filter(scoped, "-created_date", 100);
}

try {
  assert.throws(
    () => resolveSelectedCharacter(accountA),
    (err) => err?.status === 409 && err?.code === GameplayContextCodes.NO_SELECTED_CHARACTER,
  );
  const selectedA = resolveSelectedCharacter(
    { ...accountA, active_character_id: characterA.id },
  );
  assert.equal(selectedA.id, characterA.id);
  assert.throws(
    () => resolveSelectedCharacter(accountA, { explicitId: characterB.id }),
    (err) => err?.status === 403 && err?.code === GameplayContextCodes.CHARACTER_NOT_OWNED,
  );

  entities.Item.create({ id: "item-a", character_id: characterA.id });
  entities.Item.create({ id: "item-b", character_id: characterB.id });
  assert.deepEqual(visible(accountA, "Item").map((row) => row.id), ["item-a"]);
  assert.deepEqual(visible(accountB, "Item").map((row) => row.id), ["item-b"]);

  entities.AppNotification.create({ id: "notice-a", owner_id: characterA.id });
  entities.AppNotification.create({ id: "notice-b", owner_id: characterB.id });
  assert.deepEqual(
    visible(accountA, "AppNotification").map((row) => row.id),
    ["notice-a"],
  );

  entities.FriendRequest.create({
    id: "friend-a-b",
    from_character_id: characterA.id,
    to_character_id: characterB.id,
  });
  entities.FriendRequest.create({
    id: "friend-foreign",
    from_character_id: characterB.id,
    to_character_id: "character-c",
  });
  assert.deepEqual(
    visible(accountA, "FriendRequest").map((row) => row.id),
    ["friend-a-b"],
  );
  assert.equal(
    canReadDoc(accountA, "FriendRequest", entities.FriendRequest.get("friend-a-b")),
    true,
  );
  assert.equal(
    canReadDoc(accountA, "FriendRequest", entities.FriendRequest.get("friend-foreign")),
    false,
  );

  entities.PrivateConversation.create({
    id: "conversation-a-b",
    participant_ids: [characterA.id, characterB.id],
  });
  entities.PrivateConversation.create({
    id: "conversation-foreign",
    participant_ids: [characterB.id, "character-c"],
  });
  assert.deepEqual(
    visible(accountA, "PrivateConversation").map((row) => row.id),
    ["conversation-a-b"],
  );

  entities.Guild.create({ id: "guild-public", name: "Public Guild" });
  assert.deepEqual(
    visible(accountA, "Guild").map((row) => row.id),
    ["guild-public"],
  );
  assert.equal(canReadDoc(accountA, "Guild", entities.Guild.get("guild-public")), true);

  entities.ModerationConfig.create({ id: "moderation-private", singleton: true });
  assert.throws(
    () => scopeReadQuery(accountA, "ModerationConfig", {}),
    (err) => err?.status === 403 && err?.code === "ENTITY_LIST_FORBIDDEN",
  );
  assert.equal(
    canReadDoc(accountA, "ModerationConfig", entities.ModerationConfig.get("moderation-private")),
    false,
  );
  assert.deepEqual(
    visible(admin, "ModerationConfig").map((row) => row.id),
    ["moderation-private"],
  );

  assert.deepEqual(
    apiErrorBody(Object.assign(new Error("No selected character"), {
      status: 409,
      code: GameplayContextCodes.NO_SELECTED_CHARACTER,
    })),
    {
      success: false,
      error: "No selected character",
      code: GameplayContextCodes.NO_SELECTED_CHARACTER,
    },
  );
  assert.deepEqual(
    normalizeFunctionBody({ character: { id: characterA.id } }, 200),
    { success: true, character: { id: characterA.id } },
  );
  assert.deepEqual(
    normalizeFunctionBody({ error: "Conflict", code: "CONFLICT" }, 409),
    { success: false, error: "Conflict", code: "CONFLICT" },
  );

  console.log("ENTITY_ACCESS_TEST_OK");
} finally {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

