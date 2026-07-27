/** Mongo-style matchers used by the Base44 SDK frontend. */

function getPath(obj, key) {
  if (!key.includes(".")) return obj?.[key];
  return key.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function matchValue(actual, expected) {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    if ("$ne" in expected) return actual !== expected.$ne;
    if ("$in" in expected) return Array.isArray(expected.$in) && expected.$in.includes(actual);
    if ("$nin" in expected) return Array.isArray(expected.$nin) && !expected.$nin.includes(actual);
    if ("$gt" in expected) return actual > expected.$gt;
    if ("$gte" in expected) return actual >= expected.$gte;
    if ("$lt" in expected) return actual < expected.$lt;
    if ("$lte" in expected) return actual <= expected.$lte;
    if ("$exists" in expected) return expected.$exists ? actual !== undefined && actual !== null : actual === undefined || actual === null;
    // Nested object equality fallback
    return Object.keys(expected).every((k) => matchValue(actual?.[k], expected[k]));
  }
  return actual === expected;
}

export function matchesQuery(doc, query = {}) {
  if (!query || typeof query !== "object") return true;

  if (Array.isArray(query.$or)) {
    if (!query.$or.some((q) => matchesQuery(doc, q))) return false;
  }
  if (Array.isArray(query.$and)) {
    if (!query.$and.every((q) => matchesQuery(doc, q))) return false;
  }

  for (const [key, expected] of Object.entries(query)) {
    if (key === "$or" || key === "$and") continue;
    if (!matchValue(getPath(doc, key), expected)) return false;
  }
  return true;
}

export function sortDocs(docs, sort) {
  if (!sort) return docs;
  const desc = String(sort).startsWith("-");
  const field = desc ? String(sort).slice(1) : String(sort);
  return [...docs].sort((a, b) => {
    const av = getPath(a, field);
    const bv = getPath(b, field);
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}

/** Apply Mongo update operators or plain patch. */
export function applyUpdate(doc, update) {
  if (!update || typeof update !== "object") return { ...doc };
  if ("$set" in update || "$unset" in update || "$inc" in update || "$push" in update) {
    const next = { ...doc };
    if (update.$set && typeof update.$set === "object") Object.assign(next, update.$set);
    if (update.$unset && typeof update.$unset === "object") {
      for (const key of Object.keys(update.$unset)) delete next[key];
    }
    if (update.$inc && typeof update.$inc === "object") {
      for (const [k, v] of Object.entries(update.$inc)) next[k] = (Number(next[k]) || 0) + Number(v);
    }
    if (update.$push && typeof update.$push === "object") {
      for (const [k, v] of Object.entries(update.$push)) {
        const arr = Array.isArray(next[k]) ? [...next[k]] : [];
        arr.push(v);
        next[k] = arr;
      }
    }
    return next;
  }
  return { ...doc, ...update };
}
