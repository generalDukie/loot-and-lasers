/**
 * Allowlisted serialization + forbidden-field stripping for audit payloads.
 */

import { createHash } from "node:crypto";

const FORBIDDEN_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "access_token",
  "refresh_token",
  "session",
  "session_token",
  "cookie",
  "authorization",
  "otp",
  "otp_code",
  "reset_token",
  "secret",
  "api_key",
  "private_key",
  "card_number",
  "cvv",
  "ssn",
]);

const MAX_DEPTH = 6;
const MAX_ARRAY = 40;
const MAX_STRING = 2000;

function isForbiddenKey(key) {
  const k = String(key).toLowerCase();
  if (FORBIDDEN_KEYS.has(k)) return true;
  if (k.includes("password") || k.includes("secret") || k.endsWith("_token")) return true;
  return false;
}

export function redactValue(value, depth = 0) {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((v) => redactValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isForbiddenKey(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = redactValue(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

export function maskEmail(email) {
  if (!email || typeof email !== "string") return email;
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const u = user.length <= 2 ? "*".repeat(user.length) : `${user[0]}***${user[user.length - 1]}`;
  return `${u}@${domain}`;
}

/** Truncated SHA-256 of IP for optional privacy-preserving storage. */
export function hashIp(ip) {
  if (!ip) return null;
  return createHash("sha256").update(String(ip)).digest("hex").slice(0, 32);
}
