import http from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { authMiddleware, createAuthRouter, requireAuth, APP_ID, getUserById } from "./auth.js";
import { entities } from "./entities.js";
import { FUNCTION_HANDLERS } from "./functions/index.js";
import { addSubscriber, userFromWsToken } from "./realtime.js";
import { attachStaticApp, resolveStaticDir } from "./static.js";
import {
  assertCanCreate,
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
import "./db.js";

const PORT = Number(process.env.PORT || 8787);
const IS_PROD = process.env.NODE_ENV === "production";
const app = express();

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

if (IS_PROD && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "lootandlasers-dev-secret-change-me")) {
  console.error("[fatal] Set JWT_SECRET to a strong random value in production.");
  process.exit(1);
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(authMiddleware);

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "lootandlasers", appId: APP_ID });
});

app.use("/api/auth", createAuthRouter(express));

// ── Entity CRUD ──────────────────────────────────────────────
function getStore(type) {
  return entities[type] || null;
}

app.get("/api/entities/:type", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const sort = req.query.sort || "-created_date";
    const limit = req.query.limit != null ? Number(req.query.limit) : 100;
    const scoped = scopeReadQuery(req.user, req.params.type, {});
    if (scoped && Object.keys(scoped).length > 0) {
      return res.json(store.filter(scoped, sort, limit));
    }
    res.json(store.list(sort, limit));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/entities/:type/filter", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const { query = {}, sort = "-created_date", limit = 100 } = req.body || {};
    const scoped = scopeReadQuery(req.user, req.params.type, query);
    res.json(store.filter(scoped, sort, limit));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/entities/:type/:id", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    if (req.params.type === "User") {
      const u = getUserById(req.params.id);
      if (u) return res.json(u);
    }
    const doc = store.get(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    if (["PromoCode", "PlayerModeration", "PrivateMessage"].includes(req.params.type)) {
      if (!isAdmin(req.user) && !canWriteDoc(req.user, req.params.type, doc)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    res.json(doc);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/entities/:type", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    assertCanCreate(req.user, req.params.type, req.body || {});
    const data = sanitizeCreatePayload(req.user, req.params.type, req.body || {});
    const created = store.create(data, {
      created_by_id: req.user.id,
      created_by: req.user.email,
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put("/api/entities/:type/:id", requireAuth, (req, res) => {
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
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.patch("/api/entities/:type/:id", requireAuth, (req, res) => {
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
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/entities/:type/:id", requireAuth, (req, res) => {
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
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/entities/:type/delete-many", requireAuth, (req, res) => {
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
    res.json({ deleted });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/entities/:type/update-many", requireAuth, (req, res) => {
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
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/entities/:type/bulk", requireAuth, (req, res) => {
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
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Cloud functions ──────────────────────────────────────────
app.post("/api/functions/:name", requireAuth, async (req, res) => {
  try {
    const handler = FUNCTION_HANDLERS[req.params.name];
    if (!handler) return res.status(404).json({ error: "Unknown function" });
    const result = await handler(req.user, req.body || {});
    res.status(result.status || 200).json(result.body);
  } catch (err) {
    console.error(`[function ${req.params.name}]`, err);
    res.status(500).json({ error: err.message });
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
    ws.send(JSON.stringify({ type: "error", error: "Unauthorized" }));
    ws.close(4401, "Unauthorized");
    return;
  }
  addSubscriber(ws, { entityType, user });
  ws.send(JSON.stringify({ type: "connected", entity: entityType }));
});

server.listen(PORT, () => {
  console.log(`Loot & Lasers API listening on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
  if (servingStatic) console.log(`Serving client from ${resolveStaticDir()}`);
});
