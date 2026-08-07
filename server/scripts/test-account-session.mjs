/**
 * Per-server single-session enforcement — bridge claim + JWT session_version + APP_ID.
 * Run: node --import ./server/scripts/register-src-alias.mjs ./server/scripts/test-account-session.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "loot-session-"));
process.env.DB_PATH = path.join(tempDir, "session.db");
process.env.JWT_SECRET = "test-session-secret";
process.env.APP_ID = "test-server-a";

const {
  resolveBridgeSession,
  signGameplayToken,
  gameplaySessionFromPayload,
  nakamaSessionKey,
  verifyToken,
} = await import("../src/auth.js");
const { readAccountServerSession } = await import("../src/accountServerSession.js");
const { kickAccountSessions } = await import("../src/realtime.js");
const { db, nowIso } = await import("../src/db.js");

const ts = nowIso();
const userId = "session-user-1";
const nakamaUserId = "nakama-session-user-1";

db.prepare(`
  INSERT INTO users (
    id, email, password_hash, role, email_verified, nakama_user_id,
    session_version, active_nakama_session_key,
    otp_code, otp_expires_at, created_date, updated_date
  ) VALUES (?, ?, ?, 'user', 1, ?, 1, NULL, NULL, NULL, ?, ?)
`).run(userId, "session@test.com", "hash", nakamaUserId, ts, ts);

const row = () => db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
const serverSession = (serverId = process.env.APP_ID) =>
  readAccountServerSession(userId, serverId);

const tokenA = jwt.sign({ jti: "sess-a" }, "nakama", { subject: nakamaUserId, expiresIn: 3600 });
const tokenB = jwt.sign({ jti: "sess-b" }, "nakama", { subject: nakamaUserId, expiresIn: 3600 });

assert.equal(nakamaSessionKey(tokenA), "sess-a");

{
  const first = resolveBridgeSession(row(), tokenA, { forceClaim: true });
  assert.equal(first.sessionVersion, 1);
  assert.equal(first.serverId, "test-server-a");
  assert.equal(first.superseded, false);
  assert.equal(serverSession().active_nakama_session_key, "sess-a");
}

{
  const refresh = resolveBridgeSession(row(), tokenA, { forceClaim: false });
  assert.equal(refresh.sessionVersion, 1);
  assert.equal(refresh.superseded, false);
}

{
  const other = resolveBridgeSession(row(), tokenB, { forceClaim: true });
  assert.equal(other.sessionVersion, 2);
  assert.equal(other.superseded, true);
  assert.equal(serverSession().active_nakama_session_key, "sess-b");
}

{
  let rejected = false;
  try {
    resolveBridgeSession(row(), tokenA, { forceClaim: false });
  } catch (err) {
    rejected = err.code === "AUTH_SESSION_INVALID";
  }
  assert.equal(rejected, true);
}

{
  const exp = Math.floor(Date.now() / 1000) + 600;
  const oldJwt = signGameplayToken(nakamaUserId, exp, {
    sessionVersion: 1,
    serverId: "test-server-a",
  });
  const payload = verifyToken(oldJwt);
  const stale = gameplaySessionFromPayload(payload);
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "AUTH_SESSION_INVALID");

  const liveJwt = signGameplayToken(nakamaUserId, exp, {
    sessionVersion: 2,
    serverId: "test-server-a",
  });
  const live = gameplaySessionFromPayload(verifyToken(liveJwt));
  assert.equal(live.ok, true);
  assert.equal(live.user.id, userId);
}

{
  const exp = Math.floor(Date.now() / 1000) + 600;
  const foreignJwt = signGameplayToken(nakamaUserId, exp, {
    sessionVersion: 2,
    serverId: "other-server",
  });
  const foreign = gameplaySessionFromPayload(verifyToken(foreignJwt));
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, "AUTH_SESSION_INVALID");
}

assert.equal(kickAccountSessions(userId), 0);

{
  process.env.APP_ID = "test-server-b";
  const tokenC = jwt.sign({ jti: "sess-c" }, "nakama", { subject: nakamaUserId, expiresIn: 3600 });
  const serverB = resolveBridgeSession(row(), tokenC, { forceClaim: true });
  assert.equal(serverB.sessionVersion, 1);
  assert.equal(serverB.serverId, "test-server-b");
  assert.equal(serverSession("test-server-b").active_nakama_session_key, "sess-c");

  const sessionA = serverSession("test-server-a");
  assert.equal(sessionA.session_version, 2);
  assert.equal(sessionA.active_nakama_session_key, "sess-b");

  const exp = Math.floor(Date.now() / 1000) + 600;
  const jwtB = signGameplayToken(nakamaUserId, exp, {
    sessionVersion: 1,
    serverId: "test-server-b",
  });
  assert.equal(gameplaySessionFromPayload(verifyToken(jwtB)).ok, true);
}

console.log("PASS per-server account session enforcement");
try {
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch {
  /* ignore */
}
process.exit(0);
