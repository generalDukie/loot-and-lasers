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

- Autoload: `NakamaManager` (`project.godot`)
- Session bridge: `AuthManager.ensure_nakama_session()` / `logout_nakama()`
- Local session file: `user://nakama_session.cfg` (gitignored patterns cover accidental copies)
