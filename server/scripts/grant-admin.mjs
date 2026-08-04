/**
 * Promote existing accounts to role=admin by email.
 * Usage: node server/scripts/grant-admin.mjs email1 email2 ...
 */
import { db, nowIso } from "../src/db.js";

const emails = process.argv.slice(2).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean);
if (!emails.length) {
  console.error("Usage: node server/scripts/grant-admin.mjs <email> [email...]");
  process.exit(1);
}

const results = [];
for (const email of emails) {
  const row = db.prepare("SELECT id, email, role FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (!row) {
    results.push({ email, status: "missing" });
    continue;
  }
  if (row.role === "admin") {
    results.push({ email: row.email, id: row.id, status: "already_admin" });
    continue;
  }
  const ts = nowIso();
  const before = row.role;
  db.prepare("UPDATE users SET role = ?, updated_date = ? WHERE id = ?").run("admin", ts, row.id);

  const doc = db.prepare("SELECT data FROM documents WHERE type = ? AND id = ?").get("User", row.id);
  if (doc?.data) {
    try {
      const data = JSON.parse(doc.data);
      data.role = "admin";
      data.updated_date = ts;
      db.prepare("UPDATE documents SET data = ?, updated_date = ? WHERE type = ? AND id = ?")
        .run(JSON.stringify(data), ts, "User", row.id);
    } catch (err) {
      results.push({
        email: row.email,
        id: row.id,
        status: "users_promoted_entity_sync_failed",
        before,
        error: String(err?.message || err),
      });
      continue;
    }
  }

  const after = db.prepare("SELECT role FROM users WHERE id = ?").get(row.id)?.role;
  results.push({ email: row.email, id: row.id, status: "promoted", before, after });
}

console.log(JSON.stringify(results, null, 2));
const missing = results.filter((r) => r.status === "missing");
if (missing.length) process.exitCode = 2;
