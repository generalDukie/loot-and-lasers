# Nakama RPC layer (Godot)

Reusable async RPC framework in `loot&lasers/Autoload/NakamaManager.gd`.

Gameplay managers still use `GameApiClient` today. When they migrate, they must call **only** this layer — not the Nakama SDK directly.

## Contract

Every RPC returns:

```gdscript
{
  "success": bool,
  "data": Variant,      # usually Dictionary
  "error": String,      # empty on success
  "status_code": int,   # 200 on success; 0/408/4xx/5xx on failure
}
```

All public RPC methods are **async** (`await` required). They yield on frames/timers so Godot never freezes while Nakama is slow or offline.

## Which method to use

| Method | When |
|--------|------|
| `call_authenticated_rpc(id, payload)` | **Default for managers.** Restores or creates a Nakama session, then calls the RPC. |
| `call_rpc(id, payload)` | Session already known to be valid (or you handle auth yourself). Soft-refreshes near expiry; does **not** device-auth a new account. |
| `invoke_rpc(id, payload)` | Optional. Same as authenticated call, then promotes server `{ success\|ok, error, data }` to the top-level envelope (Node `GameApiClient.invoke` parity). |

Do **not** define a method named `rpc` on `NakamaManager` — it conflicts with `Node.rpc`.

## Standard manager pattern

```gdscript
func buy_fuel() -> Dictionary:
	var res: Dictionary = await NakamaManager.call_authenticated_rpc(
		"buy_fuel",
		{"character_id": active_character_id}
	)
	if not res.get("success", false):
		return {"ok": false, "error": str(res.get("error", "Request failed")), "data": {}}
	var data: Variant = res.get("data", {})
	# apply local state from data...
	return {"ok": true, "error": "", "data": data}
```

Prefer keeping each manager’s public return shape (`ok` / `error` / `data`) for UI compatibility, and map from Nakama’s `success` / `error` / `data` / `status_code` at the boundary.

## Options (third argument)

```gdscript
await NakamaManager.call_authenticated_rpc("launch_mission", payload, {
	"timeout_sec": 8.0,           # per-attempt wall clock (default 10)
	"retries": 2,                 # transient retries after first try (default 2)
	"retry_on_auth_failure": true,# refresh session once on 401-style errors
	"use_socket": false,          # true = socket RPC if connected
	"log": true,                  # force RPC logs; default = debug/editor only
})
```

## Built-in behavior

- **Auth verification** — `call_rpc` soft-refreshes near expiry; `call_authenticated_rpc` runs `ensure_authenticated()` (restore → refresh → device auth).
- **JSON** — Dictionaries/arrays/primitives are `JSON.stringify`’d automatically; responses are parsed back into Variants.
- **Timeouts** — Each attempt is capped; offline Nakama returns a clean error (`408` / unreachable) instead of hanging.
- **Transient retries** — Retries on timeout, unreachable, and status `0/408/425/429/500/502/503/504`, with exponential backoff.
- **Auth retry** — One session refresh + single re-attempt on unauthorized / expired session.
- **Dev logging** — `[NakamaManager:RPC] …` prints in debug builds / editor only (never logs session tokens).
- **Concurrency** — Per-call result boxes; parallel RPCs do not cancel each other.

## What not to do (yet)

Do **not** migrate these until a dedicated phase says so:

- `MissionManager`
- `InventoryManager`
- `ArenaManager`
- `ChatManager`
- `GuildWarManager`
- `StatsManager`
- `ShopManager`

They should keep using `GameApiClient` until server RPCs exist and a migration PR switches the boundary.

## Future examples by manager

### MissionManager (later)

```gdscript
# Today:
# var res := await GameApiClient.invoke("LaunchMission", {"template": template})

# Later:
var res: Dictionary = await NakamaManager.call_authenticated_rpc(
	"launch_mission",
	{"template": template, "character_id": character_id}
)
if not res["success"]:
	return {"ok": false, "error": res["error"], "data": {}}
return {"ok": true, "error": "", "data": res["data"]}
```

### InventoryManager (later)

```gdscript
var res: Dictionary = await NakamaManager.call_authenticated_rpc(
	"equip_item",
	{"character_id": character_id, "item_id": item_id, "slot": slot}
)
```

### ArenaManager (later)

```gdscript
var res: Dictionary = await NakamaManager.call_authenticated_rpc(
	"arena_queue",
	{"character_id": character_id, "mode": mode}
)
```

### ChatManager (later)

```gdscript
# Prefer socket for realtime; HTTP RPC for history / sends if needed:
var res: Dictionary = await NakamaManager.call_authenticated_rpc(
	"chat_send",
	{"channel_id": channel_id, "content": text},
	{"use_socket": true, "timeout_sec": 5.0}
)
```

### GuildWarManager (later)

```gdscript
var res: Dictionary = await NakamaManager.call_authenticated_rpc(
	"guild_war_action",
	{"war_id": war_id, "action": action, "payload": action_payload}
)
```

### StatsManager (later)

```gdscript
var res: Dictionary = await NakamaManager.call_authenticated_rpc(
	"allocate_stat",
	{"character_id": character_id, "stat": stat_key, "amount": 1}
)
```

### ShopManager (later)

```gdscript
var res: Dictionary = await NakamaManager.call_authenticated_rpc(
	"shop_buy",
	{"sku": sku, "character_id": character_id, "qty": qty}
)
```

## Error handling checklist for managers

1. Always `await` the call.
2. Check `res.success` before reading `res.data`.
3. Surface `res.error` to UI / logs; do not throw.
4. Treat offline / timeout as normal failure paths (show retry or “server unavailable”).
5. Do not call `Nakama.create_client`, `client.rpc_async`, or touch session files from managers.

## Related

- Autoload: `NakamaManager`, `ProfileManager` (`project.godot`)
- Session bridge: `AuthManager.ensure_nakama_session()` / `logout_nakama()`
- Local session file: `user://nakama_session.cfg` (gitignored patterns cover accidental copies)

## Phase 3 — Player profile RPCs

Managed by `ProfileManager` (not UI scripts). Storage: collection `player_profiles`, key `profile`.

| RPC | Purpose |
|-----|---------|
| `profile_get` | Load profile; create default once if missing |
| `profile_update` | Patch allowlisted fields only |

```gdscript
# Load or create
var res: Dictionary = await ProfileManager.ensure_profile()
if res.success:
	print(res.data.account_id, res.data.display_name)

# Update display name (debounced by caller — never per keystroke)
var upd: Dictionary = await ProfileManager.update_display_name("Nova Vex")
if not upd.success:
	push_warning(upd.error)
```

Allowlisted update fields: `display_name`, `selected_character_id`, `appearance`, `avatar_portrait`.  
`account_id` / timestamps are server-owned. See `docs/PHASE3_PROFILE.md`.

## Phase 4 — Read-only inventory RPC

Managed by `InventoryManager`. Storage: collection `inventories`, key = character id. **No write RPCs.**

| RPC | Purpose |
|-----|---------|
| `inventory_get` | Load character inventory; missing → empty slots |

```gdscript
var res: Dictionary = await InventoryManager.load_inventory()
if res.success:
	print(res.data.slots.size())
# UI gear list (Node SoT + Nakama snapshot):
var items: Dictionary = await InventoryManager.list_character_items()
```

See `docs/PHASE4_INVENTORY.md`.

## Phase 5 — Wallet RPCs

Managed by `CurrencyManager` (**read-only** from the Godot client). Storage: `wallets`/`wallet`, tx log `wallet_transactions`.

| RPC | Purpose |
|-----|---------|
| `wallet_get` | Load or create zero balances (public, read-only) |

Mutations are **internal** Lua only (`credit_currency` / `debit_currency` in `modules/wallet.lua`). Former public RPCs `wallet_credit` and `wallet_debit` are **not registered**.

Temporary local-dev RPCs (flag `LOOT_DEV_WALLET_MUTATIONS=1`, soft currency only): `dev_wallet_credit_test`, `dev_wallet_debit_test`, `dev_wallet_internal_selftest`.

Currency ids: `stardust` (soft), `nova_crystals` (premium). See `docs/PHASE5_WALLET.md`.

## Phase 6 — Equipment RPCs

Managed by `EquipmentManager` (**read-only**). Storage: `equipment` / `<character_id>`.

| RPC | Purpose |
|-----|---------|
| `equipment_get` | Load equipment slot map or empty null slots |

Character-level ownership (must match profile `selected_character_id`). Live Hero UI still uses Node `Item.is_equipped`. See `docs/PHASE6_EQUIPMENT.md`.

## Phase 7 — Mission RPCs

Managed by `MissionManager` (Nakama core + preserved Node launch/claim/fuel). Storage: `mission_boards/<character_id>`, `active_missions/<character_id>`.

| RPC | Purpose |
|-----|---------|
| `missions_get` | Load or create board; include active mission |
| `missions_refresh` | Regenerate board (15s cooldown; blocked while active) |
| `mission_start` | Start an available mission (server timestamps) |
| `mission_status` | Timer check; may transition `active` → `complete` (no rewards) |

Character-level ownership. **No** claim/reward/fuel RPCs in this phase. See `docs/PHASE7_MISSIONS.md` and `docs/BACKEND_ARCHITECTURE.md`.

## Phase 8 — Mission authority

Nakama is the **sole** mission source of truth for Godot. `MissionManager.ensure_board` / `launch_offer` / `fetch_active_mission` call `missions_get` / `mission_start` / `mission_status`. Local board cfg is display cache only. See `docs/PHASE8_MISSION_MIGRATION.md`.

## Phase 9 — Shared library

Service modules may `require("lib.auth")`, `lib.responses`, `lib.validation`, etc. Response envelopes keep `status_code` for Godot and add stable `code` strings. See `docs/BACKEND_SHARED_LIBRARY.md` and `docs/BACKEND_VERIFICATION.md` (`npm run verify:backend`).

## Phase 10 — Remote config

| RPC | Purpose |
|-----|---------|
| `config_get` | Client-visible namespaces + feature flags |

Managed by `RemoteConfigManager`. Storage: `remote_config/<namespace>`, `feature_flags/<flag_id>` (system owner). **No** public mutation RPCs. See `docs/PHASE10_REMOTE_CONFIG.md`.
