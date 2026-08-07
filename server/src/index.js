import http from "node:http";
import { createHash } from "node:crypto";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { authMiddleware, createAuthRouter, requireAuth, APP_ID, getUserById } from "./auth.js";
import { entities } from "./entities.js";
import { FUNCTION_HANDLERS } from "./functions/index.js";
import { addSubscriber, broadcastEntity, userFromWsToken } from "./realtime.js";
import { attachStaticApp, resolveStaticDir } from "./static.js";
import {
  assertCanCreate,
  assertCanRead,
  assertCanWrite,
  assertCanDelete,
  canWriteDoc,
  canDeleteDoc,
  isAdmin,
  queryIsConstrained,
  sanitizeCreatePayload,
  sanitizeUpdatePayload,
  scopeReadQuery,
} from "./entityAccess.js";
import { assertCanUnequipToBag } from "./shared/inventoryGrant.js";
import { db, nowIso } from "./db.js";
import { applyCharacterCreationStartingGrant } from "./shared/currencyService.js";
import { ensureCharacterPermanentStats } from "./shared/characterStatsRepair.js";
import { ensureDefaultSchedules } from "./scheduling/bootstrap.js";
import { startScheduler } from "./scheduling/worker.js";
import { createTimeRouter, createScheduleRouter } from "./routes/time.js";
import { createEntitlementRouter } from "./routes/entitlements.js";
import { createRewardRouter } from "./routes/rewards.js";
import { createArenaRouter } from "./arena/index.js";
import { createAuditRouter, auditAdminEntityWrite } from "./audit/index.js";
import { migrateLegacyEntitlements } from "./entitlements/migrate.js";
import { createWalletBridgeRouter } from "./walletBridge.js";
import { normalizeFunctionBody, sendApiError } from "./apiResponse.js";
import { assertWritesAllowed, getMaintenanceState } from "./shared/maintenanceGate.js";
import { assertSchemaCompatible } from "./shared/migrationFramework.js";
import {
  requestContextMiddleware,
  GetLiveness,
  GetReadiness,
  GetBuildInfoPublic,
  CreateStructuredLogger,
  incCounter,
} from "./shared/observability/index.js";
import "./shared/integrityStore.js";
import "./shared/migrations/registerBuiltins.js";
import "./entitlements/hooks.js";
import "./rewards/store.js";
import "./arena/store.js";
import "./audit/store.js";

const PORT = Number(process.env.PORT || 8787);
const IS_PROD = process.env.NODE_ENV === "production";
const app = express();
const bootLog = CreateStructuredLogger("boot");

/** RPCs allowed during maintenance (reads + recovery). */
const MAINTENANCE_ALLOWED_FUNCTIONS = new Set([
  "GetRecoveryState",
  "RecoverAmbiguousRequest",
  "GetAccountPreferences",
  "GetGameTime",
  "GetNotifications",
  "GetAchievements",
  "GetCollections",
  "GetSocialState",
  "GetPublicProfile",
  "GetInbox",
  "GetMyGuild",
  "GetPresenceMap",
  "GetCharactersByIds",
  "GetChatHistory",
  "GetRuntimeConfig",
  "GetOpsDashboard",
  "GetOpsTelemetry",
  "RecordClientAnalytics",
  "LookupPlayer",
  "InspectCharacter",
  "RunIntegrityAudit",
  "ApplyDataRepair",
  "SetMaintenanceMode",
  "RunMigration",
  "SetFeatureFlag",
  "UpdateRuntimeConfig",
  "AdminModeration",
]);

function enforceMaintenanceWrites(req, res, next) {
  try {
    assertWritesAllowed(req.user);
    next();
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Maintenance in progress" });
  }
}

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

if (IS_PROD && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "lootandlasers-dev-secret-change-me")) {
  console.error("[fatal] Set JWT_SECRET to a strong random value in production.");
  process.exit(1);
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(requestContextMiddleware);
app.use(authMiddleware);

app.get("/health", (_req, res) => {
  // Backward-compatible alias → readiness (Docker / Godot clients)
  const body = GetReadiness();
  res.status(body.ok ? 200 : 503).json(body);
});

app.get("/health/live", (_req, res) => {
  res.json(GetLiveness());
});

app.get("/health/ready", (_req, res) => {
  const body = GetReadiness();
  res.status(body.ok ? 200 : 503).json(body);
});

app.get("/health/build", (_req, res) => {
  res.json(GetBuildInfoPublic());
});

app.use("/api/auth", createAuthRouter(express));
app.use("/api/time", createTimeRouter(express));
app.use("/api/schedules", createScheduleRouter(express));
app.use("/api/entitlements", createEntitlementRouter(express));
app.use("/api/rewards", createRewardRouter(express));
app.use("/api/arena", createArenaRouter(express));
app.use("/api/audit", createAuditRouter(express));
app.use("/internal/wallet", createWalletBridgeRouter(express));

// ── Entity CRUD ──────────────────────────────────────────────
function getStore(type) {
  return entities[type] || null;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requestFingerprint(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function readLimit(value, fallback = 100, max = 500) {
  if (value == null || value === "") return fallback;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    const err = new Error(`limit must be an integer between 1 and ${max}`);
    err.status = 422;
    err.code = "INVALID_LIMIT";
    throw err;
  }
  return limit;
}

app.get("/api/entities/:type", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const sort = req.query.sort || "-created_date";
    const limit = readLimit(req.query.limit);
    const scoped = scopeReadQuery(req.user, req.params.type, {});
    if (scoped && Object.keys(scoped).length > 0) {
      return res.json(store.filter(scoped, sort, limit));
    }
    res.json(store.list(sort, limit));
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Could not list entities" });
  }
});

app.post("/api/entities/:type/filter", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const { query = {}, sort = "-created_date" } = req.body || {};
    const limit = readLimit(req.body?.limit);
    const scoped = scopeReadQuery(req.user, req.params.type, query);
    res.json(store.filter(scoped, sort, limit));
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Could not filter entities" });
  }
});

app.get("/api/entities/:type/:id", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    if (req.params.type === "User") {
      const u = getUserById(req.params.id);
      if (u) {
        assertCanRead(req.user, "User", u);
        return res.json(u);
      }
    }
    const doc = store.get(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    assertCanRead(req.user, req.params.type, doc);
    if (req.params.type === "Character") {
      const ensured = ensureCharacterPermanentStats(doc);
      return res.json(ensured.character);
    }
    res.json(doc);
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Could not read entity" });
  }
});

app.post("/api/entities/:type", requireAuth, enforceMaintenanceWrites, (req, res) => {
  let transactionOpen = false;
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const rawBody = { ...(req.body || {}) };
    const requestId = String(
      req.headers["idempotency-key"] || rawBody.request_id || "",
    ).trim();
    delete rawBody.request_id;
    if (
      req.params.type === "Character"
      && req.authIdentity?.token_use === "nakama_gameplay"
      && !/^[A-Za-z0-9._:-]{8,128}$/.test(requestId)
    ) {
      return res.status(400).json({ error: "Character creation requires a valid request_id" });
    }

    const fingerprint = req.params.type === "Character" && requestId
      ? requestFingerprint(rawBody)
      : "";
    if (fingerprint) {
      const prior = db.prepare(`
        SELECT request_fingerprint, result_json
        FROM character_creation_requests
        WHERE account_id = ? AND request_id = ?
      `).get(req.user.id, requestId);
      if (prior) {
        if (prior.request_fingerprint !== fingerprint) {
          return res.status(409).json({ error: "request_id was already used with different input" });
        }
        res.set("X-Idempotent-Replay", "true");
        return res.status(200).json(JSON.parse(prior.result_json));
      }
    }

    if (fingerprint) {
      db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
    }
    assertCanCreate(req.user, req.params.type, rawBody);
    const data = sanitizeCreatePayload(req.user, req.params.type, rawBody);
    let created = store.create(data, {
      created_by_id: req.user.id,
      created_by: req.user.email,
      emit: !fingerprint,
    });
    // Per-character starting Nova (500) via economy ledger — not client/Nakama authored.
    if (req.params.type === "Character" && !isAdmin(req.user)) {
      const grant = applyCharacterCreationStartingGrant(req.user, created, {
        requestId,
      });
      created = grant.character;
      const ensured = ensureCharacterPermanentStats(created);
      created = ensured.character;
    }
    if (fingerprint) {
      const account = db.prepare("SELECT active_character_id FROM users WHERE id = ?").get(req.user.id);
      if (!account?.active_character_id) {
        db.prepare(
          "UPDATE users SET active_character_id = ?, updated_date = ? WHERE id = ?",
        ).run(created.id, nowIso(), req.user.id);
      }
      db.prepare(`
        INSERT INTO character_creation_requests (
          account_id, request_id, request_fingerprint, character_id, result_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        requestId,
        fingerprint,
        created.id,
        JSON.stringify(created),
        nowIso(),
      );
      db.exec("COMMIT");
      transactionOpen = false;
      broadcastEntity("Character", "create", created);
    }
    if (isAdmin(req.user)) {
      auditAdminEntityWrite({
        user: req.user,
        entityType: req.params.type,
        op: "create",
        entityId: created.id,
        after: created,
        reasonText: req.body?.audit_reason || req.headers["x-audit-reason"],
      });
    }
    res.status(201).json(created);
  } catch (err) {
    if (transactionOpen) {
      try { db.exec("ROLLBACK"); } catch { /* ignore rollback failure */ }
    }
    sendApiError(res, err, { fallbackMessage: "Could not create entity" });
  }
});

app.put("/api/entities/:type/:id", requireAuth, enforceMaintenanceWrites, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const existing = store.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    assertCanWrite(req.user, req.params.type, existing);
    let body = { ...(req.body || {}) };
    delete body.created_by_id;
    delete body.created_by;
    delete body.id;
    if (req.params.type === "PromoCode" && !isAdmin(req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    body = sanitizeUpdatePayload(req.user, req.params.type, body);
    if (req.params.type === "Item") assertCanUnequipToBag(existing, body);
    const updated = store.update(req.params.id, body);
    if (isAdmin(req.user)) {
      auditAdminEntityWrite({
        user: req.user,
        entityType: req.params.type,
        op: "update",
        entityId: req.params.id,
        before: existing,
        after: updated,
        reasonText: req.body?.audit_reason || req.headers["x-audit-reason"],
      });
    }
    res.json(updated);
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Could not update entity" });
  }
});

app.patch("/api/entities/:type/:id", requireAuth, enforceMaintenanceWrites, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const existing = store.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    assertCanWrite(req.user, req.params.type, existing);
    let body = { ...(req.body || {}) };
    delete body.created_by_id;
    delete body.created_by;
    delete body.id;
    if (req.params.type === "PromoCode" && !isAdmin(req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    body = sanitizeUpdatePayload(req.user, req.params.type, body);
    if (req.params.type === "Item") assertCanUnequipToBag(existing, body);
    const updated = store.update(req.params.id, body);
    if (isAdmin(req.user)) {
      auditAdminEntityWrite({
        user: req.user,
        entityType: req.params.type,
        op: "update",
        entityId: req.params.id,
        before: existing,
        after: updated,
        reasonText: req.body?.audit_reason || req.headers["x-audit-reason"],
      });
    }
    res.json(updated);
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Could not update entity" });
  }
});

app.delete("/api/entities/:type/:id", requireAuth, enforceMaintenanceWrites, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const existing = store.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!isAdmin(req.user) && req.params.type === "Item") {
      return res.status(403).json({ error: "Use DissolveItem or UseConsumable" });
    }
    assertCanDelete(req.user, req.params.type, existing);
    const deleted = store.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    if (isAdmin(req.user)) {
      auditAdminEntityWrite({
        user: req.user,
        entityType: req.params.type,
        op: "delete",
        entityId: req.params.id,
        before: existing,
        reasonText: req.body?.audit_reason || req.headers["x-audit-reason"],
      });
    }
    res.json({ success: true });
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Could not delete entity" });
  }
});

app.post("/api/entities/:type/delete-many", requireAuth, enforceMaintenanceWrites, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    if (!isAdmin(req.user) && (req.params.type === "Item" || req.params.type === "Mission")) {
      return res.status(403).json({
        error: req.params.type === "Item"
          ? "Use DissolveItem or UseConsumable"
          : "Forbidden",
      });
    }
    const query = req.body?.query || req.body || {};
    if (!queryIsConstrained(query)) {
      return res.status(400).json({ error: "delete-many requires a constrained query" });
    }
    const matches = store.filter(query, null, 100000).filter((d) => canDeleteDoc(req.user, req.params.type, d));
    let deleted = 0;
    for (const item of matches) {
      store.delete(item.id);
      deleted += 1;
    }
    if (isAdmin(req.user) && deleted > 0) {
      auditAdminEntityWrite({
        user: req.user,
        entityType: req.params.type,
        op: "delete",
        entityId: null,
        after: { deleted, query },
        reasonText: req.body?.audit_reason || req.headers["x-audit-reason"] || "delete_many",
      });
    }
    res.json({ deleted });
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Could not delete entities" });
  }
});

app.post("/api/entities/:type/update-many", requireAuth, enforceMaintenanceWrites, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const { query = {}, update = {} } = req.body || {};
    if (!queryIsConstrained(query)) {
      return res.status(400).json({ error: "update-many requires a constrained query" });
    }
    let body = { ...update };
    delete body.created_by_id;
    delete body.created_by;
    delete body.id;
    body = sanitizeUpdatePayload(req.user, req.params.type, body);
    const matches = store.filter(query, null, 100000).filter((d) => canWriteDoc(req.user, req.params.type, d));
    if (req.params.type === "Item" && body.is_equipped === false) {
      for (const m of matches) assertCanUnequipToBag(m, body);
    }
    const updated = matches.map((m) => store.update(m.id, body));
    if (isAdmin(req.user) && updated.length > 0) {
      auditAdminEntityWrite({
        user: req.user,
        entityType: req.params.type,
        op: "update",
        entityId: null,
        after: { updated: updated.length, query, fields: Object.keys(body) },
        reasonText: req.body?.audit_reason || req.headers["x-audit-reason"] || "update_many",
      });
    }
    res.json(updated);
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Could not update entities" });
  }
});

app.post("/api/entities/:type/bulk", requireAuth, enforceMaintenanceWrites, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const records = Array.isArray(req.body) ? req.body : (req.body?.records || []);
    assertCanCreate(req.user, req.params.type, {});
    const created = records.map((r) => {
      const data = sanitizeCreatePayload(req.user, req.params.type, r || {});
      return store.create(data, {
        created_by_id: req.user.id,
        created_by: req.user.email,
      });
    });
    res.status(201).json(created);
  } catch (err) {
    sendApiError(res, err, { fallbackMessage: "Could not create entities" });
  }
});

// ── Cloud functions ──────────────────────────────────────────
app.post("/api/functions/:name", requireAuth, async (req, res) => {
  const fnLog = CreateStructuredLogger("rpc");
  const op = String(req.params.name || "unknown").slice(0, 64);
  try {
    const handler = FUNCTION_HANDLERS[req.params.name];
    if (!handler) {
      incCounter("rpc_unknown_total", { operation: "unknown" });
      return res.status(404).json({ error: "Unknown function", code: "NOT_FOUND" });
    }
    const maintenance = getMaintenanceState();
    if (maintenance.enabled && !MAINTENANCE_ALLOWED_FUNCTIONS.has(req.params.name)) {
      assertWritesAllowed(req.user);
    }
    const started = Date.now();
    const result = await handler(req.user, req.body || {});
    const status = result.status || 200;
    incCounter("rpc_requests_total", {
      operation: op,
      status_class: `${Math.floor(status / 100)}xx`,
    });
    if (status >= 500) {
      fnLog.error("rpc_failed", {
        request_id: req.requestId,
        operation: op,
        status,
        duration_ms: Date.now() - started,
        code: result.body?.code,
      });
    }
    const body = normalizeFunctionBody(result.body, status);
    if (body && typeof body === "object" && !Array.isArray(body) && req.requestId) {
      body.request_id = body.request_id || req.requestId;
    }
    res.status(status).json(body);
  } catch (err) {
    incCounter("rpc_unexpected_errors_total", { operation: op });
    fnLog.error("rpc_exception", {
      request_id: req.requestId,
      operation: op,
      code: err?.code || "INTERNAL_ERROR",
      error: String(err?.message || err),
    });
    sendApiError(res, err, { fallbackMessage: "Gameplay request failed" });
  }
});

const servingStatic = attachStaticApp(app);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const entityType = url.searchParams.get("entity") || "*";
  const token = url.searchParams.get("token") || null;
  const user = userFromWsToken(token);
  if (!user) {
    incCounter("ws_auth_failures_total", { reason: "unauthorized" });
    ws.send(JSON.stringify({ type: "error", error: "Unauthorized" }));
    ws.close(4401, "Unauthorized");
    return;
  }
  incCounter("ws_connections_total", { result: "ok" });
  addSubscriber(ws, { entityType, user });
  ws.send(JSON.stringify({ type: "connected", entity: entityType }));
});

server.listen(PORT, () => {
  bootLog.info("api_listening", { port: PORT, static: !!servingStatic });
  console.log(`Loot & Lasers API listening on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  if (servingStatic) console.log(`Serving client from ${resolveStaticDir()}`);
  try {
    ensureDefaultSchedules();
    startScheduler({ intervalMs: Number(process.env.SCHEDULE_TICK_MS) || 15_000 });
  } catch (err) {
    bootLog.error("scheduler_start_failed", { error: String(err?.message || err) });
    console.error("[scheduler] failed to start:", err);
  }
  migrateLegacyEntitlements()
    .then((r) => {
      if (!r?.skipped) {
        bootLog.info("entitlements_legacy_migration", {});
        console.log("[entitlements] legacy migration:", r);
      }
    })
    .catch((err) => {
      bootLog.error("entitlements_migration_failed", { error: String(err?.message || err) });
      console.error("[entitlements] migration failed:", err);
    });
});
