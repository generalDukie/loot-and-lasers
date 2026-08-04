# Phase / Restoration 25 — Save Integrity, Validation, Recovery, Migration

Architecture: **Nakama = auth identity only**. **Node SQLite = authoritative
gameplay persistence**. **Godot = presentation + recovery UX**. Clients never
repair, merge, migrate, or overwrite Node state from local caches.

## Completion verdict

Restored a versioned integrity / quarantine / migration / recovery framework on
Node, hardened Godot so local saves cannot act as authority, and added automated
tests plus an isolated restore drill. Full production DR cadence, PITR, and
every subsystem deep-reconciler are **documented as current capability vs gap** —
not claimed complete where evidence is incomplete.

---

## Completion report (prompt checklist)

### 1. Authoritative database architecture
| Item | Value |
|------|-------|
| Engine | SQLite via `node:sqlite` (`DatabaseSync`) |
| Path | `server/data/game.db` (`DB_PATH` override) |
| Journal | WAL |
| Transactions | `withTransactionAsync` (BEGIN IMMEDIATE) |
| Document store | `entities` JSON blobs by `type` |
| Relational ledgers | `wallet_operations`, `reward_claims`, arena/entitlement/schedule/audit tables |

### 2. Schema inventory (summary)
**SQL core:** `users`, `entities`, `wallet_operations`, `character_creation_requests`, `app_meta`  
**Rewards:** `reward_claims`, `reward_claim_audit`, `reward_outbox`, `reward_pending_loot`  
**Arena:** `arena_challenges`, `arena_pair_battles`, `arena_challenge_audit`, `arena_outbox`, `arena_bots`  
**Entitlements / purchases:** `entitlements`, histories, `external_purchase_verifications`, outbox  
**Scheduling:** `schedules`, `schedule_occurrences`, `schedule_audit`  
**Audit:** `audit_logs`, annotations, exports, integrity chains, retention holds  
**Integrity (new):** `data_quarantine`, `repair_audit_log`, `migration_runs`, `migration_checkpoints`

Entity types remain the Restoration document store list (Character, Item, Mission, … + ArenaMatch in export constants).

### 3. Authority matrix (selected)
| Concept | Authority | Store | Mirror / cache |
|---------|-----------|-------|----------------|
| Account ↔ Nakama | Node | `users.nakama_user_id` | Nakama session |
| Character / progression | Node | `entities.Character` | Godot display |
| Inventory / gear | Node | `entities.Item` + `equipped_items` | Godot |
| Currency | Node | Character balances + `wallet_operations` | Godot CurrencyManager |
| Rewards / claims | Node | `reward_claims` | — |
| Arena rating | Node | Character + `arena_challenges` | Leaderboard presentation |
| Stims | Node | `Character.active_buffs` | — |
| Settings (hardware) | Godot | `user://settings.cfg` | never Node |
| Auth session | Nakama | Nakama | Node JWT exchange |

### 4–6. Account / duplicate / character ownership
- Unique partial index on `nakama_user_id`; startup fails on duplicates.
- `ValidateAccountIntegrity` detects missing account, duplicate Nakama maps, cross-account `active_character_id`.
- **No automatic account merge** by email/display name.

### 7–8. Progression / permanent attributes
Structural validators for class, level, XP, nonnegative permanent attrs.
Incomplete XP history does **not** erase current level/XP.
Stim effects validated separately; no guessed permanent-attr deflation.

### 9–12. Inventory / orphans / duplicates / equipment
Ownership, negative stacks, equipped missing refs, slot desync.
Orphans: detect + quarantine — **never auto-delete**.
Duplicates require identity/transaction evidence (not stat equality alone).
Safe repair: `clear_invalid_equip_refs` removes bad refs, quarantines evidence, no replacement items.

### 13–15. Currency / premium / transactions
Balance shape checks; ledger reconcile classifies incomplete history and **preserves balances**.
Premium uniqueness remains in entitlements tables (prior restoration).
`ValidateTransactionIntegrity` + `RecoverAmbiguousRequest` for claim/wallet/arena keys.

### 16–28. Mission → scheduler validators
Scoped structural checks for mission/shop/mining/dungeon/arena/stim/casino/statistics/achievements/scheduler.
Heavy rebuilds deferred to owning phase tools (not every login).

### 29–31. Godot cache / legacy browser / import
- `SaveManager`: gameplay `save_game` / `load_game` refuse authority (`ERR_UNAVAILABLE` / empty).
- `RecoveryManager`: presentation cache versioning; ambiguous-request reconcile; maintenance/review UX states.
- Browser localStorage remains **non-authoritative** for gameplay (settings-only where applicable).
- Legacy import: existing `import-data.mjs` dry-run/apply — not exposed on ordinary Godot gameplay routes.

### 32–35. Migration framework
`migrationFramework.js` + builtins (`integrity_framework_v1`, export note).
CLI: `npm run integrity:migrate -- --id …` (dry-run default; `--apply` to write).
Idempotent `migration_done:*` markers + checkpoints.

### 36–38. Quarantine / review / repair audit
Tables + `QuarantineRecord` / `ApplyDataRepair` (safe types only) + `repair_audit_log`.
Player-facing repair controls **not** exposed. Admin RPCs gated.

### 39–45. Backup / RPO / RTO / restore / DR
| Item | Status |
|------|--------|
| Export/import | `server` `backup:export` / `backup:import` |
| Docs | `server/BACKUP.md` |
| Isolated restore drill | `integrity:restore-drill` + fixture — **ran successfully in temp DB** |
| Encryption / offsite cadence | **Not configured in-repo** — gap |
| SQLite PITR | **Not native** — capability = last successful file/JSON backup |
| Technical RPO | Last verified backup interval (ops-defined; no SLA invented) |
| Technical RTO | Time to provision Node + restore JSON/DB copy + migrate (drill: seconds on fixture) |
| Full production DR drill | **Deferred** (must not run against live) |

### 46–52. Files changed
**Node:** `integrityStore.js`, `integrityService.js`, `recoveryService.js`, `maintenanceGate.js`, `migrationFramework.js`, `migrations/registerBuiltins.js`, `functions/index.js`, `index.js`, scripts (`test-integrity`, `run-integrity-audit`, `run-migration`, `restore-drill`), `migration/constants.js`, package scripts.  
**Godot:** `SaveManager.gd`, `RecoveryManager.gd`, `project.godot` autoload.  
**Nakama:** no gameplay-save authority changes.  
**Constraints:** quarantine/migration tables; export includes `ArenaMatch`.

### 53–54. Removed / retained
- Godot gameplay save authority remains disabled (strengthened messaging).
- Ad-hoc `app_meta` scale migrations retained historically; new work goes through registry.

### 55–59. Strategies
Expand schema → dry-run → apply → validate → stamp done. Batch checkpoints via `migration_checkpoints`. Rollback: schema reverse where written; irreversible data requires backup first. Background jobs: schema compatibility helper; maintenance write drain.

### 60–65. Tests
`npm run test:integrity` — **26 passed**.  
Restore drill on fixture — **ok**.  
`npm run test:settings` — regression.  
Property/stress suites for every concurrent edge: **partial** (invariants in integrity tests; full concurrency matrix deferred with monitoring Prompt 27).

### 66–71. Gaps / launch blockers
| Item | Status |
|------|--------|
| Quarantine open queue UI | Deferred Prompt 26 |
| Continuous integrity monitors | Deferred Prompt 27 |
| Production backup encryption/offsite | Ops gap — launch risk if unaddressed |
| Full FK constraints on JSON entities | Architectural limit of document store |
| Auto-merge / currency guess repairs | Correctly **not** implemented |
| Launch-blocking if Godot/browser were save authority | **Mitigated** |

### 72–78. Diagrams (textual)

**Authority:** Nakama session → Node JWT → ownership resolve → SQLite → Godot display  
**Account map:** `nakama_user_id` → `users.id` → `Character.created_by_id`  
**Ambiguous write:** mutate + commit → lost response → `RecoverAmbiguousRequest(claim/idempotency)` → same committed payload  
**Migration lifecycle:** register → dry-run → apply → validate → `migration_done` → schema_version  
**Backup/restore:** export JSON → isolated DB_PATH → import dry-run → apply → validate loads  
**DR sequence:** detect → maintain/write-drain → restore backup → migrate → reconcile premium → resume jobs → Godot connect  
**Godot recovery:** loading → GetRecoveryState → maintenance/review/pending/ready; never upload cache

---

## Commands

```bash
npm run test:integrity
npm run integrity:audit -- --character <id>
npm run integrity:migrate -- --list
npm run integrity:migrate -- --id integrity_framework_v1
npm run integrity:migrate -- --id integrity_framework_v1 --apply
npm run integrity:restore-drill -- --file ./server/data/migration/restore-drill-fixture.json
npm --prefix server run backup:export
npm --prefix server run backup:import -- --file ./data/migration/backup.json
```

## Player RPCs
- `GetRecoveryState` — presentation flags only
- `RecoverAmbiguousRequest` — committed lookup only

## Admin RPCs
- `RunIntegrityAudit`, `ApplyDataRepair` (dry-run default; `apply:true` to mutate), `SetMaintenanceMode`, `RunMigration`

## Deferred
- Full admin console (Prompt 26)
- Observability / scheduled global audits (Prompt 27)
- Production backup encryption, offsite retention, formal RPO/RTO commitments
- Complete per-system historical rebuild tooling beyond structural validators
