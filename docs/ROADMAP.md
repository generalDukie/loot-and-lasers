# Backend roadmap

| Phase | Status | Focus |
|-------|--------|-------|
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
| 17+ | Planned | Progression/XP, fuel debit, premium shop parity, and other post-shop backend work (excluding deferred shipments until Phase 16 is unblocked) |

Before each backend commit: `npm run verify:backend`.
