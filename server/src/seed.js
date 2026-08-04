import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db, nowIso } from "./db.js";
import { entities } from "./entities.js";

const email = process.env.SEED_EMAIL || "admin@loot.local";
const password = process.env.SEED_PASSWORD || "admin123";
const usingDefaultPassword = !process.env.SEED_PASSWORD;

async function main() {
  const existing = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (existing) {
    console.log(`Admin already exists: ${email}`);
  } else {
    if (usingDefaultPassword && process.env.NODE_ENV === "production") {
      console.error("[seed] Refusing default SEED_PASSWORD in production. Set SEED_PASSWORD.");
      process.exit(1);
    }
    if (usingDefaultPassword) {
      console.warn("[seed] WARNING: using default SEED_PASSWORD=admin123 — set SEED_PASSWORD for non-dev environments.");
    }
    const ts = nowIso();
    const id = nanoid();
    const hash = await bcrypt.hash(password, 10);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, email_verified, legacy_name, created_date, updated_date)
      VALUES (?, ?, ?, 'admin', 1, 'Founder', ?, ?)
    `).run(id, email, hash, ts, ts);
    entities.User.create({
      id,
      email,
      role: "admin",
      legacy_name: "Founder",
    }, { created_by_id: id, created_by: email });
    console.log(`Created admin user`);
    console.log(`  email:    ${email}`);
    console.log(`  password: ${password}`);
  }

  if (!entities.Nexus.filter({ singleton: true })[0]) {
    entities.Nexus.create({ singleton: true, status: "vulnerable", defense_streak: 0 });
    console.log("Seeded Nexus singleton");
  }

  if (!entities.ModerationConfig.filter({ singleton: true })[0]) {
    entities.ModerationConfig.create({ singleton: true, filtered_words: [] });
    console.log("Seeded ModerationConfig");
  }

  if (!entities.SiteConfig.list(null, 1)[0]) {
    entities.SiteConfig.create({ theme: {}, text_overrides: {} });
    console.log("Seeded SiteConfig");
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
