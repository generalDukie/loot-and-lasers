/**
 * Structured operational logger (Restoration 27).
 * Observes gameplay — does not create or modify authoritative state.
 */
import { redactForLog } from "./redactOps.js";

const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  critical: 50,
});

const SERVICE = "lootandlasers-node";
const ENV = process.env.NODE_ENV || "development";
const RELEASE =
  process.env.RELEASE_VERSION ||
  process.env.npm_package_version ||
  process.env.GIT_SHA ||
  "dev";
const BUILD = process.env.BUILD_ID || process.env.GIT_SHA || null;
const GIT_SHA = process.env.GIT_SHA || null;

function configuredLevel() {
  const raw = String(process.env.LOG_LEVEL || (ENV === "production" ? "info" : "debug")).toLowerCase();
  return LEVELS[raw] ?? LEVELS.info;
}

let minLevel = configuredLevel();

export function setLogLevel(level) {
  const n = LEVELS[String(level || "").toLowerCase()];
  if (n != null) minLevel = n;
}

function emit(payload) {
  const line = JSON.stringify(payload);
  if (payload.severity === "error" || payload.severity === "critical") {
    console.error(line);
  } else if (payload.severity === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * @param {string} severity
 * @param {string} message
 * @param {Record<string, unknown>} [fields]
 */
export function log(severity, message, fields = {}) {
  const sev = String(severity || "info").toLowerCase();
  const levelNum = LEVELS[sev] ?? LEVELS.info;
  if (levelNum < minLevel) return;

  const safe = redactForLog(fields && typeof fields === "object" ? fields : {});
  emit({
    ts: new Date().toISOString(),
    severity: sev,
    service: SERVICE,
    environment: ENV,
    release: RELEASE,
    build: BUILD,
    message: String(message || ""),
    ...safe,
  });
}

export const logger = {
  debug: (msg, fields) => log("debug", msg, fields),
  info: (msg, fields) => log("info", msg, fields),
  warn: (msg, fields) => log("warn", msg, fields),
  error: (msg, fields) => log("error", msg, fields),
  critical: (msg, fields) => log("critical", msg, fields),
};

export function CreateStructuredLogger(component) {
  const base = { component: String(component || "app") };
  return {
    debug: (msg, fields) => log("debug", msg, { ...base, ...fields }),
    info: (msg, fields) => log("info", msg, { ...base, ...fields }),
    warn: (msg, fields) => log("warn", msg, { ...base, ...fields }),
    error: (msg, fields) => log("error", msg, { ...base, ...fields }),
    critical: (msg, fields) => log("critical", msg, { ...base, ...fields }),
  };
}

export function getBuildInfo() {
  return {
    service: SERVICE,
    environment: ENV,
    release: RELEASE,
    build: BUILD,
    git_sha: GIT_SHA,
    app: "lootandlasers",
  };
}
