import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { db, nowIso } from "./db.js";
import { entities } from "./entities.js";
import { isEmailSendingEnabled, sendEmail, recordEmailFallback, getEmailConfigSummary } from "./email.js";
import { getEmailLog } from "./emailLog.js";
import { NAME_NO_DIGITS_MSG } from "./shared/nameRules.js";
import { auditAuthEvent, AuditResults } from "./audit/index.js";
import { apiErrorBody, ApiErrorCodes } from "./apiResponse.js";
import { ensureCharacterPermanentStats } from "./shared/characterStatsRepair.js";
import {
  getServerId,
  migrateLegacyUserSessionColumns,
  readAccountServerSession,
  writeAccountServerSession,
} from "./accountServerSession.js";
import { rateLimitFromEnv } from "./rateLimit.js";

const JWT_SECRET = process.env.JWT_SECRET || "lootandlasers-dev-secret-change-me";
const TOKEN_TTL = process.env.JWT_TTL || "30d";
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const GAMEPLAY_JWT_MIN_TTL_SECONDS = SECONDS_PER_MINUTE;
const GAMEPLAY_JWT_MAX_TTL_MINUTES = 15;
const GAMEPLAY_JWT_DEFAULT_TTL_MINUTES = 12;
const GAMEPLAY_JWT_TTL_SEC = Math.max(
  GAMEPLAY_JWT_MIN_TTL_SECONDS,
  Math.min(
    GAMEPLAY_JWT_MAX_TTL_MINUTES * SECONDS_PER_MINUTE,
    Number(process.env.GAMEPLAY_JWT_TTL_SEC)
      || GAMEPLAY_JWT_DEFAULT_TTL_MINUTES * SECONDS_PER_MINUTE,
  ),
);
const GAMEPLAY_JWT_ISSUER = process.env.GAMEPLAY_JWT_ISSUER || "lootandlasers-node";
const GAMEPLAY_JWT_AUDIENCE = process.env.GAMEPLAY_JWT_AUDIENCE || "lootandlasers-gameplay";
const APP_ID = process.env.APP_ID || "lootandlasers-local";
const IS_PROD = process.env.NODE_ENV === "production";
const EMAIL_SENDING_ENABLED = isEmailSendingEnabled();
const NAKAMA_SESSION_HASH_LENGTH = 32;
const AUTH_BEARER_PREFIX = "Bearer ";
const OTP_MIN_VALUE = 100_000;
const OTP_VALUE_COUNT = 900_000;
const NAKAMA_ERROR_PREVIEW_MAX_LENGTH = 200;
const BRIDGE_PASSWORD_TOKEN_LENGTH = 48;
const PASSWORD_HASH_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const OTP_EXPIRY_MINUTES = 15;
const LEGACY_NAME_MIN_LENGTH = 2;
const LEGACY_NAME_MAX_LENGTH = 20;
const PASSWORD_RESET_TOKEN_LENGTH = 32;
const PASSWORD_RESET_EXPIRY_HOURS = 1;
const DEFAULT_EMAIL_LOG_LIMIT = 50;
const NAKAMA_HTTP_URL = process.env.NAKAMA_HTTP_URL || "http://127.0.0.1:7350";
const NAKAMA_HTTP_KEY = process.env.NAKAMA_HTTP_KEY
  || process.env.LOOT_WALLET_BRIDGE_SECRET
  || (IS_PROD ? "" : "defaulthttpkey");
const AUTH_RATE_DEFAULTS = Object.freeze({ windowSeconds: 60, max: 30 });
const RECOVERY_RATE_DEFAULTS = Object.freeze({ windowSeconds: 15 * 60, max: 5 });

function devOnlyExtras(payload) {
  // Never expose OTP / reset tokens to clients in production — even if SMTP is off.
  if (IS_PROD) return {};
  return payload;
}

async function setNakamaPassword(row, newPassword) {
  if (!row?.nakama_user_id || !row?.email) {
    const err = new Error("Account is not linked to Nakama email authentication");
    err.status = 409;
    err.code = "NAKAMA_ACCOUNT_NOT_LINKED";
    throw err;
  }
  if (!NAKAMA_HTTP_KEY) {
    const err = new Error("Password service is not configured");
    err.status = 503;
    err.code = "PASSWORD_SERVICE_UNAVAILABLE";
    throw err;
  }
  const endpoint = new URL("/v2/rpc/auth_password_set", NAKAMA_HTTP_URL);
  endpoint.searchParams.set("http_key", NAKAMA_HTTP_KEY);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(JSON.stringify({
      user_id: row.nakama_user_id,
      email: row.email,
      password: newPassword,
    })),
  });
  let rpc = {};
  try { rpc = await response.json(); } catch { /* handled below */ }
  let result = {};
  try { result = JSON.parse(rpc.payload || "{}"); } catch { /* handled below */ }
  if (!response.ok || result.success !== true) {
    const err = new Error(result.error || `Nakama password update failed (${response.status})`);
    err.status = Number(result.status_code) || (response.status >= 400 ? response.status : 502);
    err.code = result.code || "NAKAMA_PASSWORD_UPDATE_FAILED";
    throw err;
  }
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    legacy_name: row.legacy_name || null,
    legacy_display: row.legacy_display === "family" ? "family" : "surname",
    active_character_id: row.active_character_id || null,
    purchased_slots: row.purchased_slots || 0,
    email_verified: !!row.email_verified,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function nakamaTokenExpiry(sessionToken) {
  const decoded = jwt.decode(sessionToken);
  const exp = Number(decoded?.exp);
  return Number.isSafeInteger(exp) ? exp : 0;
}

export function signGameplayToken(nakamaUserId, nakamaExpiresAt, { sessionVersion = 1, serverId = getServerId() } = {}) {
  const now = Math.floor(Date.now() / MILLISECONDS_PER_SECOND);
  const remaining = Number(nakamaExpiresAt) - now;
  if (!nakamaUserId || !Number.isFinite(remaining) || remaining <= 0) {
    const err = new Error("Nakama session is expired or missing expiry");
    err.status = 401;
    throw err;
  }
  const expiresIn = Math.max(1, Math.min(GAMEPLAY_JWT_TTL_SEC, Math.floor(remaining)));
  const sv = Math.max(1, Math.floor(Number(sessionVersion) || 1));
  const aid = String(serverId || getServerId()).trim() || getServerId();
  return jwt.sign(
    { token_use: "nakama_gameplay", sv, aid },
    JWT_SECRET,
    {
      subject: nakamaUserId,
      issuer: GAMEPLAY_JWT_ISSUER,
      audience: GAMEPLAY_JWT_AUDIENCE,
      expiresIn,
      jwtid: nanoid(),
    },
  );
}

export function verifyToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (decoded?.token_use === "nakama_gameplay") {
      return jwt.verify(token, JWT_SECRET, {
        issuer: GAMEPLAY_JWT_ISSUER,
        audience: GAMEPLAY_JWT_AUDIENCE,
      });
    }
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Stable id for the Nakama session token (jti/sid or hash fallback). */
export function nakamaSessionKey(sessionToken) {
  const decoded = jwt.decode(sessionToken);
  if (decoded?.jti) return String(decoded.jti);
  if (decoded?.sid) return String(decoded.sid);
  return createHash("sha256")
    .update(String(sessionToken || ""))
    .digest("hex")
    .slice(0, NAKAMA_SESSION_HASH_LENGTH);
}

export function gameplaySessionFromPayload(payload) {
  const tokenAid = String(payload?.aid || "").trim();
  const serverId = getServerId();
  if (!tokenAid || tokenAid !== serverId) {
    return {
      ok: false,
      code: ApiErrorCodes.AUTH_SESSION_INVALID,
      message: "Gameplay token is for a different server.",
    };
  }
  const row = getUserByNakamaId(payload.sub);
  if (!row) {
    return {
      ok: false,
      code: ApiErrorCodes.UNAUTHORIZED,
      message: "Unauthorized",
    };
  }
  const session = readAccountServerSession(row.id, serverId);
  const tokenSv = Number(payload.sv);
  const currentSv = Math.max(1, Math.floor(Number(session?.session_version) || 1));
  if (!Number.isInteger(tokenSv) || tokenSv !== currentSv) {
    return {
      ok: false,
      code: ApiErrorCodes.AUTH_SESSION_INVALID,
      message: "Signed in elsewhere on this server. Please log in again.",
    };
  }
  return { ok: true, user: publicUser(row) };
}

/**
 * Claim or refresh the single active gameplay session for this account on this server.
 * forceClaim=true on fresh login replaces other machines; refresh keeps the same Nakama session key.
 */
export function resolveBridgeSession(userRow, nakamaToken, { forceClaim = false } = {}) {
  if (!userRow?.id) {
    const err = new Error("Bridge user missing");
    err.status = 500;
    throw err;
  }
  const serverId = getServerId();
  const sessionKey = nakamaSessionKey(nakamaToken);
  const stored = readAccountServerSession(userRow.id, serverId);
  const storedKey = stored?.active_nakama_session_key
    ? String(stored.active_nakama_session_key)
    : null;
  let sessionVersion = Math.max(1, Math.floor(Number(stored?.session_version) || 1));

  if (forceClaim) {
    if (storedKey && storedKey !== sessionKey) {
      sessionVersion += 1;
    }
    writeAccountServerSession(userRow.id, { sessionVersion, sessionKey }, serverId);
    return { sessionVersion, sessionKey, serverId, superseded: !!(storedKey && storedKey !== sessionKey) };
  }

  if (storedKey && storedKey !== sessionKey) {
    const err = new Error("Signed in elsewhere on this server. Please log in again.");
    err.status = 401;
    err.code = ApiErrorCodes.AUTH_SESSION_INVALID;
    throw err;
  }
  if (!storedKey) {
    writeAccountServerSession(userRow.id, { sessionVersion, sessionKey }, serverId);
  }
  return { sessionVersion, sessionKey, serverId, superseded: false };
}

export function getUserById(id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return publicUser(row);
}

export function getUserRowById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email);
}

/**
 * Account legacy identity is the single source of truth — mirror it onto every
 * operative so cached/stale character docs never disagree with the account.
 */
export function stampCharacterLegacy(userId, patch = {}) {
  if (!userId || !patch || !Object.keys(patch).length) return;
  try {
    entities.Character.updateMany({ created_by_id: userId }, patch);
  } catch {
    // Character docs stay resolvable from the account row; never fail the write.
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith(AUTH_BEARER_PREFIX)
    ? header.slice(AUTH_BEARER_PREFIX.length)
    : null;
  const token = bearer || req.headers["x-access-token"] || null;
  req.token = token || null;
  req.user = null;
  req.authFailure = null;
  if (token) {
    const payload = verifyToken(token);
    if (payload?.sub) {
      if (payload.token_use === "nakama_gameplay") {
        const resolved = gameplaySessionFromPayload(payload);
        if (resolved.ok) {
          req.user = resolved.user;
        } else {
          req.authFailure = { code: resolved.code, message: resolved.message };
        }
      } else {
        req.user = getUserById(payload.sub);
      }
      req.authIdentity = {
        token_use: payload.token_use || "legacy_node",
        subject: payload.sub,
        expires_at: payload.exp || null,
        token_id: payload.jti || null,
        session_version: payload.sv ?? null,
      };
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    const code = req.authFailure?.code || ApiErrorCodes.UNAUTHORIZED;
    const message = req.authFailure?.message || "Unauthorized";
    return res.status(401).json(apiErrorBody(
      Object.assign(new Error(message), { status: 401, code }),
    ));
  }
  next();
}

function otpCode() {
  return String(Math.floor(OTP_MIN_VALUE + Math.random() * OTP_VALUE_COUNT));
}

export function getUserByNakamaId(nakamaUserId) {
  if (!nakamaUserId) return null;
  return db.prepare("SELECT * FROM users WHERE nakama_user_id = ?").get(nakamaUserId);
}

/** Primary + optional fallback Nakama HTTP bases (comma-separated NAKAMA_HTTP_URLS). */
function nakamaHttpBases() {
  const multi = String(process.env.NAKAMA_HTTP_URLS || "").trim();
  const primary = String(
    process.env.NAKAMA_HTTP_URL || process.env.LOOT_NAKAMA_HTTP_URL || "http://127.0.0.1:7350",
  )
    .trim()
    .replace(/\/$/, "");
  const list = [];
  const push = (u) => {
    const n = String(u || "")
      .trim()
      .replace(/\/$/, "");
    if (n && !list.includes(n)) list.push(n);
  };
  push(primary);
  if (multi) {
    for (const part of multi.split(",")) push(part);
  }
  return list.length ? list : ["http://127.0.0.1:7350"];
}

async function fetchNakamaAccountFromBase(base, sessionToken) {
  const res = await fetch(`${base}/v2/account`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, NAKAMA_ERROR_PREVIEW_MAX_LENGTH) };
  }
  if (!res.ok) {
    const msg = body.message || body.error || `Nakama account lookup failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function fetchNakamaAccount(sessionToken) {
  const bases = nakamaHttpBases();
  let lastErr = null;
  for (const base of bases) {
    try {
      return await fetchNakamaAccountFromBase(base, sessionToken);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Nakama account lookup failed");
}

function linkNakamaId(userId, nakamaUserId) {
  if (!userId || !nakamaUserId) return;
  db.prepare("UPDATE users SET nakama_user_id = ?, updated_date = ? WHERE id = ?").run(
    nakamaUserId,
    nowIso(),
    userId,
  );
}

function resolveBridgeUser(nakamaUserId, email) {
  return getUserByNakamaId(nakamaUserId) || getUserByEmail(email);
}

export function createAuthRouter(express) {
  const router = express.Router();
  const authRateLimit = rateLimitFromEnv("auth", AUTH_RATE_DEFAULTS);
  const recoveryRateLimit = rateLimitFromEnv("password_recovery", RECOVERY_RATE_DEFAULTS);

  router.get("/me", requireAuth, (req, res) => {
    res.json(req.user);
  });

  router.get("/selected-character", requireAuth, (req, res) => {
    const characterId = String(req.user.active_character_id || "").trim();
    if (!characterId) {
      return res.status(404).json({ error: "No selected character" });
    }
    const character = entities.Character.get(characterId);
    if (!character) {
      return res.status(404).json({ error: "Selected character not found" });
    }
    if (character.created_by_id !== req.user.id) {
      return res.status(403).json({ error: "Selected character does not belong to you" });
    }
    const ensured = ensureCharacterPermanentStats(character);
    return res.json(ensured.character);
  });

  /**
   * Dual-stack bridge: validate a Nakama session and issue a Node JWT for
   * unmigrated Character/economy APIs. Does not replace Nakama as auth SoT.
   *
   * Body: { nakama_token, email? }
   * Godot credentials never cross this boundary; Nakama owns authentication.
   */
  router.post("/nakama-bridge", authRateLimit, async (req, res) => {
    try {
      const nakamaToken = String(req.body?.nakama_token || req.body?.session_token || "").trim();
      const emailHint = String(req.body?.email || "").trim().toLowerCase();
      if (!nakamaToken) {
        return res.status(400).json({ error: "nakama_token required" });
      }

      let account;
      try {
        account = await fetchNakamaAccount(nakamaToken);
      } catch (err) {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 401;
        return res.status(status).json({ error: err.message || "Invalid Nakama session" });
      }

      const nakamaUser = account.user || account;
      const nakamaUserId = String(nakamaUser?.id || nakamaUser?.user_id || "").trim();
      const email = String(nakamaUser?.email || emailHint || "").trim().toLowerCase();
      if (!nakamaUserId) {
        return res.status(401).json({ error: "Nakama account missing user id" });
      }
      const nakamaExpiresAt = nakamaTokenExpiry(nakamaToken);
      if (
        !nakamaExpiresAt
        || nakamaExpiresAt <= Math.floor(Date.now() / MILLISECONDS_PER_SECOND)
      ) {
        return res.status(401).json({ error: "Nakama session is expired or missing expiry" });
      }
      if (!email) {
        return res.status(400).json({
          error: "Nakama account has no email — pass email (and password) to link a Node user",
        });
      }

      let row = resolveBridgeUser(nakamaUserId, email);
      const ts = nowIso();

      if (!row) {
        // Create a Node gameplay user linked to this Nakama identity.
        const id = nanoid();
        // Bridge-only account: random, unknown Node password. Godot never sends
        // or synchronizes its Nakama credential to the gameplay backend.
        const hash = await bcrypt.hash(
          nanoid(BRIDGE_PASSWORD_TOKEN_LENGTH),
          PASSWORD_HASH_ROUNDS,
        );
        try {
          db.prepare(`
            INSERT INTO users (
              id, email, password_hash, role, email_verified, nakama_user_id,
              otp_code, otp_expires_at, created_date, updated_date
            ) VALUES (?, ?, ?, 'user', 1, ?, NULL, NULL, ?, ?)
          `).run(id, email, hash, nakamaUserId, ts, ts);
          console.log(`[auth] nakama-bridge created Node user for ${email} nakama=${nakamaUserId}`);
        } catch (err) {
          // Concurrent first exchange converges on the row that won either
          // unique key. Do not turn an idempotent bridge race into a 500.
          row = resolveBridgeUser(nakamaUserId, email);
          if (!row) throw err;
        }
        row = resolveBridgeUser(nakamaUserId, email);
      } else {
        if (!row.nakama_user_id) {
          try {
            linkNakamaId(row.id, nakamaUserId);
          } catch (err) {
            const winner = getUserByNakamaId(nakamaUserId);
            if (!winner || winner.id !== row.id) throw err;
          }
          row = resolveBridgeUser(nakamaUserId, email);
        } else if (row.nakama_user_id !== nakamaUserId) {
          return res.status(409).json({
            error: "Node account is linked to a different Nakama user",
          });
        }
        if (!row.email_verified) {
          db.prepare(`
            UPDATE users SET email_verified = 1, otp_code = NULL, otp_expires_at = NULL, updated_date = ?
            WHERE id = ?
          `).run(ts, row.id);
        }
      }

      const fresh = resolveBridgeUser(nakamaUserId, email);
      if (!fresh) {
        return res.status(500).json({ error: "Bridge user missing after link" });
      }

      const forceClaim = Boolean(req.body?.force_claim);
      let bridgeSession;
      try {
        bridgeSession = resolveBridgeSession(fresh, nakamaToken, { forceClaim });
      } catch (err) {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 401;
        return res.status(status).json(apiErrorBody(err));
      }
      if (bridgeSession.superseded) {
        const { kickAccountSessions } = await import("./realtime.js");
        kickAccountSessions(fresh.id, { reason: "new_login" });
      }

      const access_token = signGameplayToken(nakamaUserId, nakamaExpiresAt, {
        sessionVersion: bridgeSession.sessionVersion,
        serverId: bridgeSession.serverId,
      });
      const pub = publicUser(getUserRowById(fresh.id) || fresh);
      auditAuthEvent({
        action: "nakama_bridge",
        user: pub,
        email,
        ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
        result: AuditResults.SUCCESS,
        metadata: {
          nakama_user_id: nakamaUserId,
          server_id: bridgeSession.serverId,
          session_version: bridgeSession.sessionVersion,
          force_claim: forceClaim,
          superseded: bridgeSession.superseded,
        },
      });
      res.json({
        success: true,
        access_token,
        user: pub,
        nakama_user_id: nakamaUserId,
        server_id: bridgeSession.serverId,
        session_version: bridgeSession.sessionVersion,
        expires_at: Math.min(
          nakamaExpiresAt,
          Math.floor(Date.now() / MILLISECONDS_PER_SECOND) + GAMEPLAY_JWT_TTL_SEC,
        ),
        bridge: true,
      });
    } catch (err) {
      console.error("[auth] nakama-bridge error", err);
      res.status(500).json({ error: err.message || "Bridge failed" });
    }
  });

  router.post("/register", authRateLimit, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) return res.status(400).json({ error: "Email and password required" });
      if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        });
      }
      if (getUserByEmail(email)) return res.status(409).json({ error: "Email already registered" });

      const ts = nowIso();
      const id = nanoid();
      const code = otpCode();
      const hash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
      const expires = new Date(
        Date.now() + OTP_EXPIRY_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND,
      ).toISOString();

      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, email_verified, otp_code, otp_expires_at, created_date, updated_date)
        VALUES (?, ?, ?, 'user', 0, ?, ?, ?, ?)
      `).run(id, email, hash, code, expires, ts, ts);

      if (EMAIL_SENDING_ENABLED) {
        await sendEmail({
          type: "otp",
          to: email,
          subject: "Loot & Lasers verification code",
          text: `Your verification code is: ${code}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this, you can ignore this message.`,
        });
        return res.json({ success: true, email, otp_required: true });
      }

      // No SMTP: auto-verify so remote clients are not stuck waiting for console OTPs.
      db.prepare(`
        UPDATE users SET email_verified = 1, otp_code = NULL, otp_expires_at = NULL, updated_date = ?
        WHERE id = ?
      `).run(ts, id);
      console.log(`[auth] SMTP off — auto-verified ${email}`);
      recordEmailFallback({
        type: "otp",
        to: email,
        subject: "Loot & Lasers verification code",
        note: "auto-verified (SMTP_HOST not set)",
      });
      const user = getUserById(id);
      const access_token = signToken(id);
      res.json({
        success: true,
        email,
        otp_required: false,
        access_token,
        user,
        ...devOnlyExtras({ otp_dev: code, auto_verified: true }),
      });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  });

  router.post("/verify-otp", authRateLimit, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const otp = String(req.body?.otpCode || req.body?.otp || "").trim();
      const row = getUserByEmail(email);
      if (!row) return res.status(404).json({ error: "User not found" });
      if (row.email_verified) {
        const access_token = signToken(row.id);
        return res.json({ success: true, access_token, user: publicUser(row) });
      }
      if (!otp || otp !== row.otp_code) return res.status(400).json({ error: "Invalid OTP" });
      if (row.otp_expires_at && new Date(row.otp_expires_at) < new Date()) {
        return res.status(400).json({ error: "OTP expired" });
      }
      const ts = nowIso();
      db.prepare(`
        UPDATE users SET email_verified = 1, otp_code = NULL, otp_expires_at = NULL, updated_date = ?
        WHERE id = ?
      `).run(ts, row.id);
      const access_token = signToken(row.id);
      res.json({ success: true, access_token, user: getUserById(row.id) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  });

  router.post("/resend-otp", authRateLimit, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const row = getUserByEmail(email);
    if (!row) return res.status(404).json({ error: "User not found" });
    if (row.email_verified) return res.json({ success: true });
    const code = otpCode();
    const expires = new Date(
      Date.now() + OTP_EXPIRY_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND,
    ).toISOString();
    db.prepare("UPDATE users SET otp_code = ?, otp_expires_at = ?, updated_date = ? WHERE id = ?")
      .run(code, expires, nowIso(), row.id);

    if (EMAIL_SENDING_ENABLED) {
      try {
        await sendEmail({
          type: "otp",
          to: email,
          subject: "Loot & Lasers verification code",
          text: `Your verification code is: ${code}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this, you can ignore this message.`,
        });
      } catch (e) {
        return res.status(500).json({ error: "Failed to send verification code" });
      }
    } else {
      // Never print OTP to console (sensitive). Dev fallback retained in masked email log ring.
      recordEmailFallback({
        type: "otp",
        to: email,
        subject: "Loot & Lasers verification code",
        note: process.env.NODE_ENV === "production" ? "smtp_off" : `dev_otp=${code}`,
      });
    }

    res.json({ success: true, ...devOnlyExtras({ otp_dev: code }) });
  });

  router.post("/login", authRateLimit, async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      const row = getUserByEmail(email);
      if (!row) {
        auditAuthEvent({
          action: "login_failed",
          email,
          ipAddress: ip,
          result: AuditResults.REJECTED,
          metadata: { reason: "unknown_email" },
        });
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const ok = await bcrypt.compare(password, row.password_hash);
      if (!ok) {
        auditAuthEvent({
          action: "login_failed",
          user: publicUser(row),
          email,
          ipAddress: ip,
          result: AuditResults.REJECTED,
          metadata: { reason: "bad_password" },
        });
        return res.status(401).json({ error: "Invalid email or password" });
      }
      if (!row.email_verified) {
        return res.status(403).json({ error: "Email not verified", otp_required: true });
      }
      const access_token = signToken(row.id);
      const user = publicUser(row);
      auditAuthEvent({
        action: row.role === "admin" ? "admin_login" : "login_succeeded",
        user,
        email,
        ipAddress: ip,
        result: AuditResults.SUCCESS,
      });
      res.json({ success: true, access_token, user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/me", requireAuth, (req, res) => {
    const allowed = ["legacy_name", "legacy_display", "active_character_id"];
    const sets = [];
    const vals = [];
    // Mirrored onto every operative so the account stays recognizable.
    const legacyStamp = {};
    for (const key of allowed) {
      if (req.body?.[key] === undefined) continue;
      // Legacy surname is permanent once set.
      if (key === "legacy_name") {
        const existing = getUserRowById(req.user.id);
        if (existing?.legacy_name) continue;
        const legacy = String(req.body.legacy_name || "").trim();
        if (legacy.length < LEGACY_NAME_MIN_LENGTH || legacy.length > LEGACY_NAME_MAX_LENGTH) {
          return res.status(400).json({
            error: `Legacy name must be ${LEGACY_NAME_MIN_LENGTH}–${LEGACY_NAME_MAX_LENGTH} characters`,
          });
        }
        if (/\d/.test(legacy)) {
          return res.status(400).json({ error: NAME_NO_DIGITS_MSG });
        }
        sets.push("legacy_name = ?");
        vals.push(legacy);
        legacyStamp.legacy_name = legacy;
        continue;
      }
      if (key === "legacy_display") {
        const mode = req.body.legacy_display === "family" ? "family" : "surname";
        sets.push("legacy_display = ?");
        vals.push(mode);
        legacyStamp.legacy_display = mode;
        continue;
      }
      if (key === "active_character_id") {
        const charId = req.body.active_character_id;
        if (charId) {
          const c = entities.Character.get(charId);
          if (!c || c.created_by_id !== req.user.id) {
            return res.status(403).json({ error: "Character does not belong to you" });
          }
        }
      }
      sets.push(`${key} = ?`);
      vals.push(req.body[key]);
    }
    if (!sets.length) return res.json(req.user);
    sets.push("updated_date = ?");
    vals.push(nowIso());
    vals.push(req.user.id);
    db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
    stampCharacterLegacy(req.user.id, legacyStamp);
    res.json(getUserById(req.user.id));
  });

  router.post("/logout", (_req, res) => {
    res.json({ success: true });
  });

  router.post("/reset-password-request", recoveryRateLimit, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const row = getUserByEmail(email);
    const ip = req.ip || req.headers["x-forwarded-for"] || null;
    // Always succeed to avoid email enumeration
    if (row?.nakama_user_id) {
      const token = nanoid(PASSWORD_RESET_TOKEN_LENGTH);
      const expires = new Date(
        Date.now()
          + PASSWORD_RESET_EXPIRY_HOURS
            * MINUTES_PER_HOUR
            * SECONDS_PER_MINUTE
            * MILLISECONDS_PER_SECOND,
      ).toISOString();
      db.prepare("UPDATE users SET reset_token = ?, reset_expires_at = ?, updated_date = ? WHERE id = ?")
        .run(token, expires, nowIso(), row.id);

      auditAuthEvent({
        action: "password_reset_requested",
        user: publicUser(row),
        email,
        ipAddress: ip,
        result: AuditResults.SUCCESS,
      });

      if (EMAIL_SENDING_ENABLED) {
        try {
          await sendEmail({
            type: "reset",
            to: email,
            subject: "Reset your Loot & Lasers password",
            text: `We received a password reset request.\n\nOpen Loot & Lasers, choose Forgot password, then enter this reset token:\n\n${token}\n\nThis token expires in 1 hour.\n\nIf you did not request this, you can ignore this message.`,
          });
        } catch (e) {
          console.error(`[auth] Failed to send reset email to ${email}:`, e);
          return res.status(500).json({ error: "Failed to send reset email" });
        }
      } else {
        // Never print reset tokens to console.
        recordEmailFallback({
          type: "reset",
          to: email,
          subject: "Reset your Loot & Lasers password",
          note: process.env.NODE_ENV === "production" ? "smtp_off" : `dev_token=${token}`,
        });
      }

      return res.json({ success: true, ...devOnlyExtras({ reset_token_dev: token }) });
    }
    res.json({ success: true });
  });

  router.post("/reset-password", recoveryRateLimit, async (req, res) => {
    try {
      const token = String(req.body?.resetToken || req.body?.reset_token || "");
      const newPassword = String(req.body?.newPassword || req.body?.new_password || "");
      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      if (!token || !newPassword) return res.status(400).json({ error: "Token and new password required" });
      if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
        return res.status(422).json({
          error: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`,
        });
      }
      const row = db.prepare("SELECT * FROM users WHERE reset_token = ?").get(token);
      if (!row) return res.status(400).json({ error: "Invalid reset token" });
      if (row.reset_expires_at && new Date(row.reset_expires_at) < new Date()) {
        return res.status(400).json({ error: "Reset token expired" });
      }
      await setNakamaPassword(row, newPassword);
      const hash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
      db.prepare(`
        UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL, updated_date = ?
        WHERE id = ?
      `).run(hash, nowIso(), row.id);
      const serverId = getServerId();
      const currentSession = readAccountServerSession(row.id, serverId);
      const nextVersion = Math.max(
        1,
        Math.floor(Number(currentSession?.session_version) || 1) + 1,
      );
      writeAccountServerSession(
        row.id,
        { sessionVersion: nextVersion, sessionKey: null },
        serverId,
      );
      const { kickAccountSessions } = await import("./realtime.js");
      kickAccountSessions(row.id, {
        reason: "password_reset",
        message: "Password changed. Please log in again.",
      });
      auditAuthEvent({
        action: "password_reset_completed",
        user: publicUser(row),
        email: row.email,
        ipAddress: ip,
        result: AuditResults.SUCCESS,
        metadata: { via: "reset_token" },
      });
      res.json({ success: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  });

  router.post("/change-password", requireAuth, recoveryRateLimit, async (req, res) => {
    try {
      const newPassword = String(req.body?.newPassword || req.body?.new_password || "");
      const ip = req.ip || req.headers["x-forwarded-for"] || null;
      const row = getUserRowById(req.user.id);
      if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
        return res.status(422).json({
          error: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`,
        });
      }
      await setNakamaPassword(row, newPassword);
      const hash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
      db.prepare("UPDATE users SET password_hash = ?, updated_date = ? WHERE id = ?")
        .run(hash, nowIso(), row.id);
      auditAuthEvent({
        action: "password_reset_completed",
        user: req.user,
        email: row.email,
        ipAddress: ip,
        result: AuditResults.SUCCESS,
        metadata: { via: "change_password" },
      });
      res.json({ success: true });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  });

  // Public settings endpoint used by AuthContext boot sequence
  router.get("/public-settings", (_req, res) => {
    res.json({
      id: APP_ID,
      public_settings: {
        auth_required: true,
        app_name: "Loot & Lasers",
      },
    });
  });

  function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    next();
  }

  router.get("/admin/email-log", requireAuth, requireAdmin, (req, res) => {
    const limit = Number(req.query.limit) || DEFAULT_EMAIL_LOG_LIMIT;
    res.json({
      config: getEmailConfigSummary(),
      events: getEmailLog(limit),
    });
  });

  router.post("/admin/email-test", requireAuth, requireAdmin, async (req, res) => {
    try {
      const to = req.user.email;
      if (!to) return res.status(400).json({ error: "Admin account has no email" });
      if (!EMAIL_SENDING_ENABLED) {
        return res.status(503).json({ error: "SMTP is not configured (set SMTP_HOST)" });
      }
      await sendEmail({
        type: "test",
        to,
        subject: "Loot & Lasers test email",
        text: "This is a test email from your Loot & Lasers server. If you received this, SMTP is working.",
      });
      res.json({ success: true, to });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to send test email" });
    }
  });

  return router;
}

export { APP_ID, publicUser };
