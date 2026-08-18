import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function expect(rel, pattern, message) {
  const text = read(rel);
  if (!pattern.test(text)) {
    failed++;
    console.error(`FAIL ${rel}: ${message}`);
  }
}

function reject(rel, pattern, message) {
  const text = read(rel);
  if (pattern.test(text)) {
    failed++;
    console.error(`FAIL ${rel}: ${message}`);
  }
}

expect(
  "server/src/auth.js",
  /token_use:\s*"nakama_gameplay"[\s\S]*subject:\s*nakamaUserId[\s\S]*issuer:[\s\S]*audience:[\s\S]*jwtid:/,
  "missing Nakama-subject gameplay JWT claims",
);
expect(
  "server/src/auth.js",
  /Math\.min\(GAMEPLAY_JWT_TTL_SEC,[\s\S]*remaining/,
  "gameplay JWT is not capped by Nakama expiry",
);
expect(
  "server/src/db.js",
  /UNIQUE INDEX[\s\S]*idx_users_nakama_user_id_unique[\s\S]*WHERE nakama_user_id IS NOT NULL/,
  "Nakama mapping is not uniquely constrained",
);
expect(
  "server/src/db.js",
  /character_creation_requests[\s\S]*PRIMARY KEY \(account_id, request_id\)/,
  "Character creation idempotency receipts missing",
);
expect(
  "server/src/index.js",
  /Character creation requires a valid request_id[\s\S]*X-Idempotent-Replay/,
  "Character create replay guard missing",
);
expect(
  "server/src/entityAccess.js",
  /type === "Character"[\s\S]*ownsDocViaCreatedBy/,
  "Character read ownership guard missing",
);
expect(
  "loot&lasers/Autoload/AuthManager.gd",
  /node_token_nakama_user_id[\s\S]*node_token_expires_at[\s\S]*refresh_node_gameplay_session/,
  "environment-bound gameplay-token lifecycle missing",
);
expect(
  "loot&lasers/Autoload/AuthManager.gd",
  /PATCH"[\s\S]*"\/api\/auth\/me"[\s\S]*active_character_id/,
  "selected Character is not persisted to Node",
);
reject(
  "loot&lasers/Autoload/AuthManager.gd",
  /ProfileManager\.set_selected_character_id/,
  "AuthManager still writes Nakama selected Character",
);
reject(
  "loot&lasers/Autoload/ApiClient.gd",
  /trying %s[\s\S]*127\.0\.0\.1:8787/,
  "staging can still fall back to a local gameplay database",
);
expect(
  "loot&lasers/Scenes/Main/main.gd",
  /ensure_nakama_session[\s\S]*has_node_gameplay_session[\s\S]*fetch_me[\s\S]*_leave_to_character_select/,
  "boot does not enforce auth → gameplay account → Character select order",
);
reject(
  "loot&lasers/Scenes/Main/main.gd",
  /fetch_active_mission/,
  "foundation boot still consults Nakama gameplay state",
);
expect(
  "docs/AUTH_FOUNDATION.md",
  /Nakama owns email authentication[\s\S]*Node maps that identity[\s\S]*Character loading sequence/,
  "foundation architecture documentation missing",
);
expect(
  "loot&lasers/Scripts/test_auth_foundation.gd",
  /AuthManager\.register[\s\S]*create_character[\s\S]*get_selected_character[\s\S]*AuthManager\.logout/,
  "GDScript end-to-end foundation test missing",
);

if (failed) {
  console.error(`AUTH_FOUNDATION_VERIFY_FAILED (${failed})`);
  process.exit(1);
}
console.log("AUTH_FOUNDATION_VERIFY_OK");
