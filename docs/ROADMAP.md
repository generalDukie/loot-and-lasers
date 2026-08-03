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
| 15+ | Planned | Progression/XP, fuel debit, arena rewards, etc. |

Before each backend commit: `npm run verify:backend`.
