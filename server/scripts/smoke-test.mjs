/**
 * API smoke test for Loot & Lasers local backend.
 * Run: node scripts/smoke-test.mjs
 */
const API = process.env.API_URL || "http://localhost:8787";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

/** Letter-only names (no digits/spaces) — matches server nameRules. */
function alphaName(prefix = "Smoke") {
  const letters = Array.from({ length: 8 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join("");
  return `${prefix}${letters}`;
}

async function req(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log(`\nSmoke test → ${API}\n`);

  // Health
  {
    const r = await req("/health", { method: "GET" });
    assert(r.ok && r.data?.ok, `health (${r.status})`);
  }

  // Public settings (AuthContext boot)
  {
    const r = await req("/api/auth/public-settings");
    assert(r.ok && r.data?.public_settings?.auth_required, "public settings");
  }

  // Login admin
  let token;
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      body: { email: "admin@loot.local", password: "admin123" },
    });
    token = r.data?.access_token;
    assert(r.ok && token, `admin login (${r.status})`);
  }

  // Me
  let user;
  {
    const r = await req("/api/auth/me", { token });
    user = r.data;
    assert(r.ok && user?.id, "auth/me");
  }

  // Register new user (dev returns otp_dev; production falls back to admin token)
  const email = `smoke_${Date.now()}@test.local`;
  const password = "test1234";
  let smokeToken;
  {
    const reg = await req("/api/auth/register", {
      method: "POST",
      body: { email, password },
    });
    const otp = reg.data?.otp_dev;
    if (reg.ok && otp) {
      assert(true, `register (${reg.status})`);
      const ver = await req("/api/auth/verify-otp", {
        method: "POST",
        body: { email, otpCode: otp },
      });
      smokeToken = ver.data?.access_token;
      assert(ver.ok && smokeToken, `verify-otp (${ver.status})`);
    } else {
      assert(reg.ok, `register (${reg.status}, production — no otp_dev)`);
      smokeToken = token;
      assert(!!smokeToken, "using admin token for entity tests");
    }
  }

  // Character create (letter-only name + live class id)
  let character;
  {
    const name = alphaName("Smoke");
    const r = await req("/api/entities/Character", {
      method: "POST",
      token: smokeToken,
      body: {
        name,
        race: "human",
        class: "Vanguard",
        nova_crystals: 100,
      },
    });
    character = r.data;
    assert(r.status === 201 && character?.id, `create character (${r.status})`);

    await req("/api/auth/me", {
      method: "PATCH",
      token: smokeToken,
      body: { active_character_id: character.id },
    });
  }

  // Character filter by name
  {
    const r = await req("/api/entities/Character/filter", {
      method: "POST",
      token: smokeToken,
      body: { query: { name: character.name }, limit: 1 },
    });
    assert(r.ok && r.data?.[0]?.id === character.id, "character filter by name");
  }

  // Missions: players cannot invent rows; admin seeds, player lists
  let mission;
  {
    const blocked = await req("/api/entities/Mission", {
      method: "POST",
      token: smokeToken,
      body: {
        character_id: character.id,
        status: "in_progress",
        name: "Player Forged",
        rewards: { stardust: 50 },
        end_time: new Date(Date.now() - 1000).toISOString(),
      },
    });
    assert(blocked.status === 403, `player mission create blocked (${blocked.status})`);

    const r = await req("/api/entities/Mission", {
      method: "POST",
      token,
      body: {
        character_id: character.id,
        status: "in_progress",
        name: "Smoke Mission",
        location: "Test Range",
        sector: 1,
        rewards: { loot_drops: false, stardust: 50, experience: 10 },
        end_time: new Date(Date.now() - 1000).toISOString(),
      },
    });
    mission = r.data;
    assert(r.status === 201 && mission?.id, `admin create mission (${r.status})`);

    const list = await req("/api/entities/Mission/filter", {
      method: "POST",
      token: smokeToken,
      body: { query: { character_id: character.id, status: "in_progress" } },
    });
    assert(list.ok && list.data?.some((m) => m.id === mission.id), "mission filter");
  }

  // Mail + claim (players cannot forge reward mail — admin seeds attachment)
  let mail;
  {
    const forged = await req("/api/entities/Mail", {
      method: "POST",
      token: smokeToken,
      body: {
        owner_id: character.id,
        subject: "Forged rewards",
        body: "Should strip rewards",
        has_rewards: true,
        rewards: { stardust: 25 },
        read: false,
        claimed: false,
      },
    });
    assert(
      forged.status === 201 && forged.data?.has_rewards === false,
      `player mail strips forged rewards (${forged.status})`
    );

    const r = await req("/api/entities/Mail", {
      method: "POST",
      token,
      body: {
        owner_id: character.id,
        subject: "Smoke test",
        body: "Rewards inside",
        has_rewards: true,
        rewards: { stardust: 25 },
        read: false,
        claimed: false,
      },
    });
    mail = r.data;
    assert(r.status === 201 && mail?.id && mail.has_rewards === true, `admin create reward mail (${r.status})`);

    const claim = await req("/api/functions/ClaimMailReward", {
      method: "POST",
      token: smokeToken,
      body: { mail_id: mail.id },
    });
    assert(claim.ok && claim.data?.success, `ClaimMailReward (${claim.status})`);
  }

  // Daily login
  {
    const r = await req("/api/functions/ClaimDailyLogin", {
      method: "POST",
      token: smokeToken,
    });
    assert(r.ok && r.data?.success, `ClaimDailyLogin (${r.status})`);
  }

  // Achievements sync
  {
    const r = await req("/api/functions/SyncAchievements", {
      method: "POST",
      token: smokeToken,
    });
    assert(r.ok, `SyncAchievements (${r.status})`);
  }

  // Global chat
  {
    const r = await req("/api/functions/SendMessage", {
      method: "POST",
      token: smokeToken,
      body: { channel: "global", content: "smoke test hello" },
    });
    assert(r.ok && r.data?.message, `SendMessage global (${r.status})`);
  }

  // Guild create + member
  {
    const tag = alphaName("SG").slice(0, 4);
    const g = await req("/api/entities/Guild", {
      method: "POST",
      token: smokeToken,
      body: {
        name: alphaName("SmokeGuild"),
        tag,
        leader_id: character.id,
        member_count: 1,
        recruiting: true,
        public_listing: true,
      },
    });
    assert(g.status === 201 && g.data?.id, `create guild (${g.status})`);

    const m = await req("/api/entities/GuildMember", {
      method: "POST",
      token: smokeToken,
      body: {
        guild_id: g.data.id,
        character_id: character.id,
        character_name: character.name,
        role: "leader",
      },
    });
    assert(m.status === 201 && m.data?.id, `guild member (${m.status})`);
  }

  // Item CRUD: players cannot invent/delete items; admin + DissolveItem is the path
  {
    const blocked = await req("/api/entities/Item", {
      method: "POST",
      token: smokeToken,
      body: { character_id: character.id, name: "junk", type: "material", rarity: "common" },
    });
    assert(blocked.status === 403, `player item create blocked (${blocked.status})`);

    const item = await req("/api/entities/Item", {
      method: "POST",
      token,
      body: {
        character_id: character.id,
        owner_id: user.id,
        name: "Smoke Junk",
        type: "material",
        rarity: "common",
        sell_value: 5,
        is_equipped: false,
      },
    });
    assert(item.status === 201 && item.data?.id, `admin create item (${item.status})`);

    const dissolve = await req("/api/functions/DissolveItem", {
      method: "POST",
      token: smokeToken,
      body: { item_id: item.data.id },
    });
    assert(dissolve.ok && dissolve.data?.success !== false, `DissolveItem (${dissolve.status})`);
  }

  // updateMany with $set
  {
    const conv = await req("/api/entities/PrivateConversation", {
      method: "POST",
      token: smokeToken,
      body: { participant_ids: [character.id, "other"], last_message_at: new Date().toISOString() },
    });
    const msg = await req("/api/entities/PrivateMessage", {
      method: "POST",
      token: smokeToken,
      body: {
        conversation_id: conv.data.id,
        sender_id: "other",
        recipient_id: character.id,
        content: "hi",
        read_by_recipient: false,
      },
    });
    const um = await req("/api/entities/PrivateMessage/update-many", {
      method: "POST",
      token: smokeToken,
      body: {
        query: { conversation_id: conv.data.id, recipient_id: character.id },
        update: { $set: { read_by_recipient: true } },
      },
    });
    const updatedCount = Array.isArray(um.data) ? um.data.length : um.data?.updated;
    assert(um.ok && updatedCount >= 1, `updateMany $set (${um.status})`);
    assert(msg.ok, `private message create (${msg.status})`);
  }

  // Promo code (admin)
  {
    const r = await req("/api/functions/RedeemPromoCode", {
      method: "POST",
      token: smokeToken,
      body: { code: "INVALID_CODE_XYZ" },
    });
    assert(r.status === 404 || r.status === 400, `RedeemPromoCode rejects invalid (${r.status})`);
  }

  // Entity list (leaderboard)
  {
    const r = await req("/api/entities/Character?sort=-created_date&limit=10", { token });
    assert(r.ok && Array.isArray(r.data), "character list");
  }

  // Friendship array containment filter (second account — slot limit is 1 per user)
  {
    const email2 = `smoke_friend_${Date.now()}@test.local`;
    const reg2 = await req("/api/auth/register", {
      method: "POST",
      body: { email: email2, password },
    });
    const otp2 = reg2.data?.otp_dev;
    let friendToken = smokeToken;
    if (reg2.ok && otp2) {
      const ver2 = await req("/api/auth/verify-otp", {
        method: "POST",
        body: { email: email2, otpCode: otp2 },
      });
      friendToken = ver2.data?.access_token || smokeToken;
    }
    const other = await req("/api/entities/Character", {
      method: "POST",
      token: friendToken,
      body: { name: alphaName("Friend"), race: "human", class: "Shadow Operative" },
    });
    assert(other.status === 201 && other.data?.id, `friend character (${other.status})`);

    const friendship = await req("/api/entities/Friendship", {
      method: "POST",
      token: smokeToken,
      body: { participant_ids: [character.id, other.data.id] },
    });
    const found = await req("/api/entities/Friendship/filter", {
      method: "POST",
      token: smokeToken,
      body: { query: { participant_ids: character.id } },
    });
    assert(
      friendship.status === 201 && found.ok && found.data?.some((f) => f.id === friendship.data?.id),
      "friendship filter by participant_ids"
    );
  }

  // Unauthorized
  {
    const r = await req("/api/auth/me");
    assert(r.status === 401, "unauthorized blocked");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
