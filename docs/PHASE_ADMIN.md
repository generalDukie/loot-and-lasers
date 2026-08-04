# Phase / Restoration 26 — Administration, Live Operations, Operational Tooling

Architecture: **Nakama authenticates** (including admins). **Node authorizes and
executes** every privileged action. **Godot/web only display** admin UIs and call
Node RPCs/HTTP — never grant themselves elevated rights.

## Completion verdict

Existing admin tooling was already substantial (`AdminModeration`, audit routes,
rewards/entitlements/schedules admin HTTP, web + Godot consoles). This restoration
**centralizes** ops helpers, **closes audit gaps** (promo CRUD), **wires arena
suspend/ban** fields that eligibility already read, adds **Node feature flags +
ops dashboard**, and **Godot Ops tab** parity. Multi-tier GM/Support roles were
**not invented** — product remains `user` | `admin`.

---

## Completion report

### 1. Existing administrative architecture
| Layer | Role |
|-------|------|
| Auth | Nakama session → Node gameplay JWT; `users.role` |
| Gate | `isAdmin(user)` → `role === "admin"` |
| Mutations | `AdminModeration` RPC + `/api/*/admin/*` |
| Clients | `src/pages/AdminPage.jsx`, `loot&lasers/Scenes/UI/admin.gd` via `AdminManager` |

### 2. Existing roles
| Role | Status |
|------|--------|
| `user` | Default |
| `admin` | Seed + `set_role` |

**Not present (not invented):** Developer, Game Master, Support, Moderator, Analyst.

### 3. Existing permissions
Binary admin historically. Restoration adds **capability catalog**
`AdminPermissions` for documentation + `assertAdminPermission` — today all map to
`role=admin`. Granular assignment deferred until product defines staff tiers.

### 4. Existing GM tools (restored / wired)
Mute, ban, unban, unmute, delete message, word filter, system mail, resolve report,
give item, adjust currency, reset player, set role, transfer guild, promo CRUD,
rewards/entitlements/schedules/audit HTTP, integrity/migration/maintenance RPCs,
**new:** LookupPlayer, InspectCharacter, GetOpsDashboard, SetFeatureFlag,
arena_suspend/ban.

### 5. Existing moderation tools
`PlayerModeration` (chat mute/ban + **arena_banned / arena_suspended /
suspended_until**), `ModerationConfig`, `Report`. Chat enforcement on send path.
Arena eligibility already honored suspend fields — admin actions now write them.

### 6. Existing feature flags
| Store | Use |
|-------|-----|
| Nakama RemoteConfig | Lua modules / Godot `RemoteConfigManager` (read-only client) |
| Node `app_meta` `feature_flags_v1` | **New** live toggles via `SetFeatureFlag` |
| Entitlement `FEATURE_FLAGS` | Compile-time product codes |

Flags do **not** replace authorization or migrations.

### 7. Existing runtime configuration
`SiteConfig` (theme/announcement/maintenance mirrors), `ModerationConfig`,
`SetMaintenanceMode` / `app_meta` maintenance (Node write gate), scheduler
(`/api/schedules`). `GetRuntimeConfig` / `UpdateRuntimeConfig` centralize reads.

### 8. Existing dashboards
Web AdminPage tabs + Godot admin tabs + **Ops** tab (maintenance, flags,
integrity, arena suspend, ops snapshot).

### 9. Existing audit logging
`recordAdminAction` / `auditAdminModeration` / domain helpers. Promo create /
delete / toggle now audited. `adminHasAuditPermission` requires `role=admin`
(no longer stub-true for everyone).

### 10. Node files changed
- `server/src/shared/adminOpsService.js` (new)
- `server/src/functions/index.js` — RPCs + arena/promo audit
- `server/src/audit/helpers.js`, `registry.js`, `routes.js`
- `server/src/index.js` — maintenance allowlist
- `server/src/seed.js` — default password warning / prod refuse
- `server/scripts/test-admin-ops.mjs`

### 11. Godot files changed
- `loot&lasers/Autoload/AdminManager.gd` — ops/lookup/integrity/flag/arena helpers
- `loot&lasers/Scenes/UI/admin.gd` — Ops tab

### 12. Tests added
`npm run test:admin` — **14 passed** (authz denial, lookup, inspect, flags,
arena suspend, promo, currency reason, RPCs, dashboard).

### 13. Operational architecture (text)

```
Admin client (Godot/web)
  → Nakama auth + Node JWT
  → assert role=admin (+ AdminPermissions catalog)
  → AdminModeration / LookupPlayer / InspectCharacter /
    SetFeatureFlag / SetMaintenanceMode / RunIntegrityAudit / …
  → SQLite entities + audit_logs
  → Player sees only committed gameplay state
```

```
Maintenance: SetMaintenanceMode → app_meta → Node write drain
Flags: SetFeatureFlag → app_meta feature_flags_v1 (audited)
Arena: arena_suspend → PlayerModeration → isArenaBanned()
```

### 14. Regression results
- `npm run test:admin` — 14 passed
- `npm run test:integrity` — 26 passed (prior)
- `npm run test:settings` — 5 passed
- Gameplay formulas / economy / combat **not rewritten**

---

## Commands

```bash
npm run test:admin
```

## Player-safe RPC
- `GetRuntimeConfig` — maintenance + feature flags display

## Admin RPCs (additions)
- `LookupPlayer`, `InspectCharacter`, `GetOpsDashboard`
- `SetFeatureFlag`, `UpdateRuntimeConfig`
- Existing: `AdminModeration`, integrity/migration/maintenance

## Intentionally absent
- Multi-tier staff roles / permission DB
- Account login ban (chat/arena moderation only)
- Casino/shop live editors
- Unified Nakama↔Node RemoteConfig admin mutation UI
- Approval workflow product (not previously finalized)
- Safe server wipe (still unavailable — unconstrained deleteMany rejected)

## Security notes
- Default seed password warned; refused in `NODE_ENV=production`
- Wallet bridge remains S2S secret (not user JWT)
- No public debug grant RPCs
- Clients cannot escalate `role` locally
