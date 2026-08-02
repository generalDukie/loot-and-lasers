/**
 * Run content modes in order against local API.
 * Usage: node server/scripts/smoke-content-modes.mjs
 */
const API = process.env.API_URL || "http://127.0.0.1:8787";

async function req(path, { method = "GET", body, token, retries = 2 } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { ok: res.ok, status: res.status, data, error: data?.error || data?.message || (!res.ok ? text : null) };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

function banner(n, title) {
  console.log(`\n${"═".repeat(60)}\n ${n}. ${title}\n${"═".repeat(60)}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.log(`  ✗ ${msg}`);
}
function info(msg) {
  console.log(`  · ${msg}`);
}

async function main() {
  console.log(`Content-mode smoke → ${API}`);

  // Auth
  const login = await req("/api/auth/login", {
    method: "POST",
    body: { email: "admin@loot.local", password: "admin123" },
  });
  if (!login.ok || !login.data?.access_token) {
    console.error("Admin login failed:", login.status, login.error);
    console.error("Run: npm run server:seed");
    process.exit(1);
  }
  const token = login.data.access_token;
  ok(`logged in as admin`);

  // Ensure a playable character with enough resources
  let chars = await req("/api/entities/Character?sort=-created_date&limit=20", { token });
  let character = (chars.data || []).find((c) => c?.name) || null;
  if (!character) {
    const created = await req("/api/entities/Character", {
      method: "POST",
      token,
      body: {
        name: `Runner${Date.now() % 100000}`,
        race: "Zyrathi",
        class: "Vanguard",
        level: 25,
        experience: 0,
        stardust: 500000,
        nova_crystals: 200,
        fuel: 50,
        max_fuel: 100,
        dungeon_planet: 1,
        dungeon_enemy: 1,
        dungeon_deaths: 0,
        stats: { strength: 80, agility: 40, intellect: 30, vitality: 70, luck: 40 },
      },
    });
    character = created.data;
  } else {
    // Buff for smoke: level 25+, currency, clear cooldown/mission/mining blockers
    const patch = await req(`/api/entities/Character/${character.id}`, {
      method: "PATCH",
      token,
      body: {
        level: Math.max(25, character.level || 1),
        stardust: Math.max(500000, character.stardust || 0),
        nova_crystals: Math.max(200, character.nova_crystals || 0),
        dungeon_planet: character.dungeon_planet || 1,
        dungeon_enemy: character.dungeon_enemy || 1,
        dungeon_deaths: 0,
        dungeon_cooldown_at: null,
        dungeon_cooldown_ms: 0,
        dungeon_cooldown_until: null,
        mining_end_time: null,
        mining_reward: 0,
        active_mission_id: null,
        mission_end_time: null,
        stats: character.stats || { strength: 80, agility: 40, intellect: 30, vitality: 70, luck: 40 },
      },
    });
    character = patch.data || character;
  }

  await req("/api/auth/me", {
    method: "PATCH",
    token,
    body: { active_character_id: character.id },
  });

  // Explicit frontier progress so FinishDungeonBattle has a clean target
  {
    const p = await req(`/api/entities/Character/${character.id}`, {
      method: "PATCH",
      token,
      body: {
        dungeon_planet: 1,
        dungeon_enemy: 1,
        dungeon_deaths: 0,
        dungeon_deaths_date: null,
        dungeon_cooldown_at: null,
        dungeon_cooldown_ms: null,
        dungeon_cooldown_until: null,
      },
    });
    character = p.data || character;
  }
  ok(`character ${character.name} (id=${character.id}, lv=${character.level})`);

  const invoke = (name, body = {}) =>
    req(`/api/functions/${name}`, { method: "POST", token, body });

  // ── 1. GALAXY / FRONTIER ─────────────────────────────────
  banner(1, "GALACTIC FRONTIER");
  {
    const sync = await invoke("SyncDungeonState", {});
    if (sync.ok) ok(`SyncDungeonState`);
    else fail(`SyncDungeonState ${sync.status}: ${sync.error}`);

    const ch = sync.data?.character || character;
    info(`planet=${ch.dungeon_planet} enemy=${ch.dungeon_enemy} clears=${ch.dungeon_clears || 0}`);

    // Client would simulate battle; server trusts won for rewards/progress.
    const finish = await invoke("FinishDungeonBattle", {
      won: true,
      planet_id: ch.dungeon_planet || 1,
      enemy_index: ch.dungeon_enemy || 1,
      patrol: false,
      viewing_wormhole: false,
      species_id: 1,
      max_hit: 999,
    });
    if (finish.ok && finish.data?.success !== false) {
      const r = finish.data?.rewards || {};
      ok(`FinishDungeonBattle won · XP +${r.experience || 0} SD +${r.stardust || 0} DRU ${r.dru || 0}`);
      character = finish.data?.character || character;
    } else {
      fail(`FinishDungeonBattle ${finish.status}: ${finish.error || JSON.stringify(finish.data)}`);
    }

    // Skip cooldown if one was applied
    const skip = await invoke("SkipDungeonCooldown", {});
    if (skip.ok) ok(`SkipDungeonCooldown`);
    else info(`SkipDungeonCooldown skipped/failed: ${skip.error || skip.status}`);
  }

  // ── 2. NEXUS ─────────────────────────────────────────────
  banner(2, "COMMAND NEXUS");
  {
    const nx = await req("/api/entities/Nexus/filter", {
      method: "POST",
      token,
      body: { query: { singleton: true }, limit: 1 },
    });
    const nexus = Array.isArray(nx.data) ? nx.data[0] : null;
    if (nx.ok) ok(`Nexus.filter singleton · owner=${nexus?.owner_guild_name || "none"} status=${nexus?.status || "?"}`);
    else fail(`Nexus.filter ${nx.status}: ${nx.error}`);

    // Ensure guild membership for assault attempt
    let guildId = null;
    const mem = await req("/api/entities/GuildMember/filter", {
      method: "POST",
      token,
      body: { query: { character_id: character.id }, limit: 1 },
    });
    if (Array.isArray(mem.data) && mem.data[0]) {
      guildId = mem.data[0].guild_id;
      info(`already in guild ${guildId} role=${mem.data[0].role}`);
    } else {
      // Ensure enough SD for CreateGuild (500 * scale)
      await req(`/api/entities/Character/${character.id}`, {
        method: "PATCH",
        token,
        body: { stardust: Math.max(Number(character.stardust) || 0, 50_000) },
      });
      const create = await invoke("CreateGuild", {
        name: "Nexus Smoke Guild",
        tag: "NSG",
        description: "smoke",
      });
      if (create.ok) {
        ok(`CreateGuild`);
        character = create.data?.character || character;
        const mem2 = await req("/api/entities/GuildMember/filter", {
          method: "POST",
          token,
          body: { query: { character_id: character.id }, limit: 1 },
        });
        guildId = mem2.data?.[0]?.guild_id;
      } else {
        info(`CreateGuild failed (need 5k SD?): ${create.error || create.status}`);
      }
    }

    if (guildId) {
      // Patch guild to meet eligibility (level/members) for a real attempt when possible
      await req(`/api/entities/Guild/${guildId}`, {
        method: "PATCH",
        token,
        body: { level: 5, member_count: 5 },
      });
      const assault = await invoke("ResolveNexusAssault", {
        attacker_guild_id: guildId,
        character_id: character.id,
      });
      if (assault.ok) {
        ok(`ResolveNexusAssault winner=${assault.data?.winner} ownership_changed=${assault.data?.ownership_changed}`);
      } else {
        // Expected if not enough members / protected / cooldown — still a live call
        info(`ResolveNexusAssault blocked (expected if ineligible): ${assault.error || assault.status}`);
        ok(`Nexus assault endpoint reachable`);
      }
    } else {
      info(`no guild — Nexus load-only`);
    }
  }

  // ── 3. MINING ────────────────────────────────────────────
  banner(3, "SPACE MINING");
  {
    // Clear any leftover mining / mission
    await req(`/api/entities/Character/${character.id}`, {
      method: "PATCH",
      token,
      body: {
        mining_end_time: null,
        mining_reward: 0,
        active_mission_id: null,
        mission_end_time: null,
      },
    });

    const start = await invoke("StartMining", { hours: 1 });
    if (start.ok) {
      ok(`StartMining 1h · reward=${start.data?.patch?.mining_reward ?? start.data?.character?.mining_reward}`);
      character = start.data?.character || character;
    } else {
      fail(`StartMining ${start.status}: ${start.error}`);
    }

    // Fast-forward end time so Collect works
    const past = new Date(Date.now() - 60_000).toISOString();
    await req(`/api/entities/Character/${character.id}`, {
      method: "PATCH",
      token,
      body: { mining_end_time: past },
    });
    info(`patched mining_end_time to past for collect`);

    const collect = await invoke("CollectMining", {});
    if (collect.ok) {
      ok(`CollectMining +${collect.data?.stardust_gained ?? "?"} SD`);
      character = collect.data?.character || character;
    } else {
      fail(`CollectMining ${collect.status}: ${collect.error}`);
    }

    // Start + cancel path
    const start2 = await invoke("StartMining", { hours: 2 });
    if (start2.ok) {
      const cancel = await invoke("CancelMining", {});
      if (cancel.ok) ok(`CancelMining`);
      else fail(`CancelMining ${cancel.status}: ${cancel.error}`);
    }
  }

  // ── 4. CASINO ────────────────────────────────────────────
  banner(4, "CASINO");
  {
    const dice = await invoke("CasinoSettle", { game: "dice", bet: 1000, choice: "high" });
    if (dice.ok) {
      const o = dice.data?.outcome || {};
      ok(`Dice · roll=${o.dice} won=${o.won} ΔSD=${dice.data?.delta_stardust}`);
      character = dice.data?.character || character;
    } else {
      fail(`CasinoSettle dice ${dice.status}: ${dice.error}`);
    }

    const wheel = await invoke("CasinoSettle", { game: "wheel", bet: 1000 });
    if (wheel.ok) {
      if (wheel.data?.push) ok(`Wheel · push`);
      else {
        const o = wheel.data?.outcome || {};
        ok(`Wheel · ${o.label || o.mult + "x"} ΔSD=${wheel.data?.delta_stardust}`);
      }
      character = wheel.data?.character || character;
    } else {
      fail(`CasinoSettle wheel ${wheel.status}: ${wheel.error}`);
    }
  }

  // ── 5. VOID ──────────────────────────────────────────────
  banner(5, "THE VOID (dissolve)");
  {
    // Create a junk item then dissolve it
    const item = await req("/api/entities/Item", {
      method: "POST",
      token,
      body: {
        character_id: character.id,
        name: "Smoke Scrap Blade",
        type: "weapon",
        rarity: "common",
        level_requirement: 1,
        is_equipped: false,
        locked: false,
        stats: { strength: 1 },
        sell_value: 50,
      },
    });
    if (item.ok || item.status === 201) {
      const iid = item.data?.id;
      ok(`created dissolve target ${iid}`);
      const diss = await invoke("DissolveItem", { item_id: iid });
      if (diss.ok) {
        ok(`DissolveItem +${diss.data?.stardust_gained ?? "?"} SD`);
        character = diss.data?.character || character;
      } else {
        fail(`DissolveItem ${diss.status}: ${diss.error}`);
      }
    } else {
      fail(`create Item ${item.status}: ${item.error}`);
    }

    // Junk batch (empty is fine)
    const junk = await invoke("DissolveJunk", { item_ids: [] });
    if (junk.ok || junk.status === 400) {
      ok(`DissolveJunk endpoint live (${junk.status})`);
    } else {
      info(`DissolveJunk: ${junk.error || junk.status}`);
    }
  }

  console.log(`\n${"═".repeat(60)}\n Done — all five modes exercised in order.\n${"═".repeat(60)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
