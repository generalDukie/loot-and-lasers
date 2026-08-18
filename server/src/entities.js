import { nanoid } from "nanoid";
import { db, nowIso } from "./db.js";
import { matchesQuery, sortDocs, applyUpdate } from "./query.js";
import { broadcastEntity } from "./realtime.js";
import { clampStardust } from "./shared/economyFormulas.js";

const DEFAULT_ENTITY_QUERY_LIMIT = 100;
const BULK_MUTATION_QUERY_LIMIT = 100_000;
const ENTITY_FIELD_PATTERN = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;
const ROOT_COLUMNS = Object.freeze({
  id: "e.id",
  created_by: "e.created_by",
  created_by_id: "e.created_by_id",
  created_date: "e.created_date",
  updated_date: "e.updated_date",
});

function boundedNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function sqliteParameter(value) {
  return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

function jsonPathForField(field) {
  const key = String(field || "");
  if (!ENTITY_FIELD_PATTERN.test(key)) return null;
  return `$.${key}`;
}

function fieldExpression(field, _params = []) {
  const key = String(field || "");
  if (!ENTITY_FIELD_PATTERN.test(key)) return null;
  if (ROOT_COLUMNS[key]) return ROOT_COLUMNS[key];
  // The strict field allowlist makes this safe to inline and lets SQLite match
  // expression indexes; binding the JSON path forced a temporary full sort.
  return `json_extract(e.data, '${jsonPathForField(key)}')`;
}

function compileValuePredicate(field, expected) {
  const params = [];
  const expression = fieldExpression(field, params);
  if (!expression) return null;

  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    const operators = Object.keys(expected);
    if (operators.length !== 1) return null;
    const operator = operators[0];
    const value = expected[operator];
    if (operator === "$exists") {
      return {
        sql: `${expression} IS ${value ? "NOT " : ""}NULL`,
        params,
      };
    }
    if (operator === "$in" && Array.isArray(value)) {
      if (value.length === 0) return { sql: "0", params: [] };
      if (value.some((candidate) => candidate == null || typeof candidate === "object")) {
        return null;
      }
      params.push(...value);
      return {
        sql: `${expression} IN (${value.map(() => "?").join(", ")})`,
        params,
      };
    }
    const comparisons = {
      $gt: ">",
      $gte: ">=",
      $lt: "<",
      $lte: "<=",
    };
    if (comparisons[operator] && value != null && typeof value !== "object") {
      params.push(value);
      return { sql: `${expression} ${comparisons[operator]} ?`, params };
    }
    return null;
  }

  // SQLite JSON null and a missing property are both SQL NULL, while the
  // legacy matcher distinguishes them. Fall back to JavaScript for either.
  if (expected == null || typeof expected === "object") return null;

  // Preserve the entity API's Mongo-style scalar match against JSON arrays.
  if (!ROOT_COLUMNS[String(field)]) {
    const jsonPath = jsonPathForField(field);
    return {
      sql: `(${expression} = ? OR EXISTS (
        SELECT 1 FROM json_each(e.data, ?) AS array_value
        WHERE array_value.value = ?
      ))`,
      params: [expected, jsonPath, expected],
    };
  }
  params.push(expected);
  return { sql: `${expression} = ?`, params };
}

function compileQuery(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query)) return null;
  const clauses = [];
  const params = [];
  for (const [field, expected] of Object.entries(query)) {
    if (field === "$and" || field === "$or") {
      if (!Array.isArray(expected)) return null;
      const children = expected.map(compileQuery);
      if (children.some((child) => child == null)) return null;
      if (children.length === 0) {
        clauses.push(field === "$and" ? "1" : "0");
        continue;
      }
      clauses.push(`(${children.map((child) => child.sql).join(field === "$and" ? " AND " : " OR ")})`);
      for (const child of children) params.push(...child.params);
      continue;
    }
    const predicate = compileValuePredicate(field, expected);
    if (!predicate) return null;
    clauses.push(predicate.sql);
    params.push(...predicate.params);
  }
  return { sql: clauses.length ? clauses.join(" AND ") : "1", params };
}

function compileSort(sort) {
  if (!sort) return null;
  const raw = String(sort);
  const descending = raw.startsWith("-");
  const field = descending ? raw.slice(1) : raw;
  const params = [];
  const expression = fieldExpression(field, params);
  if (!expression) return null;
  return {
    sql: `(${expression} IS NULL) ASC, ${expression} ${descending ? "DESC" : "ASC"}, e.id ASC`,
    params: [...params, ...params],
  };
}

function queryRows(type, query, sort, limit, offset) {
  const compiledQuery = compileQuery(query);
  const compiledSort = compileSort(sort);
  if (!compiledQuery || (sort && !compiledSort)) return null;
  const safeOffset = boundedNonNegativeInteger(offset);
  const safeLimit = limit == null ? null : boundedNonNegativeInteger(limit, DEFAULT_ENTITY_QUERY_LIMIT);
  const orderSql = compiledSort ? ` ORDER BY ${compiledSort.sql}` : "";
  const limitSql = safeLimit == null ? "" : " LIMIT ? OFFSET ?";
  const params = [type, ...compiledQuery.params, ...(compiledSort?.params || [])];
  if (safeLimit != null) params.push(safeLimit, safeOffset);
  return db.prepare(`
    SELECT e.* FROM entities AS e
    WHERE e.type = ? AND (${compiledQuery.sql})${orderSql}${limitSql}
  `).all(...params.map(sqliteParameter));
}

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

function persist(type, entity, {
  emit = true,
  eventType = "update",
  previousEntity = null,
} = {}) {
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
  if (
    type === "Character" &&
    eventType === "update" &&
    guildMemberSnapshotChanged(previousEntity, payload)
  ) {
    syncGuildMemberSnapshot(payload);
  }
  return payload;
}

function guildMemberSnapshotChanged(previous, current) {
  if (!previous) return true;
  const previousLevel = Math.max(1, Number(previous.level) || 1);
  const currentLevel = Math.max(1, Number(current.level) || 1);
  return (
    previousLevel !== currentLevel ||
    String(previous.name || "") !== String(current.name || "")
  );
}

function syncGuildMemberSnapshot(character) {
  if (!character?.id) return;
  const rows = db.prepare(`
    SELECT * FROM entities
    WHERE type = 'GuildMember'
      AND json_extract(data, '$.character_id') = ?
  `).all(character.id);
  for (const row of rows) {
    let data;
    try {
      data = JSON.parse(row.data);
    } catch {
      continue;
    }
    if (String(data.character_id || "") !== String(character.id)) continue;
    const nextLevel = Math.max(1, Number(character.level) || 1);
    const nextName = character.name || data.character_name;
    if (
      Number(data.character_level || 0) === nextLevel &&
      String(data.character_name || "") === String(nextName || "")
    ) {
      continue;
    }
    persist(
      "GuildMember",
      {
        ...data,
        id: row.id,
        created_by: row.created_by,
        created_by_id: row.created_by_id,
        created_date: row.created_date,
        character_level: nextLevel,
        character_name: nextName,
        updated_date: nowIso(),
      },
      { eventType: "update" },
    );
  }
}

export function createEntityStore(type) {
  return {
    type,

    list(sort = "-created_date", limit = DEFAULT_ENTITY_QUERY_LIMIT, offset = 0) {
      const rows = queryRows(type, {}, sort, limit, offset);
      if (rows) return rows.map(rowToEntity);
      const allRows = db.prepare("SELECT * FROM entities WHERE type = ?").all(type);
      let docs = sortDocs(allRows.map(rowToEntity), sort);
      if (offset) docs = docs.slice(boundedNonNegativeInteger(offset));
      if (limit != null) docs = docs.slice(0, Number(limit));
      return docs;
    },

    filter(query = {}, sort = "-created_date", limit = DEFAULT_ENTITY_QUERY_LIMIT, offset = 0) {
      const rows = queryRows(type, query, sort, limit, offset);
      if (rows) return rows.map(rowToEntity);
      const allRows = db.prepare("SELECT * FROM entities WHERE type = ?").all(type);
      let docs = allRows.map(rowToEntity).filter((d) => matchesQuery(d, query));
      docs = sortDocs(docs, sort);
      if (offset) docs = docs.slice(boundedNonNegativeInteger(offset));
      if (limit != null) docs = docs.slice(0, Number(limit));
      return docs;
    },

    count(query = {}) {
      const compiled = compileQuery(query);
      if (!compiled) {
        return db.prepare("SELECT * FROM entities WHERE type = ?").all(type)
          .map(rowToEntity)
          .filter((doc) => matchesQuery(doc, query)).length;
      }
      return Number(db.prepare(`
        SELECT COUNT(*) AS count FROM entities AS e
        WHERE e.type = ? AND (${compiled.sql})
      `).get(type, ...compiled.params.map(sqliteParameter))?.count || 0);
    },

    searchText(field, term, sort = "-created_date", limit = DEFAULT_ENTITY_QUERY_LIMIT, offset = 0) {
      const fieldParams = [];
      const expression = fieldExpression(field, fieldParams);
      const compiledSort = compileSort(sort);
      if (!expression || (sort && !compiledSort)) return [];
      const safeLimit = boundedNonNegativeInteger(limit, DEFAULT_ENTITY_QUERY_LIMIT);
      const safeOffset = boundedNonNegativeInteger(offset);
      const orderSql = compiledSort ? ` ORDER BY ${compiledSort.sql}` : "";
      const params = [type, ...fieldParams, String(term || ""), ...(compiledSort?.params || []), safeLimit, safeOffset];
      return db.prepare(`
        SELECT e.* FROM entities AS e
        WHERE e.type = ?
          AND instr(search_normalize(CAST(${expression} AS TEXT)), search_normalize(?)) > 0
        ${orderSql} LIMIT ? OFFSET ?
      `).all(...params).map(rowToEntity);
    },

    ranked(sortFields, limit = DEFAULT_ENTITY_QUERY_LIMIT, offset = 0) {
      if (!Array.isArray(sortFields) || sortFields.length === 0) return [];
      const clauses = [];
      const params = [];
      for (const spec of sortFields) {
        const field = Array.isArray(spec) ? spec[0] : spec?.field;
        const direction = String(Array.isArray(spec) ? spec[1] : spec?.direction).toLowerCase();
        const collation = !Array.isArray(spec) && spec?.collation === "nocase"
          ? " COLLATE NOCASE"
          : "";
        const fieldParams = [];
        const rawExpression = fieldExpression(field, fieldParams);
        if (!rawExpression || !["asc", "desc"].includes(direction)) return [];
        const hasDefault = !Array.isArray(spec)
          && Object.prototype.hasOwnProperty.call(spec, "defaultValue");
        const integerCast = !Array.isArray(spec) && spec?.cast === "integer";
        let expression = rawExpression;
        if (integerCast) {
          const defaultValue = Number(spec.defaultValue);
          if (hasDefault && !Number.isSafeInteger(defaultValue)) return [];
          expression = hasDefault
            ? `CAST(COALESCE(${rawExpression}, ${defaultValue}) AS INTEGER)`
            : `CAST(${rawExpression} AS INTEGER)`;
        } else if (hasDefault) {
          expression = `COALESCE(${rawExpression}, ?)`;
        }
        const nullable = Array.isArray(spec) || spec?.nullable !== false;
        if (!nullable || hasDefault) {
          clauses.push(`${expression}${collation} ${direction.toUpperCase()}`);
          params.push(...fieldParams);
          if (hasDefault && !integerCast) params.push(sqliteParameter(spec.defaultValue));
        } else {
          clauses.push(`(${expression} IS NULL) ASC, ${expression}${collation} ${direction.toUpperCase()}`);
          params.push(...fieldParams, ...fieldParams);
        }
      }
      const safeLimit = boundedNonNegativeInteger(limit, DEFAULT_ENTITY_QUERY_LIMIT);
      const safeOffset = boundedNonNegativeInteger(offset);
      return db.prepare(`
        SELECT e.* FROM entities AS e
        WHERE e.type = ?
        ORDER BY ${clauses.join(", ")}
        LIMIT ? OFFSET ?
      `).all(type, ...params, safeLimit, safeOffset).map(rowToEntity);
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
      return persist(type, entity, {
        eventType: "create",
        emit: opts.emit !== false,
      });
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
      return persist(type, merged, { eventType: "update", previousEntity: existing });
    },

    delete(id) {
      const existing = this.get(id);
      if (!existing) return null;
      db.prepare("DELETE FROM entities WHERE type = ? AND id = ?").run(type, id);
      broadcastEntity(type, "delete", existing);
      return existing;
    },

    deleteMany(query = {}) {
      const matches = this.filter(query, null, BULK_MUTATION_QUERY_LIMIT);
      const del = db.prepare("DELETE FROM entities WHERE type = ? AND id = ?");
      for (const item of matches) del.run(type, item.id);
      for (const item of matches) broadcastEntity(type, "delete", item);
      return { deleted: matches.length };
    },

    updateMany(query = {}, update = {}) {
      const matches = this.filter(query, null, BULK_MUTATION_QUERY_LIMIT);
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
