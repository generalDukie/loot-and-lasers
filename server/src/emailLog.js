import { nanoid } from "nanoid";

const MAX_EVENTS = 100;
const events = [];

function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at <= 1) return "***";
  return `${e[0]}***${e.slice(at)}`;
}

/** @param {{ type: string, to: string, subject: string, status: 'sent'|'failed'|'fallback', error?: string }} entry */
export function recordEmailEvent({ type, to, subject, status, error = null }) {
  const row = {
    id: nanoid(),
    at: new Date().toISOString(),
    type,
    to: maskEmail(to),
    subject,
    status,
    error,
  };
  events.unshift(row);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;

  const tag = status === "sent" ? "ok" : status === "failed" ? "FAIL" : "fallback";
  const errSuffix = error ? ` — ${error}` : "";
  console.log(`[email] ${tag} ${type} → ${row.to} "${subject}"${errSuffix}`);

  return row;
}

export function getEmailLog(limit = 50) {
  return events.slice(0, Math.min(Number(limit) || 50, MAX_EVENTS));
}
