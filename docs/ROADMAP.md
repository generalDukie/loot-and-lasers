# Backend roadmap

Architecture mandate: Nakama owns authentication/accounts/sessions only; Node owns
all gameplay. Phases 2–20 below record completed Nakama migration prototypes, not
the target gameplay authority. They are restoration inventory and must not be
expanded. Each gameplay domain returns to its existing Node authority in a
separate, tested phase after the authentication foundation.

| Phase | Status | Focus |
|-------|--------|-------|
| Auth restoration | In progress | Short-lived Nakama-subject gameplay JWT, unique account mapping, Node selected Character, ownership-scoped reads, idempotent Character creation, Godot restore/reconnect/logout |
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
