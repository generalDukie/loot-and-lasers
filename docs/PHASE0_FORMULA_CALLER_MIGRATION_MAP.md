# Formula Caller Migration Map

Phase 0 did **not** migrate live callers. This map exists so later phases do not leave stale duplicates.

**Amendment:** Phase 1 wired character-progression callers (`xpToNext`, live `missionXpPerFuel` units, starting/free attrs, attrcost, sheet derived). XP is completely 1:1 (`PRODUCTION_XP_STORAGE_SCALE = 1`). `XP_STARDUST_SCALE = 10` is legacy economy implementation debt, not production XP or economy authority.

| Primitive | Future live callers | Suggested phase |
|---|---|---|
| XPToNext / missionXpPerFuel / XP unit scale | `server/src/shared/rewards.js` `expForLevel`; `src/lib/gameData.js`; Godot MissionBoard XP preview | **Phase 1 complete** — 1:1 units |
| Mission XP + independent variance + defeat half | Mission completion / `economyFormulas` / Godot preview | Phase 2 Missions |
| Mission Stardust + independent variance | Mission completion | Phase 2 Missions |
| StardustPerFuel | `src/lib/stardustEconomy.js` (already matching; keep as the live path until cutover) | Phase 2/4 economy |
| EPA / mission enemy budget 0.35 | `src/lib/expectedPlayerAttributes.js`; mission combat construction | Phase 2 Missions |
| Free attrs 35/35/20/5/5 | `server/src/shared/characterProgression.js` | **Phase 1 complete** |
| Attr cost closed form | `productionMath.attributePurchaseCost` (live Horner; PCHIP leftover unused) | **Phase 1 complete** |
| HP / raw ATK / universal variance | `src/lib/statEngine.js` / `arenaEngine.js` | Phase 3 combat |
| Crit 1.55/1.80/30% | `statEngine.js` | Phase 3 combat |
| Reflex AGI conversion + Dodge cap | `statEngine.js` | Phase 3 combat |
| Three-channel resists | `statEngine.js` (live Armor/Tech + dungeon 75% caps) | Phase 3 combat |
| Mission enemy base ramp | `statEngine.js` (already close) | Phase 3 combat |
| Mission outgoing × / context multipliers | `arenaEngine.js` / mission combat | Phase 3 combat |
| Gear base / Legendary 1.50 / slot premium | `src/lib/itemGeneration.js` | Phase 4 gear |
| PvE hidden budget offset (stat only) | dungeon/wormhole loot gen | Phase 4/5 PvE |
| Mission vs Dungeon rarity tables | mission loot; dungeon loot | Phase 2 / Phase 5 |
| Market 8-slot / rarity / stim bands / prices / resale / nova surcharge | `economyFormulas.js` shop generation | Phase 4 market |
| Stim duration stacking | stim engine | Phase 4 stim |
| Dungeon DRU + XP conversion | `dungeonEngine.js` / `economyFormulas.js` | Phase 5 PvE |
| Wormhole wormlevel / BandWeight / XP | dungeon/wormhole engine | Phase 5 PvE |
| Frontier bonus | PvE victory XP only | later PvE phase; formula ready |
| Arena XP 2.125 / SD 2.25 / grant order | arena reward service | Phase 6 Arena product+math |
| Mining 0.03 SPF/min snapshot | mining service (already matching) | Phase 4/6 |
| Fuel/Nova quantize + 100 free / 19:00 UTC clocks | `economyFormulas.js`, `server/src/shared/time/` | later product clocks |
| No Stardust wallet cap | `STARDUST_MAX` live constant | later persistence; not Phase 0 |
| Companies / Shipments / Commissions / GES | not production-math callers | later product phases; GES never |

XPToNext also feeds Dungeon/Wormhole BandWeight via `xpToNextDruReference` (share 0.60), which is **not** the player XP curve. Keep those two functions distinct during migration.
