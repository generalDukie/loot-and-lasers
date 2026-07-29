import { nanoid } from "nanoid";
import { db, nowIso } from "./db.js";
import { matchesQuery, sortDocs, applyUpdate } from "./query.js";
import { broadcastEntity } from "./realtime.js";
import { clampStardust } from "./shared/economyFormulas.js";

function rowToEntity(row) {
  if (!row) return null;
  const data = JSON.parse(row.data);
  return {
    ...data,
    id: row.id,
    created_by: row.created_by ?? data.created_by ?? null,
    created_by_id: row.created_by_id ?? data.created_by_id ?? null,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

/** Enforce currency ceilings before Character rows hit the DB. */
function normalizeEntity(type, entity) {
  if (type !== "Character" || !entity) return entity;
  if (Object.prototype.hasOwnProperty.call(entity, "stardust")) {
    entity.stardust = clampStardust(entity.stardust);
  }
  return entity;
}

function persist(type, entity, { emit = true, eventType = "update" } = {}) {
  const {
    id,
    created_by = null,
    created_by_id = null,
    created_date,
    updated_date,
    ...rest
  } = entity;

  const payload = {
    ...rest,
    id,
    created_by,
    created_by_id,
    created_date,
    updated_date,
  };

  db.prepare(`
    INSERT INTO entities (id, type, data, created_by, created_by_id, created_date, updated_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      created_by = excluded.created_by,
      created_by_id = excluded.created_by_id,
      updated_date = excluded.updated_date
  `).run(
    id,
    type,
    JSON.stringify(payload),
    created_by,
    created_by_id,
    created_date,
    updated_date
  );

  if (emit) broadcastEntity(type, eventType, payload);
  return payload;
}

export function createEntityStore(type) {
  return {
    type,

    list(sort = "-created_date", limit = 100) {
      const rows = db.prepare("SELECT * FROM entities WHERE type = ?").all(type);
      let docs = rows.map(rowToEntity);
      docs = sortDocs(docs, sort);
      if (limit != null) docs = docs.slice(0, Number(limit));
      return docs;
    },

    filter(query = {}, sort = "-created_date", limit = 100) {
      const rows = db.prepare("SELECT * FROM entities WHERE type = ?").all(type);
      let docs = rows.map(rowToEntity).filter((d) => matchesQuery(d, query));
      docs = sortDocs(docs, sort);
      if (limit != null) docs = docs.slice(0, Number(limit));
      return docs;
    },

    get(id) {
      const row = db.prepare("SELECT * FROM entities WHERE type = ? AND id = ?").get(type, id);
      return rowToEntity(row);
    },

    create(data = {}, opts = {}) {
      const ts = nowIso();
      const entity = normalizeEntity(type, {
        ...data,
        id: data.id || nanoid(),
        created_by: data.created_by ?? opts.created_by ?? null,
        created_by_id: data.created_by_id ?? opts.created_by_id ?? null,
        created_date: data.created_date || ts,
        updated_date: ts,
      });
      return persist(type, entity, { eventType: "create" });
    },

    update(id, update) {
      const existing = this.get(id);
      if (!existing) throw Object.assign(new Error(`${type} not found`), { status: 404 });
      const merged = normalizeEntity(type, applyUpdate(existing, update));
      merged.id = id;
      merged.created_date = existing.created_date;
      merged.created_by = existing.created_by;
      merged.created_by_id = existing.created_by_id;
      merged.updated_date = nowIso();
      return persist(type, merged, { eventType: "update" });
    },

    delete(id) {
      const existing = this.get(id);
      if (!existing) return null;
      db.prepare("DELETE FROM entities WHERE type = ? AND id = ?").run(type, id);
      broadcastEntity(type, "delete", existing);
      return existing;
    },

    deleteMany(query = {}) {
      const matches = this.filter(query, null, 100000);
      const del = db.prepare("DELETE FROM entities WHERE type = ? AND id = ?");
      for (const item of matches) del.run(type, item.id);
      for (const item of matches) broadcastEntity(type, "delete", item);
      return { deleted: matches.length };
    },

    updateMany(query = {}, update = {}) {
      const matches = this.filter(query, null, 100000);
      const updated = matches.map((m) => this.update(m.id, update));
      return updated;
    },

    bulkCreate(records = [], opts = {}) {
      return records.map((r) => this.create(r, opts));
    },
  };
}

const ENTITY_TYPES = [
  "AppNotification", "ArenaMatch", "Block", "Character", "ChatMessage", "DailyLogin",
  "FriendRequest", "Friendship", "GalaxyNews", "Guild", "GuildBattle",
  "GuildChallenge", "GuildLog", "GuildMember", "GuildWar", "GuildWarReady",
  "HubLayout", "Item", "Mail", "Mission", "ModerationConfig", "Nexus",
  "NexusAssault", "NexusHallOfFame", "NovaSpendEvent", "StardustSpendEvent", "PlayerModeration",
  "PlayerPresence", "PrivateConversation", "PrivateMessage", "PromoCode",
  "Report", "SiteConfig", "User",
];

export const entities = Object.fromEntries(
  ENTITY_TYPES.map((t) => [t, createEntityStore(t)])
);

/** Game service object for reward logic and server functions. */
export function createService(user = null) {
  const asServiceRole = {
    entities,
    auth: {
      me: async () => user,
    },
  };

  return {
    entities,
    asServiceRole,
    auth: {
      me: async () => user,
    },
  };
}
