import nodemailer from "nodemailer";
import { recordEmailEvent } from "./emailLog.js";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const EMAIL_SENDING_ENABLED = Boolean(SMTP_HOST);

let transport = null;

export function isEmailSendingEnabled() {
  return EMAIL_SENDING_ENABLED;
}

export function getEmailConfigSummary() {
  return {
    enabled: EMAIL_SENDING_ENABLED,
    host: SMTP_HOST || null,
    port: SMTP_PORT,
    from: SMTP_FROM || null,
    hasAuth: Boolean(SMTP_USER),
  };
}

function getTransport() {
  if (!EMAIL_SENDING_ENABLED) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transport;
}

/**
 * Send email and record outcome. Throws on failure when SMTP is configured.
 * @param {{ type: string, to: string, subject: string, text: string, html?: string }} opts
 */
export async function sendEmail({ type = "generic", to, subject, text, html }) {
  if (!to) throw new Error("Missing email recipient");
  if (!subject) throw new Error("Missing email subject");

  const tx = getTransport();
  if (!tx) {
    recordEmailEvent({
      type,
      to,
      subject,
      status: "fallback",
      error: "SMTP_HOST not set",
    });
    throw new Error("Email sending is disabled (SMTP_HOST not set)");
  }

  try {
    await tx.sendMail({
      from: SMTP_FROM || to,
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, "<br>"),
    });
    recordEmailEvent({ type, to, subject, status: "sent" });
  } catch (err) {
    recordEmailEvent({
      type,
      to,
      subject,
      status: "failed",
      error: err.message || String(err),
    });
    throw err;
  }
}

/** Log dev/console fallback without attempting SMTP. */
export function recordEmailFallback({ type, to, subject, note }) {
  recordEmailEvent({
    type,
    to,
    subject,
    status: "fallback",
    error: note || "delivered via console (dev)",
  });
}
