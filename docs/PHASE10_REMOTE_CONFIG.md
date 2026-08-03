# Phase 10 — Remote configuration and feature flags

Infrastructure for server-authoritative game configuration without a new Godot build.
**No** seasonal events, shops, rewards, premium purchases, or new gameplay systems.

## Public RPC

| RPC | Purpose |
|-----|---------|
| `config_get` | Authenticated; returns **client-visible** namespaces + evaluated feature flags |

**Not registered:** `config_set`, `config_update`, `feature_flag_*`, `maintenance_set`.

Internal helpers (module return table / `require("config")`):

- `get_config_value`, `get_config_namespace`
- `get_feature_flag`, `is_feature_enabled`
- `validate_config_document`
- `write_config_internal`, `update_feature_flag_internal`

## Environment

Selected by Nakama runtime env `LOOT_ENVIRONMENT`:

- `development` (default if unset/invalid)
- `staging`
- `production`

Set in `docker-compose.yml` as `LOOT_ENVIRONMENT=development`.
Do **not** infer production from the Godot client.

## Storage

| Collection | Key | Owner | Read | Write |
|------------|-----|-------|------|-------|
| `remote_config` | namespace id (`global`, `missions`, `client_ui`) | system `00000000-0000-0000-0000-000000000000` | 0 (RPC only) | 0 |
| `feature_flags` | `flag_id` | same system owner | 0 | 0 |

Missing records → **code defaults** (no automatic write on `config_get`).
Malformed records → logged, defaults used (not trusted).

## Namespaces (Phase 10 sample)

### `global` (client-visible unless noted)

| Key | Default | Notes |
|-----|---------|-------|
| `maintenance_enabled` | `false` | UI signal; **RPC enforcement deferred** |
| `maintenance_message` | `""` | |
| `maintenance_started_at` / `maintenance_expected_end` | `""` | |
| `minimum_client_version` / `recommended_client_version` | `""` | advisory unless `update_required` |
| `update_message` / `update_required` | `""` / `false` | |
| `announcement_text` | `""` | |
| `admin_notes` | `""` | **server-only** |

### `missions`

| Key | Default | Notes |
|-----|---------|-------|
| `board_size` | `3` | Used by `missions.lua` with fallback `3` |
| `free_refresh_cooldown_seconds` | `15` | Live value preserved (not 3600) |
| `server_generation_salt` | `""` | **server-only** |

### `client_ui`

| Key | Default |
|-----|---------|
| `show_development_banner` | `true` |

## Feature flags

Sample: `shipments_enabled` → `enabled=false`, `client_visible=true`, `environment=development`.

Phase 10 evaluation uses: `enabled`, `environment`, `client_visible`, `starts_at`, `ends_at` (server time).
**No** percentage rollout / allowlists in this phase.

Development-environment flags never evaluate true in `production`.

## Client

Autoload `RemoteConfigManager`:

- `load_config` / `reload_config` → `config_get` via `NakamaManager`
- Cache: `user://remote_config_cache.json` (gitignored; presentation only)
- Signals: `config_loaded`, `config_changed`, `config_error`, `loading_changed`, `maintenance_changed`

Cache never authorizes gameplay. Nakama wins on conflict.

## Maintenance mode limitations

Config + Godot signal exist. **Global gameplay RPC rejection is future work.**
Hiding UI alone is not sufficient security once enforcement is added.

## Version check

Optional `client_version` on `config_get` returns advisory `client_version_check`.
Comparison parses numeric components (`1.9.0` < `1.10.0`). Empty minimum → no block.

## Rollback

1. Remove or ignore stored `remote_config` / `feature_flags` records (defaults apply).
2. Revert `modules/config.lua` / mission `require("config")` if needed.
3. Restart Nakama.

## Future admin

Trusted admin service will call `write_config_internal` / `update_feature_flag_internal` — never expose those as public RPCs to the game client.
