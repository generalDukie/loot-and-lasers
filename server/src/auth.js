import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { db, nowIso } from "./db.js";
import { entities } from "./entities.js";
import { isEmailSendingEnabled, sendEmail, recordEmailFallback, getEmailConfigSummary } from "./email.js";
import { getEmailLog } from "./emailLog.js";
import { NAME_NO_DIGITS_MSG } from "./shared/nameRules.js";

const JWT_SECRET = process.env.JWT_SECRET || "lootandlasers-dev-secret-change-me";
const TOKEN_TTL = process.env.JWT_TTL || "30d";
const APP_ID = process.env.APP_ID || "lootandlasers-local";
const IS_PROD = process.env.NODE_ENV === "production";
const EMAIL_SENDING_ENABLED = isEmailSendingEnabled();

function devOnlyExtras(payload) {
  // In production without SMTP configured we fall back to dev-style codes so
  // the app can still be usable locally and in simple hosting sandboxes.
  return IS_PROD && EMAIL_SENDING_ENABLED ? {} : payload;
}

const PUBLIC_CLIENT_URL = process.env.PUBLIC_CLIENT_URL || "http://localhost:8787";

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

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
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

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearer || req.headers["x-access-token"] || req.query?.access_token || null;
  req.token = token || null;
  req.user = null;
  if (token) {
    const payload = verifyToken(token);
    if (payload?.sub) req.user = getUserById(payload.sub);
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function otpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function createAuthRouter(express) {
  const router = express.Router();

  router.get("/me", requireAuth, (req, res) => {
    res.json(req.user);
  });

  router.post("/register", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) return res.status(400).json({ error: "Email and password required" });
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      if (getUserByEmail(email)) return res.status(409).json({ error: "Email already registered" });

      const ts = nowIso();
      const id = nanoid();
      const code = otpCode();
      const hash = await bcrypt.hash(password, 10);
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO users (id, email, password_hash, role, email_verified, otp_code, otp_expires_at, created_date, updated_date)
        VALUES (?, ?, ?, 'user', 0, ?, ?, ?, ?)
      `).run(id, email, hash, code, expires, ts, ts);

      if (EMAIL_SENDING_ENABLED) {
        await sendEmail({
          type: "otp",
          to: email,
          subject: "Loot & Lasers verification code",
          text: `Your verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, you can ignore this message.`,
        });
      } else {
        console.log(`[auth] OTP for ${email}: ${code}`);
        recordEmailFallback({
          type: "otp",
          to: email,
          subject: "Loot & Lasers verification code",
          note: `code logged to server console`,
        });
      }
      res.json({ success: true, email, otp_required: true, ...devOnlyExtras({ otp_dev: code }) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/verify-otp", async (req, res) => {
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
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/resend-otp", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const row = getUserByEmail(email);
    if (!row) return res.status(404).json({ error: "User not found" });
    if (row.email_verified) return res.json({ success: true });
    const code = otpCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare("UPDATE users SET otp_code = ?, otp_expires_at = ?, updated_date = ? WHERE id = ?")
      .run(code, expires, nowIso(), row.id);

    if (EMAIL_SENDING_ENABLED) {
      try {
        await sendEmail({
          type: "otp",
          to: email,
          subject: "Loot & Lasers verification code",
          text: `Your verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, you can ignore this message.`,
        });
      } catch (e) {
        return res.status(500).json({ error: "Failed to send verification code" });
      }
    } else {
      console.log(`[auth] OTP for ${email}: ${code}`);
      recordEmailFallback({
        type: "otp",
        to: email,
        subject: "Loot & Lasers verification code",
        note: "code logged to server console",
      });
    }

    res.json({ success: true, ...devOnlyExtras({ otp_dev: code }) });
  });

  router.post("/login", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      const row = getUserByEmail(email);
      if (!row) return res.status(401).json({ error: "Invalid email or password" });
      const ok = await bcrypt.compare(password, row.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid email or password" });
      if (!row.email_verified) {
        return res.status(403).json({ error: "Email not verified", otp_required: true });
      }
      const access_token = signToken(row.id);
      res.json({ success: true, access_token, user: publicUser(row) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch("/me", requireAuth, (req, res) => {
    const allowed = ["legacy_name", "legacy_display", "active_character_id"];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (req.body?.[key] === undefined) continue;
      // Legacy surname is permanent once set.
      if (key === "legacy_name") {
        const existing = getUserRowById(req.user.id);
        if (existing?.legacy_name) continue;
        const legacy = String(req.body.legacy_name || "").trim();
        if (legacy.length < 2 || legacy.length > 20) {
          return res.status(400).json({ error: "Legacy name must be 2–20 characters" });
        }
        if (/\d/.test(legacy)) {
          return res.status(400).json({ error: NAME_NO_DIGITS_MSG });
        }
        sets.push("legacy_name = ?");
        vals.push(legacy);
        continue;
      }
      if (key === "legacy_display") {
        const mode = req.body.legacy_display === "family" ? "family" : "surname";
        sets.push("legacy_display = ?");
        vals.push(mode);
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
    res.json(getUserById(req.user.id));
  });

  router.post("/logout", (_req, res) => {
    res.json({ success: true });
  });

  router.post("/reset-password-request", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const row = getUserByEmail(email);
    // Always succeed to avoid email enumeration
    if (row) {
      const token = nanoid(32);
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.prepare("UPDATE users SET reset_token = ?, reset_expires_at = ?, updated_date = ? WHERE id = ?")
        .run(token, expires, nowIso(), row.id);

      if (EMAIL_SENDING_ENABLED) {
        try {
          await sendEmail({
            type: "reset",
            to: email,
            subject: "Reset your Loot & Lasers password",
            text: `We received a password reset request.\n\nTo reset your password, open this link:\n${PUBLIC_CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}\n\nThis link expires in 1 hour.\n\nIf you did not request this, you can ignore this message.`,
          });
        } catch (e) {
          console.error(`[auth] Failed to send reset email to ${email}:`, e);
          return res.status(500).json({ error: "Failed to send reset email" });
        }
      } else {
        console.log(`[auth] Reset token for ${email}: ${token}`);
        recordEmailFallback({
          type: "reset",
          to: email,
          subject: "Reset your Loot & Lasers password",
          note: "token logged to server console",
        });
      }

      return res.json({ success: true, ...devOnlyExtras({ reset_token_dev: token }) });
    }
    res.json({ success: true });
  });

  router.post("/reset-password", async (req, res) => {
    try {
      const token = String(req.body?.resetToken || req.body?.reset_token || "");
      const newPassword = String(req.body?.newPassword || req.body?.new_password || "");
      if (!token || !newPassword) return res.status(400).json({ error: "Token and new password required" });
      const row = db.prepare("SELECT * FROM users WHERE reset_token = ?").get(token);
      if (!row) return res.status(400).json({ error: "Invalid reset token" });
      if (row.reset_expires_at && new Date(row.reset_expires_at) < new Date()) {
        return res.status(400).json({ error: "Reset token expired" });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      db.prepare(`
        UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL, updated_date = ?
        WHERE id = ?
      `).run(hash, nowIso(), row.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/change-password", requireAuth, async (req, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      const row = getUserRowById(req.user.id);
      const ok = await bcrypt.compare(currentPassword, row.password_hash);
      if (!ok) return res.status(400).json({ error: "Current password is incorrect" });
      const hash = await bcrypt.hash(newPassword, 10);
      db.prepare("UPDATE users SET password_hash = ?, updated_date = ? WHERE id = ?")
        .run(hash, nowIso(), row.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
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
    const limit = Number(req.query.limit) || 50;
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
