# Phase 3 Combat Caller Migration Map

Full evidence: [`docs/PHASE3_COMBAT.md`](./PHASE3_COMBAT.md).

| Caller | Old path | New authoritative engine | Context | Passive authority | Client presentation | Old disposition |
|---|---|---|---|---|---|---|
| **Mission** | `PrepareMissionCombat` → `simulateBattle` via `statEngine` derived stats | `SimulateCombat` → `arenaEngine` + `combatMath` | Live: player ×1.0, enemy ×1.0 (certified Mission outgoing **staged** until Phase 4). Primitive still `missionEnemyOutgoingMultiplier(EL)` | Production `classPassives.js`; foes suppressed | Godot overlay replays `events` | Curve locked; live application deferred |
| **Arena** | `PrepareArenaCombat` → same engine, old math | Same | `arena`: both ×2.5 | Full class passives | Same overlay | Ladder Finish uses committed pending winner |
| **Dungeon** | `PrepareDungeonCombat` | Same | `dungeon`: player ×2.5 / enemy ×2.75 | Player passives; foes suppressed | Same overlay | Rewards not migrated |
| **Wormhole** | Dungeon prepare + `viewing_wormhole` | Same | Same multipliers as dungeon | Same as dungeon | Same overlay | Reward formulas not migrated |

Guild war Node path uses the same `simulateBattle` with `content: "arena"`. Nakama `combat_simulate` is historical and unused by Godot live Prepare*.
