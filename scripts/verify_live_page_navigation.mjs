import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GODOT_ROOT = path.join(ROOT, "loot&lasers");
const SHELL_PATH = path.join(GODOT_ROOT, "Scenes", "Main", "game_shell.gd");
const FRESH_PAGE_PATHS = [
  path.join("Scenes", "UI", "hub.gd"),
  path.join("Scenes", "UI", "stats.gd"),
  path.join("Scenes", "UI", "shop.gd"),
  path.join("Scenes", "UI", "arena.gd"),
  path.join("Scenes", "UI", "cantina.gd"),
  path.join("Scenes", "UI", "galaxy.gd"),
  path.join("Scenes", "UI", "mining.gd"),
  path.join("Scenes", "UI", "casino.gd"),
  path.join("Scenes", "UI", "crystal_store.gd"),
  path.join("Scenes", "UI", "progress.gd"),
  path.join("Scenes", "UI", "void.gd"),
  path.join("Scenes", "UI", "ship.gd"),
];
const CACHED_RENDER_CALLS = ["_populate()", "_render()"];
const PARALLEL_BOOT_PAGE_PATHS = [
  path.join("Scenes", "UI", "hub.gd"),
  path.join("Autoload", "StatsManager.gd"),
  path.join("Scenes", "UI", "shop.gd"),
  path.join("Scenes", "UI", "arena.gd"),
  path.join("Scenes", "UI", "cantina.gd"),
  path.join("Scenes", "UI", "galaxy.gd"),
  path.join("Scenes", "UI", "mining.gd"),
  path.join("Scenes", "UI", "casino.gd"),
  path.join("Scenes", "UI", "progress.gd"),
  path.join("Scenes", "UI", "void.gd"),
  path.join("Scenes", "UI", "guild.gd"),
  path.join("Scenes", "UI", "friends.gd"),
  path.join("Scenes", "UI", "leaderboard.gd"),
];

function read(relativePath) {
  return fs.readFileSync(path.join(GODOT_ROOT, relativePath), "utf8");
}

function functionBody(source, functionName) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`func ${functionName}(`));
  assert.notEqual(start, -1, `missing ${functionName}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("func "));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

const shell = fs.readFileSync(SHELL_PATH, "utf8");
assert.match(shell, /const RETAIN_RENDERED_PAGE_INSTANCES := false/);
assert.match(shell, /var _packed_cache: Dictionary = \{\}/);
assert.match(shell, /if _retains_page_instance\(outgoing_path\):/);
assert.match(shell, /if _retains_page_instance\(path\) and _page_instances\.has\(path\)/);

for (const relativePath of FRESH_PAGE_PATHS) {
  const source = read(relativePath);
  const ready = functionBody(source, "_ready");
  for (const cachedCall of CACHED_RENDER_CALLS) {
    assert.equal(
      ready.includes(cachedCall),
      false,
      `${relativePath} must not render cached data before its live boot`,
    );
  }

  if (source.includes("func _boot(")) {
    const boot = functionBody(source, "_boot");
    const firstAwait = boot.indexOf("await ");
    for (const cachedCall of CACHED_RENDER_CALLS) {
      const firstPaint = boot.indexOf(cachedCall);
      assert.equal(
        firstPaint !== -1 && (firstAwait === -1 || firstPaint < firstAwait),
        false,
        `${relativePath} must fetch live data before painting its page`,
      );
    }
  }
}

for (const relativePath of PARALLEL_BOOT_PAGE_PATHS) {
  assert.match(
    read(relativePath),
    /AsyncGroup\.new\(\)/,
    `${relativePath} must batch independent page-entry requests`,
  );
}

const friendsBoot = functionBody(read(path.join("Scenes", "UI", "friends.gd")), "_boot");
assert.equal(friendsBoot.includes("load_blocks()"), false, "friends boot must not fetch social state twice");

const arenaBoot = functionBody(read(path.join("Scenes", "UI", "arena.gd")), "_boot");
assert.equal(
  arenaBoot.includes("refresh_character()"),
  false,
  "arena boot must reuse the current character returned by SyncArenaDay",
);

console.log("Live page navigation freshness checks passed.");
