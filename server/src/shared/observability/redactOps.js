/**
 * Operational log redaction (Restoration 27).
 * Reuses audit forbidden-key rules; never logs tokens/JWTs/receipts.
 */
import { redactValue, maskEmail, hashIp } from "../../audit/redact.js";

export { redactValue, maskEmail, hashIp };

const HEADER_DENY = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-loot-wallet-bridge-secret",
]);

/** Redact a bag of log fields (shallow + nested via redactValue). */
export function redactForLog(fields) {
  if (!fields || typeof fields !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    const key = String(k);
    const lower = key.toLowerCase();
    if (HEADER_DENY.has(lower) || lower.includes("password") || lower.includes("token") || lower.includes("secret")) {
      out[key] = "[redacted]";
      continue;
    }
    if (lower === "email" || lower.endsWith("_email")) {
      out[key] = maskEmail(v);
      continue;
    }
    if (lower === "headers" && v && typeof v === "object") {
      out[key] = redactHeaders(v);
      continue;
    }
    out[key] = redactValue(v);
  }
  return out;
}

export function redactHeaders(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (HEADER_DENY.has(String(k).toLowerCase())) {
      out[k] = "[redacted]";
    } else {
      out[k] = typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}…` : v;
    }
  }
  return out;
}

export function RedactSensitiveData(value) {
  return redactValue(value);
}
