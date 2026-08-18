import assert from "node:assert/strict";
import { createRateLimiter } from "../src/rateLimit.js";

let nowMs = 1_000;
const limiter = createRateLimiter({
  name: "test",
  windowMs: 10_000,
  max: 2,
  now: () => nowMs,
});

function invoke({ ip = "127.0.0.1", userId = "user-a" } = {}) {
  const headers = {};
  let status = 200;
  let body = null;
  let continued = false;
  const req = { ip, headers: {}, socket: {}, user: { id: userId } };
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  limiter(req, res, () => { continued = true; });
  return { headers, status, body, continued };
}

assert.equal(invoke().continued, true);
assert.equal(invoke().continued, true);
const blocked = invoke();
assert.equal(blocked.continued, false);
assert.equal(blocked.status, 429);
assert.equal(blocked.body.code, "RATE_LIMITED");
assert.ok(Number(blocked.headers["Retry-After"]) >= 1);

assert.equal(invoke({ userId: "user-b" }).continued, true, "users have independent buckets");
nowMs += 10_001;
assert.equal(invoke().continued, true, "window expiry reopens the bucket");

console.log("RATE_LIMIT_TEST_OK");
