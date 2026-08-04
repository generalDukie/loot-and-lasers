import assert from "node:assert/strict";

const base = String(process.env.API_URL || "http://127.0.0.1:8799").replace(/\/$/, "");

async function request(pathname, { method = "GET", token = "", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, ok: response.ok, data };
}

async function createPlayer(tag) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const registration = await request("/api/auth/register", {
    method: "POST",
    body: {
      email: `pipeline-${tag}-${stamp}@example.com`,
      password: "PipelinePass9x",
    },
  });
  assert.equal(registration.status, 200);
  assert.ok(registration.data?.access_token);

  const character = await request("/api/entities/Character", {
    method: "POST",
    token: registration.data.access_token,
    body: { name: `Pilot${tag}`, race: "human", class: "Vanguard" },
  });
  assert.equal(character.status, 201);
  assert.ok(character.data?.id);
  return {
    token: registration.data.access_token,
    character: character.data,
  };
}

const health = await request("/health");
assert.equal(health.status, 200);

const unauthenticated = await request("/api/entities/Character");
assert.equal(unauthenticated.status, 401);
assert.deepEqual(
  {
    success: unauthenticated.data?.success,
    code: unauthenticated.data?.code,
  },
  { success: false, code: "UNAUTHORIZED" },
);

const playerA = await createPlayer("Alpha");
const playerB = await createPlayer("Bravo");

const foreignCharacter = await request(
  `/api/entities/Character/${playerB.character.id}`,
  { token: playerA.token },
);
assert.equal(foreignCharacter.status, 403);
assert.equal(foreignCharacter.data?.success, false);
assert.equal(foreignCharacter.data?.code, "FORBIDDEN");

for (const player of [playerA, playerB]) {
  const created = await request("/api/entities/AppNotification", {
    method: "POST",
    token: player.token,
    body: {
      owner_id: player.character.id,
      title: `Notification ${player.character.id}`,
    },
  });
  assert.equal(created.status, 201);
}

const ownNotifications = await request("/api/entities/AppNotification/filter", {
  method: "POST",
  token: playerA.token,
  body: { query: {}, limit: 100 },
});
assert.equal(ownNotifications.status, 200);
assert.equal(ownNotifications.data.length, 1);
assert.equal(ownNotifications.data[0].owner_id, playerA.character.id);

const privateConfig = await request("/api/entities/ModerationConfig", {
  token: playerA.token,
});
assert.equal(privateConfig.status, 403);
assert.equal(privateConfig.data?.success, false);
assert.equal(privateConfig.data?.code, "ENTITY_LIST_FORBIDDEN");

const invalidLimit = await request("/api/entities/Guild?limit=5000", {
  token: playerA.token,
});
assert.equal(invalidLimit.status, 422);
assert.equal(invalidLimit.data?.success, false);
assert.equal(invalidLimit.data?.code, "INVALID_LIMIT");

const missingSelection = await request("/api/functions/BuyFuel", {
  method: "POST",
  token: playerA.token,
  body: { request_id: `fuel-${Date.now()}` },
});
assert.equal(missingSelection.status, 409);
assert.equal(missingSelection.data?.success, false);
assert.equal(missingSelection.data?.code, "CONFLICT");

console.log("GAMEPLAY_PIPELINE_HTTP_TEST_OK");

