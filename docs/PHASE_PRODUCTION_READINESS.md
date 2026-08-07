# Restoration 28 — Final System Integration & Production Readiness

**Verdict: NOT production-ready.**

Node is the intended sole gameplay authority; Nakama is intended for auth/session only;
Godot is intended presentation-only. Restorations 01–27 largely restored Node services
and automated suites, but **duplicated / legacy authority paths, missing load-stress
coverage, incomplete DR, and dependency advisories block launch.**

Date of validation: 2026-08-04.

---

## 1. Complete architecture overview

```
Godot (presentation / UX / local prefs)
    │  Nakama email auth + session
    ▼
Nakama (auth / accounts / session lifecycle / identity only)
    │  POST /api/auth/nakama-bridge  → short-lived gameplay JWT
    ▼
Node API (authoritative gameplay)
    │
    ├─► Gameplay services (economy, inventory, missions, combat, shops,
    │     mining, dungeons, arena, stims, casino, statistics, achievements,
    │     social, notifications, settings sync, integrity/recovery, admin)
    │
    ├─► Persistence (SQLite document store + ledgers + audit)
    │
    ├─► Background workers (scheduler ticks, entitlement expiry, integrity)
    │
    ├─► Database (server/data/game.db)
    │
    ├─► Telemetry (in-process logs/metrics/health — non-authoritative)
    │
    └─► Administration (admin role + Ops RPCs + audit)
```

**Target:** no duplicated gameplay authority.  
**Observed residual debt (updated):** Godot gameplay Nakama RPCs are **client-blocked**
(`NakamaManager` allowlists only `config_get`). Live managers use Node. Nakama Lua
gameplay modules remain for migration verification tools only — not the Godot client.

---

## 2. Authority map

| System | Owns (write/validate) | Reads | Displays | Duplicated? |
|--------|----------------------|-------|----------|-------------|
| Authentication / sessions | Nakama + Node bridge JWT | Both | Godot AuthManager | Split by design (OK) |
| Account mapping | Node `users.nakama_user_id` | Node | Godot | No |
| Selected character | Node `users.active_character_id` | Node | GameManager | Legacy Nakama profile select — debt |
| Progression / XP / attrs | Node | Node | Godot | No (formulas shared read-only) |
| Inventory / gear (live Hero) | Node Item + EquipItem | Node | Godot | **Yes** — EquipmentManager / InventoryManager Nakama RPCs remain |
| Missions (live Cantina) | Node Launch/Claim/Skip/Fail | Node | Godot | **Yes** — `load_missions` / `mission_start` Nakama paths remain |
| Combat settlement | Node combat + claim pipelines | Node | Godot | Legacy dungeon client flags — review residual |
| Class passives | Node combat engine | Node | Godot | No |
| Shops / mining / dungeon / economy | Node | Node | Godot | No for live paths |
| Arena | Node arena authority | Node | Godot | Legacy Nakama arena modules — debt |
| Stims / casino / stats / achievements | Node | Node | Godot | No |
| Scheduler | Node | Node/admin | Admin UI | No |
| Notifications / social / mail | Node services | Node | Godot | Guild chat deferred; some guild writes still client-entity |
| Settings | Godot local + Node prefs subset | Both | Godot | Split by design (OK) |
| Persistence / recovery | Node integrity/recovery | Node | Godot RecoveryManager | No |
| Admin | Node admin role + ops | Node | Godot Admin | Binary roles only |
| Telemetry | Node observability (non-auth) | Ops | Admin/ops | No |

---

## 3. Gameplay integration verification

Automated Node suites cover domain logic end-to-end inside the server process.
**Full Godot UI loop (create → login → load → mission → … → logout) was not
executed as a single unattended client E2E in this pass.**

| Loop step | Status | Evidence |
|-----------|--------|----------|
| Character create | Pass (Node sanitize) | `test:shared-foundation`, entity access |
| Login / bridge JWT | Pass (scripted) | `test:godot-auth-flow` / auth foundation |
| Load / selected character | Pass | gameplayContext + auth tests |
| Mission launch/claim | Pass (Node) | mission-rewards + MissionManager Node path |
| Combat | Pass | `test:combat`, `test:passives` |
| Rewards | Pass | `test:mission-rewards`, `test:rewards` |
| Inventory / equip | Pass (Node) | `test:inventory` |
| Shop | Pass | `test:shops`, `test:shop-purchases` |
| Mining / dungeon / arena | Pass | domain suites |
| Statistics / achievements | Pass | domain suites |
| Logout / session clear | Pass (auth foundation) | Godot auth tests |
| Dual Nakama mission start | **Risk** | Dead-but-callable Godot Nakama RPCs |

---

## 4. Authentication verification

| Check | Result |
|-------|--------|
| Nakama auth + Node bridge | Designed and tested |
| Session refresh / re-exchange | Godot proactive re-bridge |
| JWT issuer/audience/exp | Enforced in Node |
| Reconnect / logout | Auth foundation coverage |
| Expired / invalid sessions | Fail-closed on Node requireAuth |
| Multiple devices | Not load-tested; JWT is stateless |
| Account mapping uniqueness | Bridge atomic mapping |
| Character ownership | Entity + gameplayContext scoped |
| **OTP / reset in API body (prod)** | **Fixed in Rest 28** — `devOnlyExtras` returns `{}` when `NODE_ENV=production` |

---

## 5. Security audit

### Critical / High (launch-blocking or near-blocking)

| ID | Finding | Severity | Remediation |
|----|---------|----------|-------------|
| S1 | Residual Godot→Nakama gameplay RPCs (missions/equipment/inventory/profile) | **Critical** | Remove or hard-disable client calls; keep Nakama modules read-only/env-gated until deleted |
| S2 | Open entity creates for Guild* / NexusAssault / Report / HubLayout (and historically ArenaMatch/spend/DailyLogin) | **High** | Route through services; Rest 28 locked DailyLogin, ArenaMatch, NovaSpendEvent, StardustSpendEvent |
| S3 | Production OTP previously returned when SMTP off | **Critical** | **Fixed** — never return `otp_dev` / reset tokens in production |
| S4 | No encrypted offsite backup / PITR / proven RPO·RTO | **Critical** (ops) | Define backup + restore drill before launch |
| S5 | Crystal pack / free-grant outside production; Nakama `dev_*` RPCs present | **High** | Env-gate strictly; deny in prod configs |
| S6 | `nodemailer` high advisory (server); `brace-expansion` high (root) | **High** | Upgrade after compatibility check |

### Medium / Low

| Finding | Severity |
|---------|----------|
| Binary admin role (no finer GM tiers) — by product choice | Low / accepted |
| No hosted APM/alerts/SLOs | Medium (ops) |
| Rate limiting incomplete vs concurrent purchase/combat | Medium |
| Client analytics ingest present but non-authoritative | OK |

### Mitigated / OK

- SaveManager refuses gameplay authority saves
- Character economy fields stripped on client entity mutate
- Wallet bridge fail-closed without secret
- Admin routes require auth + admin
- Item/Mission/AppNotification/social entity creates locked

---

## 6. Performance benchmarks

| Area | Method | Result |
|------|--------|--------|
| Domain unit/integration suites | Local Node scripts | Typically 300–700 ms each; `test:xp-curve` ~15 s |
| Auth / character load / combat under concurrency | **Not measured** | No formal harness |
| DB / scheduler / queues under load | **Not measured** | — |
| Telemetry overhead | In-process bounded metrics | Designed low-cardinality; not load-profiled |

**Do not treat suite wall-clock as production latency SLOs.**

---

## 7. Load-test results

| Scenario | Result |
|----------|--------|
| 100 / 500 / 1000 / 5000 players | **Not run** — no load suite |
| Concurrent combat / purchases / arena / mission rewards / premium | **Not run** |

Blocker for any public launch claim.

---

## 8. Stress-test results

| Failure injection | Result |
|-------------------|--------|
| Network interrupt / reconnect | Partial client coverage only |
| DB / Node / Nakama / queue / worker restart | **Not systematically tested** |
| Client restart | Auth restore path exists; not stressed |

Integrity suite covers quarantine/repair dry-run; not full chaos.

---

## 9. Recovery validation

| Topic | Status |
|-------|--------|
| Ambiguous request recovery RPCs | Implemented + tested (`test:integrity`) |
| Partial transaction / migration interrupt | Framework present; DR drill deferred |
| Database restore / PITR | **Gap** |
| Queue backlog / scheduler downtime | Scheduler tests exist; no backlog soak |
| Telemetry outage isolation | Observability tests pass (non-throwing) |

---

## 10. Persistence validation

| Check | Status |
|-------|--------|
| SQLite document + ledger persistence | Operational |
| Migrations framework | Present |
| Integrity audit / quarantine | Present |
| Deterministic save from Godot | **Blocked by design** (presentation cache only) |
| Encrypted offsite / restore proof | **Missing** |

---

## 11. Administration validation

| Check | Status |
|-------|--------|
| Admin role gate | Pass (`test:admin`) |
| Ops: Lookup/Inspect/Dashboard/flags/maintenance | Pass |
| Promo / moderation / integrity RPCs | Audited paths |
| Feature flags | Node runtime config |
| Fine-grained GM tiers | Intentionally not invented |

---

## 12. Telemetry validation

| Check | Status |
|-------|--------|
| Structured logs + redaction | Pass |
| Metrics + health probes | Pass |
| Client analytics non-authoritative | Pass |
| Hosted dashboards / alerts / tracing export | **Not present** |

---

## 13. Production readiness checklist

| Area | Ready? |
|------|--------|
| Authentication | Mostly — OTP prod leak fixed; multi-device load unproven |
| Persistence | Partial — no DR proof |
| Economy | Domain pass; load unproven |
| Inventory | Domain pass; Nakama shadow managers remain |
| Combat | Domain pass |
| Missions | Node live path pass; Nakama dual path risk |
| Arena | Domain pass |
| Dungeons / Mining / Shops / Stims / Casino | Domain pass |
| Statistics / Achievements | Domain pass |
| Notifications / Social | Domain pass; guild gaps |
| Settings | Pass |
| Administration | Pass for binary admin |
| Telemetry | In-process only |
| Recovery | Partial |
| Security | **Fail** until S1/S4 addressed |
| Performance / load | **Fail** — unmeasured |
| Deployment | Staging docs exist; not launch-certified |

---

## 14. Remaining technical debt

### Required before launch

1. Disable/remove Godot Nakama gameplay mutation paths (missions start/board writes, equipment_equip, inventory grants).
2. Proven backup + restore drill with RPO/RTO.
3. Load test critical concurrent paths (rewards, purchases, arena).
4. Patch high npm advisories (`nodemailer`, `brace-expansion`).
5. Close remaining forgeable entity creates (Guild*, NexusAssault) or service-wrap them.
6. Confirm production env: SMTP on, `NODE_ENV=production`, secrets set, crystal free-grant off, Nakama `dev_*` off.

### Recommended before launch

- Single unattended Godot E2E smoke (create→mission→claim→logout).
- Rate limits on economy / arena / auth.
- Formal alert runbooks wired to health probes.

### Safe to defer

- Finer GM roles
- Guild chat
- External APM (Datadog/OTel)
- Shipment system (Phase 16 deferred by design)
- Cosmetic dead-code cleanup after mutation paths removed

---

## 15. Launch blockers

| Sev | Issue | Remediation |
|-----|-------|-------------|
| Critical | Dual client→Nakama gameplay authority still callable | **Fixed** — Godot `NakamaManager` allowlists only `config_get`; managers use Node |
| Critical | Production OTP/reset extras in API body | **Fixed** (Rest 28) |
| Critical | No proven offsite backup / restore | Deferred (out of current non-launch scope) |
| Critical | No load/stress certification | Deferred (out of current non-launch scope) |
| High | Open Guild*/Nexus entity creates | **Fixed** — locked create/write; Node RPCs for challenge/contribute/settings/war ready/resolve |
| High | Crystal pack free-grant outside production | **Hardened** — staging requires `CRYSTAL_PACK_DEV_GRANT=1`; production always blocked |
| High | Dependency advisories (nodemailer, brace-expansion) | **Mitigated** — server nodemailer upgraded; removed unused `react-quill`; `react-router-dom` → **7.18.2** (official GHSA patch; npm advisory DB may still flag until republished; app does not use RSC APIs) |
| High | Hosted alerts / multi-instance ops undefined | Deferred (ops) |
| Residual | Client guild-war resolve / ready CRUD | **Fixed** — `ResolveGuildWar` + `ToggleGuildWarReady`; web/Godot wired |
| Residual | GalaxyNews client create (admin-locked) | **Fixed** — posted in FinishArenaBattle / FinishDungeonBattle / war resolve |
| Residual | Character purge via locked deleteMany | **Fixed** — `DeleteMyCharacter` RPC |
| Medium | Legacy web + outdated docs vs restored Node paths | Align docs; decide web deploy status |
| Low | Binary admin roles | Accept or schedule later |

---

## 16. Recommended future refactors (architecture-preserving)

1. One client request surface: Godot → GameApiClient → Node only for gameplay.
2. Treat Nakama Lua gameplay modules as deleted inventory after verification.
3. Shared wallet/economy mutation service already preferred — continue routing stragglers.
4. Keep telemetry and admin non-authoritative.
5. Do **not** redesign combat/economy/balance.

---

## 17. Files modified in Restoration 28 (this pass)

| File | Change |
|------|--------|
| `server/src/auth.js` | Never return OTP/reset extras in production |
| `server/src/entityAccess.js` | Lock DailyLogin / ArenaMatch / spend-event creates |
| `server/scripts/test-shared-foundation.mjs` | Expect starting Nova 50 (current economy) |
| `package.json` | Fix `test:entitlements` alias; add `test:restoration28` |
| `scripts/run_restoration28_regression.mjs` | Aggregated regression runner |
| `docs/PHASE_PRODUCTION_READINESS.md` | This report |
| `docs/restoration28-test-results.json` | Suite results artifact |

---

## 18. Major systems restored (01–27)

Auth bridge, network contract, shared foundation, progression, attributes, inventory,
gear gen, combat, class passives, mission engine/rewards, shops, mining, dungeons,
economy, arena, stims, casino, statistics, achievements, scheduler, notifications,
social, settings, integrity/recovery, administration, observability.

---

## 19. Systems intentionally unchanged

- Hybrid Nakama-auth / Node-gameplay architecture
- Gameplay balance / formulas (except validated as-is)
- Deferred Shipment system
- Binary `user`|`admin` roles (no invented GM tiers)
- Godot visual language (web parity source of truth)
- Telemetry remains non-authoritative

---

## 20. Cross-system interaction diagram

```
AuthManager ──► Nakama session ──► Node JWT
     │
GameManager ◄── Node Character / sheet apply
     │
MissionManager ──Launch/Claim──► Node rewards ──► Currency + Items + Stats + Achievements + Notifications
ArenaManager ──► Node combat + rating ──► Statistics + Notifications
Shop/Mining/Dungeon ──► Node economy ledgers ──► Audit
AdminManager ──► Ops RPCs ──► Audit + Integrity (no silent balance invent)
DiagnosticLogger ──► RecordClientAnalytics (ignored for authority)
```

---

## 21. Full service dependency diagram

```
Godot Managers
  → GameApiClient (/api/functions/*, /api/entities/*, /api/auth/*)
    → auth.js / gameplayContext.js / entityAccess.js
      → functions/* + shared/* services
        → db.js (SQLite)
        → audit helpers
        → observability (logs/metrics)
        → scheduler workers
Nakama (parallel) → session validate only on bridge
```

---

## 22. Database relationship diagram (logical)

```
users 1──* Character
Character 1──* Item, Mission, ArenaMatch, Mail, …
users 1──* Friendship / Block / Presence
Character *── ledger rows (currency / rewards / integrity quarantine)
audit_events / email_log / entitlements / feature flags
```

Physical store: SQLite collections + relational helpers in `server/src/db.js`.

---

## 23. Authentication sequence diagram

```
Godot → Nakama authenticate_email
Godot → Node POST /api/auth/nakama-bridge (session token)
Node → Nakama session validate
Node → upsert unique users.nakama_user_id
Node → sign gameplay JWT (iss/aud/exp/jti; exp ≤ Nakama session)
Godot → Authorization: Bearer <gameplay JWT> on gameplay calls
Godot → re-bridge before expiry; logout clears Nakama + Node tokens
```

---

## 24. Gameplay request lifecycle

```
UI input
 → Manager builds intent (no trusted balances)
 → GameApiClient + gameplay JWT + X-Request-Id
 → Node requireAuth
 → resolve selected owned Character
 → service validates + mutates in transaction
 → ledger/audit/metrics
 → structured response
 → Manager apply_authoritative_response
 → UI
```

Client outcomes are never re-trusted as settlement authority.

---

## 25. Deployment diagram

```
[Windows/Godot client] ──HTTPS──► [Node API :8787]
                                      │
                                      ├── SQLite volume
                                      ├── env secrets (JWT, SMTP, wallet bridge)
                                      └── optional Nakama :7350 (auth only)

[Admin Ops UI in Godot] ──same Node──► admin-gated RPCs
[Health] GET /health/live|ready|build
```

Staging notes: `docs/STAGING_NAKAMA.md`, `docs/WINDOWS_FRIEND_BUILD.md`.

---

## Regression suite (Rest 28)

Command: `npm run test:restoration28`

Initial validation pass (2026-08-04): **all listed domain suites green** after:
- shared-foundation Nova expectation aligned to **50**
- entitlements runner `@/` alias fixed
- entity create locks + OTP production fix

Load/stress/chaos: **not included** in this green result.

---

## Explicit non-claim

Loot & Lasers is **not** reported production-ready under Restoration 28 criteria
because critical dual-authority debt, DR, and load certification remain open, even
though Node domain restorations and automated unit/integration coverage are largely green.
