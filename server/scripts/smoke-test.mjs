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

  // Character create
  let character;
  {
    const name = `Smoke${Date.now() % 100000}`;
    const r = await req("/api/entities/Character", {
      method: "POST",
      token: smokeToken,
      body: {
        name,
        race: "human",
        class: "soldier",
        level: 1,
        experience: 0,
        stardust: 0,
        nova_crystals: 100,
        fuel: 10,
        max_fuel: 10,
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

  // Mission create + filter
  let mission;
  {
    const r = await req("/api/entities/Mission", {
      method: "POST",
      token: smokeToken,
      body: {
        character_id: character.id,
        status: "active",
        mission_type: "explore",
        rewards: { stardust: 50, experience: 10 },
        end_time: new Date(Date.now() - 1000).toISOString(),
      },
    });
    mission = r.data;
    assert(r.status === 201 && mission?.id, `create mission (${r.status})`);

    const list = await req("/api/entities/Mission/filter", {
      method: "POST",
      token: smokeToken,
      body: { query: { character_id: character.id, status: "active" } },
    });
    assert(list.ok && list.data?.length >= 1, "mission filter");
  }

  // Mail + claim
  let mail;
  {
    const r = await req("/api/entities/Mail", {
      method: "POST",
      token: smokeToken,
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
    assert(r.status === 201 && mail?.id, `create mail (${r.status})`);

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
    const g = await req("/api/entities/Guild", {
      method: "POST",
      token: smokeToken,
      body: {
        name: `SmokeGuild${Date.now() % 10000}`,
        tag: `SG${Date.now() % 100}`,
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

  // deleteMany with $in
  {
    const item = await req("/api/entities/Item", {
      method: "POST",
      token: smokeToken,
      body: { character_id: character.id, name: "junk", rarity: "common", slot: "misc" },
    });
    const dm = await req("/api/entities/Item/delete-many", {
      method: "POST",
      token: smokeToken,
      body: { query: { id: { $in: [item.data.id] } } },
    });
    assert(dm.ok && dm.data?.deleted >= 1, `deleteMany $in (${dm.status})`);
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

  // Friendship array containment filter
  {
    const friendChar = `Friend${Date.now() % 100000}`;
    const other = await req("/api/entities/Character", {
      method: "POST",
      token: smokeToken,
      body: { name: friendChar, race: "human", class: "soldier", level: 1 },
    });
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
      found.ok && found.data?.some((f) => f.id === friendship.data?.id),
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
