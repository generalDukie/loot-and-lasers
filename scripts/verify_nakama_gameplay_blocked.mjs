/**
 * Critical authority gate — Godot must not call Nakama gameplay RPCs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function expect(rel, pattern, message) {
  if (!pattern.test(read(rel))) {
    failed += 1;
    console.error(`FAIL ${rel}: ${message}`);
  } else {
    console.log(`PASS ${message}`);
  }
}

function reject(rel, pattern, message) {
  if (pattern.test(read(rel))) {
    failed += 1;
    console.error(`FAIL ${rel}: ${message}`);
  } else {
    console.log(`PASS ${message}`);
  }
}

expect(
  "loot&lasers/Autoload/NakamaManager.gd",
  /ALLOWED_CLIENT_RPCS[\s\S]*"config_get"\s*:\s*true/,
  "NakamaManager allowlists only config_get",
);
expect(
  "loot&lasers/Autoload/NakamaManager.gd",
  /gameplay authority is Node only/,
  "NakamaManager blocks non-allowlisted RPCs",
);
reject(
  "loot&lasers/Autoload/MissionManager.gd",
  /invoke_rpc\(\s*["']mission_/,
  "MissionManager must not invoke Nakama mission RPCs",
);
reject(
  "loot&lasers/Autoload/EquipmentManager.gd",
  /invoke_rpc\(\s*["']equipment_/,
  "EquipmentManager must not invoke Nakama equipment RPCs",
);
reject(
  "loot&lasers/Autoload/InventoryManager.gd",
  /invoke_rpc\(\s*["']inventory_/,
  "InventoryManager must not invoke Nakama inventory RPCs",
);
reject(
  "loot&lasers/Autoload/ProfileManager.gd",
  /invoke_rpc\(\s*["']profile_/,
  "ProfileManager must not invoke Nakama profile RPCs",
);
expect(
  "loot&lasers/Autoload/AuthManager.gd",
  /EquipItem[\s\S]*UnequipItem/,
  "AuthManager equips via Node",
);
expect(
  "server/src/auth.js",
  /if \(IS_PROD\) return \{\}/,
  "Production never returns OTP/reset extras",
);
expect(
  "server/src/entityAccess.js",
  /case "Guild":[\s\S]*case "NexusAssault":[\s\S]*return false/,
  "Guild/Nexus client create locked",
);
reject(
  "loot&lasers/Autoload/ArenaManager.gd",
  /invoke_rpc\(\s*["']arena_/,
  "ArenaManager must not invoke Nakama arena RPCs",
);
expect(
  "modules/arena.lua",
  /rpc_arena_gameplay_blocked/,
  "Nakama Arena RPCs are registered as gameplay-blocked",
);
reject(
  "loot&lasers/Autoload/ArenaManager.gd",
  /"is_free"\s*:/,
  "Godot Arena prepare/finish does not send is_free",
);
expect(
  "server/src/functions/economyFollowOn.js",
  /LOOT_ENVIRONMENT[\s\S]*CRYSTAL_PACK_DEV_GRANT/,
  "Crystal pack staging requires explicit opt-in",
);

console.log(failed ? `\n${failed} failure(s)` : "\nAll critical authority gates OK");
process.exit(failed ? 1 : 0);
