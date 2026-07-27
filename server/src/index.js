import http from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { authMiddleware, createAuthRouter, requireAuth, APP_ID, getUserById } from "./auth.js";
import { entities } from "./entities.js";
import { FUNCTION_HANDLERS } from "./functions/index.js";
import { addSubscriber } from "./realtime.js";
import "./db.js";

const PORT = Number(process.env.PORT || 8787);
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(authMiddleware);

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "lootandlasers", appId: APP_ID });
});

app.use("/api/auth", createAuthRouter(express));

// AuthContext public settings path (Base44-compatible)
app.get("/api/apps/public/prod/public-settings/by-id/:appId", (_req, res) => {
  res.json({
    id: APP_ID,
    public_settings: {
      auth_required: true,
      app_name: "Loot & Lasers",
    },
  });
});

// ── Entity CRUD (Base44-compatible surface) ──────────────────
function getStore(type) {
  return entities[type] || null;
}

app.get("/api/entities/:type", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const sort = req.query.sort || "-created_date";
    const limit = req.query.limit != null ? Number(req.query.limit) : 100;
    res.json(store.list(sort, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/entities/:type/filter", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const { query = {}, sort = "-created_date", limit = 100 } = req.body || {};
    res.json(store.filter(query, sort, limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/entities/:type/:id", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    // User entity: prefer auth users table
    if (req.params.type === "User") {
      const u = getUserById(req.params.id);
      if (u) return res.json(u);
    }
    const doc = store.get(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/entities/:type", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const data = { ...(req.body || {}) };
    // Stamp ownership for new records when not provided
    if (!data.created_by_id) data.created_by_id = req.user.id;
    if (!data.created_by) data.created_by = req.user.email;
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
    const updated = store.update(req.params.id, req.body || {});
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.patch("/api/entities/:type/:id", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const updated = store.update(req.params.id, req.body || {});
    res.json(updated);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/entities/:type/:id", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const deleted = store.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/entities/:type/delete-many", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    res.json(store.deleteMany(req.body?.query || req.body || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/entities/:type/update-many", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const { query = {}, update = {} } = req.body || {};
    res.json(store.updateMany(query, update));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/entities/:type/bulk", requireAuth, (req, res) => {
  try {
    const store = getStore(req.params.type);
    if (!store) return res.status(404).json({ error: "Unknown entity type" });
    const records = Array.isArray(req.body) ? req.body : (req.body?.records || []);
    res.status(201).json(store.bulkCreate(records, {
      created_by_id: req.user.id,
      created_by: req.user.email,
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// Alias used by some SDK versions
app.post("/api/apps/:appId/functions/:name", requireAuth, async (req, res) => {
  try {
    const handler = FUNCTION_HANDLERS[req.params.name];
    if (!handler) return res.status(404).json({ error: "Unknown function" });
    const result = await handler(req.user, req.body || {});
    res.status(result.status || 200).json(result.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const entityType = url.searchParams.get("entity") || "*";
  const token = url.searchParams.get("token") || null;
  addSubscriber(ws, { entityType, token });
  ws.send(JSON.stringify({ type: "connected", entity: entityType }));
});

server.listen(PORT, () => {
  console.log(`Loot & Lasers API listening on http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});
