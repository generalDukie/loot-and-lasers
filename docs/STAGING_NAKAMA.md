# Staging Nakama connection (Godot)

Connect the Godot client to local Docker Nakama or the Hetzner staging host without duplicating clients or sockets.

## Environments

| Id | Scheme | Host | Port | Server key |
|----|--------|------|------|------------|
| `local` | http | 127.0.0.1 | 7350 | `defaultkey` (Docker default) |
| `staging` | http | 178.156.210.186 | 7350 | Hetzner `NAKAMA_SOCKET_SERVER_KEY` |

Selection is owned by autoload `BackendEnvironment`.  
`NakamaManager` remains the **only** Nakama client owner.  
`RealtimeManager` remains the **only** socket lifecycle owner (via `NakamaManager.connect_socket()`).

## How to switch environments

Priority (highest first):

1. OS environment variable `LOOT_NAKAMA_ENV=local|staging`
2. `user://backend_env.cfg` → `[backend] environment=staging`
3. Project Setting `loot/backend/environment` (default `local` in `project.godot`)

### Quick staging (recommended for one session)

Windows PowerShell:

```powershell
$env:LOOT_NAKAMA_ENV = "staging"
$env:NAKAMA_SOCKET_SERVER_KEY = "<value of NAKAMA_SOCKET_SERVER_KEY on Hetzner>"
# Then launch the Godot editor / project
```

### Persist staging choice (no secret in this file)

In Godot debugger / temporary script:

```gdscript
BackendEnvironment.set_environment_persistent("staging")
# Restart the game / editor after setting the key (below)
```

Or create `user://backend_env.cfg`:

```
[backend]
environment=staging
```

### Staging server key (required)

Never commit the staging key. Configure **one** of:

1. OS env `NAKAMA_SOCKET_SERVER_KEY` (or `LOOT_NAKAMA_SERVER_KEY`)
2. Copy `loot&lasers/Config/nakama_secrets.cfg.example` → `loot&lasers/Config/nakama_secrets.cfg` (gitignored) and set:

```
[staging]
server_key=<Hetzner NAKAMA_SOCKET_SERVER_KEY>
```

3. Or the same keys in `user://nakama_secrets.cfg`

Do **not** put CockroachDB passwords, console passwords, session encryption keys, runtime HTTP keys, or SSH keys in Godot.

## Visible environment badge

Debug / editor builds show a top-left label:

`NAKAMA STAGING · http://178.156.210.186:7350`

(or `LOCAL` for local). Release exports without debug features hide the badge.

## Session separation

| File | Purpose |
|------|---------|
| `user://nakama_session_local.cfg` | Local tokens |
| `user://nakama_session_staging.cfg` | Staging tokens |
| `user://nakama_device_id_*.txt` | Env-scoped device id fallback |

A local session file is never loaded while `environment=staging` (and vice versa). Device auth ids are prefixed by environment so accounts stay distinct across servers.

## Diagnostics (no secrets)

```gdscript
print(NakamaManager.get_connection_diagnostics())
```

Fields: environment, scheme, host, port, client_created, authenticated, socket_connected, server_key_fingerprint (length/tail only).

## Staging test procedure

1. Set `LOOT_NAKAMA_ENV=staging` and `NAKAMA_SOCKET_SERVER_KEY` from the Hetzner host.
2. Launch Godot; confirm the badge shows **STAGING** and the Hetzner host/port.
3. From the debugger / a one-shot call:

```gdscript
var res = await NakamaManager.run_connection_smoke_test()
print(res)
```

4. Confirm steps succeed: `client_create`, `authenticate`, `profile_get`, `inventory_get`, `socket_connect`.
5. Note the staging `user_id`.
6. Switch back to local (`LOOT_NAKAMA_ENV=local` or clear it), relaunch, authenticate — confirm a **different** session file / account path (`nakama_session_local.cfg`) and that staging tokens were not reused.
7. Confirm logs never print session tokens, refresh tokens, or the full server key.

## Architecture reminder

```
UI / managers
  → NakamaManager (single NakamaClient + session + create_socket_from)
  → RealtimeManager.start_nakama() (single socket connect owner)
```

Do not call `Nakama.create_client` or `Nakama.create_socket` from other scripts.
