# Phase 3 Combat Caller Migration Map

Full evidence: [`docs/PHASE3_COMBAT.md`](./PHASE3_COMBAT.md).

| Caller | Old path | New authoritative engine | Context | Passive authority | Client presentation | Old disposition |
|---|---|---|---|---|---|---|
| **Mission** | `PrepareMissionCombat` → `simulateBattle` via `statEngine` derived stats | `SimulateCombat` → `arenaEngine` + `combatMath` | Live: player ×1.0 (canonical Base Damage), enemy ×1.0 (certified Mission outgoing **staged** until Phase 4). Primitive still `missionEnemyOutgoingMultiplier(EL)` | Production `classPassives.js`; foes suppressed | Godot overlay replays `events` | Curve locked; live application deferred |
| **Arena** | `PrepareArenaCombat` → same engine, old math | Same | `arena`: both ×1.0; canonical player Base Damage both sides | Full class passives | Same overlay | Ladder Finish uses committed pending winner |
| **Dungeon** | `PrepareDungeonCombat` | Same | `dungeon`: player ×1.0 / enemy native Base Damage ×1.10 | Player passives; foes suppressed | Same overlay | Rewards not migrated |
| **Wormhole** | Dungeon prepare + `viewing_wormhole` | Same | Same multipliers as dungeon | Same as dungeon | Same overlay | Reward formulas not migrated |

Guild war Node path uses the same `simulateBattle` with `content: "arena"`. Nakama `combat_simulate` is historical and unused by Godot live Prepare*.
