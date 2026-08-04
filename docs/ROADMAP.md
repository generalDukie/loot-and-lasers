# Backend roadmap

Architecture mandate: Nakama owns authentication/accounts/sessions only; Node owns
all gameplay. Phases 2–20 below record completed Nakama migration prototypes, not
the target gameplay authority. They are restoration inventory and must not be
expanded. Each gameplay domain returns to its existing Node authority in a
separate, tested phase after the authentication foundation.

| Phase | Status | Focus |
|-------|--------|-------|
| Auth restoration | Operational / protected | Short-lived Nakama-subject gameplay JWT, unique account mapping, Node selected Character, ownership-scoped reads, idempotent Character creation, Godot restore/reconnect/logout |
| Restorations 01–27 | Done (domain) | See `docs/PHASE_*.md` — Node gameplay authority restored per system |
| Restoration 28 | **Validated — NOT launch-ready** | Integration/security/ops audit: `docs/PHASE_PRODUCTION_READINESS.md`; `npm run test:restoration28` |
| Restoration 29 | **Presentation coverage** | Combat readability + status HUD + log + gated diagnostics; `docs/PHASE_PRESENTATION.md`; `npm run test:presentation` |
| Layer 2 | Done | Shared gameplay foundation — Character contract, formula authority, selected-Character resolution, Godot apply/selection mirroring (`docs/LAYER2_SHARED_FOUNDATION.md`) |
| Prompt 04 Progression | Done | XP curve, multi-level carryover, 2 permanent free attrs/level, shared `grantCharacterXp` (`docs/PHASE_PROGRESSION.md`) |
| Restoration 05 Attributes | Done | Authoritative permanent/effective attrs + derived stats on Node; EPA/enemy budgets shared; Godot sheet presentation (`docs/PHASE_ATTRIBUTES.md`) |
| Restoration 06 Inventory | Done | Atomic EquipItem/UnequipItem, locked equipped map, grant→pending overflow, Godot/web Node-only equip (`docs/PHASE_INVENTORY.md`) |
| Restoration 07 Gear Gen | Done | Shared `GenerateGearItem` / PCHIP budgets / exact allocation; sources already used `randomItem` (`docs/PHASE_GEAR_GENERATION.md`) |
| Pipeline 0 | Done | Cross-stack ownership/request audit and protected release baseline (`docs/GAMEPLAY_REQUEST_PIPELINE_AUDIT.md`) |
| Pipeline 1 | Done | Node entity scoping, shared selected-Character context, compatible structured errors |
| Pipeline 2 | Done | Godot request/error/timeout/retry contract using the existing `GameApiClient` |
| Pipeline 3 | Partial | Node equip/unequip authority restored; Nakama inventory/equipment shadow managers remain for compatibility |
| Pipeline 4 | Planned | Restore Godot shops to existing Node handlers |
| Pipeline 5 | Planned | Restore Arena and combat settlement to existing Node services |
| Pipeline 6 | Planned | Remove dead Nakama mission client paths; verify Node rewards and replay safety |
| Pipeline 7 | Planned | Regression verification for already-Node gameplay systems |
| Pipeline 8 | Planned | Public staging and Windows friend-installer release proof |
| 1 | Done | Nakama authentication |
| 2 | Done | Shared RPC framework |
| 3 | Done | Player profiles |
| 4 | Done | Read-only inventory |
| 5 | Done | Secure wallet (+ mutation lockdown) |
| 6 | Done | Read-only equipment |
| 7 | Done | Mission service core (no rewards) |
| 8 | Done | Mission authority migration |
| 9 | Done | Shared runtime library + `verify:backend` |
| 10 | Done | Remote config + feature flags |
| 11 | Done | Equipment mutations (equip/unequip) |
| 12 | Done | Central reward service (soft currency orchestrator) |
| 13 | Done | Server-authoritative loot generation (engine only) |
| 14 | Done | Mission rewards integration (`mission_claim`) |
| 15 | Done | Secure shop service (buy/sell/refresh) |
| 16 | Deferred / Design in progress | Shipment System — gameplay loop still being workshopped (crate rules, item eligibility, payouts, timing, destinations, bonuses, failure/risk). Revisit after a written gameplay specification is approved. No placeholder RPCs, storage, managers, feature flags, or config until then. |
| 17 | Done | Server-authoritative combat engine (`combat_simulate`) — reusable simulator only; no Arena/Dungeons/Bosses/Guild Wars/PvE modes |
| 18 | Done | Arena matchmaking and rankings (`arena_*` RPCs) — CombatService resolution, Elo + lower-rank penalties, history; no Arena rewards |
| 19 | Done | Friends, presence, and chat foundation (account-level Nakama friends/DM/global chat); no guild chat |
| 20 | Done | Server-authoritative mail (`mail_*` RPCs) — player text, system/reward (internal), claims via RewardService; no marketplace/guild mail/admin tools |
| 21+ | Planned | Progression/XP, fuel debit, premium shop parity, Arena rewards, user search, guild chat, and other post-mail work (excluding deferred shipments until Phase 16 is unblocked) |
| UI | In progress | Hero page QoL — loadout inventory, inspect popup, Node equip/use parity for listed items (`docs/HERO_PAGE_UI.md`). Does not migrate inventory authority to Nakama. |
| Wallet repair | In progress | Node Character compatibility ledger for Fuel/Stardust/Nova; shared Godot CurrencyManager; trusted Nakama→Node mutation bridge; idempotent operation receipts; realtime reconciliation (`docs/WALLET_ARCHITECTURE.md`). |

Before each backend commit: `npm run verify:backend`.
