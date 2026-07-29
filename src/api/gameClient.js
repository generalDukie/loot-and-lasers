/**
 * Loot & Lasers game API client.
 * Surface: api.auth.*, api.entities.*, api.functions.invoke, entity.subscribe
 */
import { appParams } from "@/lib/app-params";

/** Empty = same-origin (Vite proxy in dev, API static in prod). Works on phone/LAN. */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

function wsBaseUrl() {
  if (API_BASE) return API_BASE.replace(/^http/, "ws");
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = typeof window !== "undefined" ? window.location.host : "localhost:8787";
  return `${proto}//${host}`;
}
const TOKEN_KEYS = ["loot_access_token", "token"];

function readToken() {
  if (appParams.token) return appParams.token;
  for (const key of TOKEN_KEYS) {
    const v = localStorage.getItem(key);
    if (v) return v;
  }
  return null;
}

function writeToken(token) {
  if (token) {
    localStorage.setItem("loot_access_token", token);
    localStorage.setItem("token", token);
    appParams.token = token;
  } else {
    for (const key of TOKEN_KEYS) localStorage.removeItem(key);
    appParams.token = null;
  }
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.response = { data, status };
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new ApiError(data?.error || res.statusText || "Request failed", res.status, data);
  }
  return data;
}

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (/rate limit/i.test(err?.message || String(err)) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

function createEntity(type) {
  return {
    async list(sort = "-created_date", limit = 100) {
      return withRetry(() => {
        const q = new URLSearchParams();
        if (sort != null) q.set("sort", String(sort));
        if (limit != null) q.set("limit", String(limit));
        return request(`/api/entities/${type}?${q}`);
      });
    },
    async filter(query = {}, sort = "-created_date", limit = 100) {
      return withRetry(() =>
        request(`/api/entities/${type}/filter`, {
          method: "POST",
          body: { query, sort, limit },
        })
      );
    },
    async get(id) {
      return withRetry(() => request(`/api/entities/${type}/${id}`));
    },
    async create(data) {
      return withRetry(() =>
        request(`/api/entities/${type}`, { method: "POST", body: data })
      );
    },
    async update(id, data) {
      return withRetry(() =>
        request(`/api/entities/${type}/${id}`, { method: "PATCH", body: data })
      );
    },
    async delete(id) {
      return withRetry(() =>
        request(`/api/entities/${type}/${id}`, { method: "DELETE" })
      );
    },
    async deleteMany(query) {
      return withRetry(() =>
        request(`/api/entities/${type}/delete-many`, {
          method: "POST",
          body: { query },
        })
      );
    },
    async updateMany(query, update) {
      return withRetry(() =>
        request(`/api/entities/${type}/update-many`, {
          method: "POST",
          body: { query, update },
        })
      );
    },
    async bulkCreate(records) {
      return withRetry(() =>
        request(`/api/entities/${type}/bulk`, {
          method: "POST",
          body: { records },
        })
      );
    },
    subscribe(handler) {
      const wsBase = wsBaseUrl();
      const token = readToken() || "";
      const ws = new WebSocket(
        `${wsBase}/ws?entity=${encodeURIComponent(type)}&token=${encodeURIComponent(token)}`
      );
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "connected") return;
          if (msg.entity === type || msg.entity === "*") handler(msg);
        } catch { /* ignore */ }
      };
      ws.onerror = () => {};
      return () => {
        try { ws.close(); } catch { /* ignore */ }
      };
    },
  };
}

const entityCache = new Map();
function entityProxy() {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== "string") return undefined;
        if (!entityCache.has(prop)) entityCache.set(prop, createEntity(prop));
        return entityCache.get(prop);
      },
    }
  );
}

const auth = {
  async me() {
    return request("/api/auth/me");
  },
  async loginViaEmailPassword(email, password) {
    const data = await request("/api/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    if (data.access_token) writeToken(data.access_token);
    return data;
  },
  async register({ email, password }) {
    return request("/api/auth/register", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
  },
  async verifyOtp({ email, otpCode }) {
    const data = await request("/api/auth/verify-otp", {
      method: "POST",
      body: { email, otpCode },
      auth: false,
    });
    if (data.access_token) writeToken(data.access_token);
    return data;
  },
  async resendOtp(email) {
    return request("/api/auth/resend-otp", {
      method: "POST",
      body: { email },
      auth: false,
    });
  },
  setToken(token) {
    writeToken(token);
  },
  clearToken() {
    writeToken(null);
  },
  async getPublicSettings() {
    return request("/api/auth/public-settings", { auth: false });
  },
  async updateMe(patch) {
    return request("/api/auth/me", { method: "PATCH", body: patch });
  },
  async logout(redirectUrl) {
    try { await request("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    writeToken(null);
    if (redirectUrl) window.location.href = redirectUrl;
    else window.location.href = "/login";
  },
  redirectToLogin(fromUrl) {
    const q = fromUrl ? `?from=${encodeURIComponent(fromUrl)}` : "";
    window.location.href = `/login${q}`;
  },
  async resetPasswordRequest(email) {
    return request("/api/auth/reset-password-request", {
      method: "POST",
      body: { email },
      auth: false,
    });
  },
  async resetPassword({ resetToken, newPassword }) {
    return request("/api/auth/reset-password", {
      method: "POST",
      body: { resetToken, newPassword },
      auth: false,
    });
  },
  async changePassword({ currentPassword, newPassword }) {
    return request("/api/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  },
  async loginWithProvider(_provider, _redirectPath = "/") {
    throw new Error("Social login is not available. Use email and password.");
  },
  async getEmailLog(limit = 50) {
    return request(`/api/auth/admin/email-log?limit=${limit}`);
  },
  async sendTestEmail() {
    return request("/api/auth/admin/email-test", { method: "POST" });
  },
};

const functions = {
  async invoke(name, body = {}) {
    const data = await request(`/api/functions/${name}`, {
      method: "POST",
      body,
    });
    return { data, ...data };
  },
};

const time = {
  now() {
    return request("/api/time/now");
  },
  zones() {
    return request("/api/time/zones");
  },
  listSchedules() {
    return request("/api/schedules");
  },
  listScheduleAudit(limit = 50) {
    return request(`/api/schedules/audit?limit=${limit}`);
  },
  previewSchedule(body) {
    return request("/api/schedules/preview", { method: "POST", body });
  },
  createSchedule(body) {
    return request("/api/schedules", { method: "POST", body });
  },
  pauseSchedule(id) {
    return request(`/api/schedules/${id}/pause`, { method: "POST" });
  },
  resumeSchedule(id) {
    return request(`/api/schedules/${id}/resume`, { method: "POST" });
  },
  tickSchedules() {
    return request("/api/schedules/tick", { method: "POST" });
  },
};

const entitlements = {
  me(characterId) {
    const q = characterId ? `?characterId=${encodeURIComponent(characterId)}` : "";
    return request(`/api/entitlements/me${q}`);
  },
  definitions() {
    return request("/api/entitlements/definitions");
  },
  check(key, characterId) {
    const q = characterId ? `?characterId=${encodeURIComponent(characterId)}` : "";
    return request(`/api/entitlements/check/${encodeURIComponent(key)}${q}`);
  },
  claimPurchase(body) {
    return request("/api/entitlements/claim-purchase", { method: "POST", body });
  },
  adminSearch(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request(`/api/entitlements/admin/search?${q}`);
  },
  adminGet(id) {
    return request(`/api/entitlements/admin/${id}`);
  },
  adminGrant(body) {
    return request("/api/entitlements/admin/grant", { method: "POST", body });
  },
  adminRevoke(id, body) {
    return request(`/api/entitlements/admin/${id}/revoke`, { method: "POST", body });
  },
  adminRestore(id, body) {
    return request(`/api/entitlements/admin/${id}/restore`, { method: "POST", body });
  },
  adminAudit(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request(`/api/entitlements/admin/audit?${q}`);
  },
  adminProducts() {
    return request("/api/entitlements/admin/products");
  },
};

const rewards = {
  definitions() {
    return request("/api/rewards/definitions");
  },
  pendingLoot(characterId) {
    const q = characterId ? `?characterId=${encodeURIComponent(characterId)}` : "";
    return request(`/api/rewards/pending-loot${q}`);
  },
  adminSearch(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request(`/api/rewards/admin/search?${q}`);
  },
  adminGet(id) {
    return request(`/api/rewards/admin/${id}`);
  },
  adminGrant(body) {
    return request("/api/rewards/admin/grant", { method: "POST", body });
  },
  adminRetryDelivery(id, body) {
    return request(`/api/rewards/admin/${id}/retry-delivery`, { method: "POST", body });
  },
  adminAudit(params = {}) {
    const q = new URLSearchParams(params).toString();
    return request(`/api/rewards/admin/audit/recent?${q}`);
  },
};

const arena = {
  previewChallenge(body) {
    return request("/api/arena/challenges/preview", { method: "POST", body });
  },
  createChallenge(body) {
    return request("/api/arena/challenges", { method: "POST", body });
  },
  getChallenge(id) {
    return request(`/api/arena/challenges/${encodeURIComponent(id)}`);
  },
  completeChallenge(id, body) {
    return request(`/api/arena/challenges/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      body,
    });
  },
};

const audit = {
  search(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== "") q.set(k, String(v));
    });
    return request(`/api/audit/admin/search?${q}`);
  },
  get(id) {
    return request(`/api/audit/admin/${encodeURIComponent(id)}`);
  },
  timeline(accountId, params = {}) {
    const q = new URLSearchParams(params).toString();
    return request(`/api/audit/admin/timeline/${encodeURIComponent(accountId)}${q ? `?${q}` : ""}`);
  },
  correlation(correlationId) {
    return request(`/api/audit/admin/correlation/${encodeURIComponent(correlationId)}`);
  },
  itemProvenance(itemId) {
    return request(`/api/audit/admin/item/${encodeURIComponent(itemId)}/provenance`);
  },
  annotate(id, body) {
    return request(`/api/audit/admin/${encodeURIComponent(id)}/annotations`, {
      method: "POST",
      body,
    });
  },
  export(body) {
    return request("/api/audit/admin/export", { method: "POST", body });
  },
  integrity(id) {
    return request(`/api/audit/admin/${encodeURIComponent(id)}/integrity`);
  },
};

const entitiesProxy = entityProxy();

export const api = {
  auth,
  entities: entitiesProxy,
  functions,
  time,
  entitlements,
  rewards,
  arena,
  audit,
  asServiceRole: {
    entities: entitiesProxy,
  },
};

if (typeof window !== "undefined") {
  window.__lootApi = { API_BASE, api };
}
