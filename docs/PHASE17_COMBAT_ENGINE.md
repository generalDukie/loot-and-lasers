# Phase 17 — Server-authoritative combat engine

Reusable combat simulator for every future combat mode. This phase does **not** implement Arena, Dungeons, Bosses, Guild Wars, Missions combat, or PvE content — only the core engine and `combat_simulate` RPC.

## Architecture

```
Godot  →  combat_simulate (intent only)
Nakama →  load equipment + derive stats
       →  deterministic RNG
       →  simulate until KO / max rounds
       →  persist result
       →  return winner + combat_log
Godot  →  animate from combat_log (never invent outcomes)
```

Module: `modules/combat.lua`  
Formulas: `modules/lib/combat_formulas.lua` (ported from `src/lib/statEngine.js`)  
RNG: `modules/lib/rng.lua` (FNV-ish seed + LCG)

Internal entry point `simulate_combat(player, opponent, seed)` is returned from the module for future Arena / raids / duels to call without going through the RPC.

## Ownership / authority

- Authenticated `user_id` from session only
- `character_id` must match profile `selected_character_id`
- Equipment loaded from Nakama `equipment` collection
- Attribute totals = class base + equipped `metadata.stats` (never client stats)
- Opponent must be a **server template** (`opponent_source`)
- Client may **not** submit: damage, hit/crit/dodge results, RNG/seed, stats, HP, buffs, cooldowns, winner, equipment, etc.

## Public RPC

| RPC | Purpose |
|-----|---------|
| `combat_simulate` | Run one authoritative duel vs a training template |

### Payload (allowed keys only)

| Field | Required | Notes |
|-------|----------|-------|
| `request_id` | yes | Idempotency + seed material |
| `opponent_source` | yes | Server template id |
| `character_id` | no | Must match selected character |
| `class` | no | Allowlisted class for archetype/base (default Vanguard) |
| `level` | no | Clamped 1–100 for soft-cap curves (default 1) |

Until ProgressionService exists, `class` / `level` are soft inputs for base selection and soft-caps only — they never accept raw combat stats.

### Response (`data`)

- `winner`: `"player"` \| `"opponent"`
- `combat_log`: ordered event array (see schema)
- `player` / `opponent`: end-state snapshots (totals, HP, derived rates)
- `rounds`, `truncated`, `initiative_first_side`, `seed`, `replay`

## Opponent sources (v1)

| Id | Role |
|----|------|
| `training_dummy` | Baseline Vanguard L1 |
| `training_equal` | Mirrors challenger class/level, class base only |
| `training_crit` | High luck / crit template |
| `training_dodge` | High agility / dodge template |
| `training_tank` | High vitality + armor archetype |
| `training_glass` | Low HP stress case |
| `training_healer` | `heal_per_round` regen hook |

## Combat flow

1. Load player equipment → derive totals → max HP / crit / dodge / armor / tech resist / primary damage
2. Build opponent from template
3. Seed RNG from `user|character|opponent|request_id|equipment_fingerprint|class|level`
4. Roll initiative (50/50)
5. Each round: attack → dodge check → hit → damage variance → crit → mitigation → barrier → apply HP → optional regen
6. Stop when one side HP ≤ 0, or `MAX_ROUNDS` (200)
7. Draw prevention: simultaneous KO or HP tie → challenger (`player`) wins; timeout → higher HP, else challenger
8. Persist under `combat_transactions` / `request_id`

## Formulas

Aligned with `src/lib/statEngine.js` / Godot `MissionCombat` / `StatsRules`:

| Concept | Formula / caps |
|---------|----------------|
| Max HP | `round(50 + 2.5×VIT + 0.008×VIT²)` |
| Soft-cap % | attr vs level curve; caps CRIT 30, DODGE 25, ARMOR/TECH 30 |
| Base damage | `15 + 0.0032 × primary^1.727` |
| Variance | universal 0.90–1.10; AGI also 0.80–1.05 |
| Crit | chance from Luck soft-cap; multiplier **1.5** |
| Dodge | chance from Agility soft-cap (no separate hit-chance stat) |
| Armor | Strength soft-cap for non-STR classes |
| Tech resist | Intellect soft-cap for non-INT classes |
| Mitigation | `damage *= (1 - mit)` for matching damage type |

## Combat log schema

Each entry is an object. Common fields: `round`, `type`, `text`.

| `type` | Meaning |
|--------|---------|
| `combat_start` | Engine banner |
| `initiative` | `first_side` |
| `attack_start` | Attacker declares |
| `dodge` | Miss via dodge |
| `hit` | Attack connected |
| `crit` | Critical confirmed |
| `damage` | `damage`, `hp`, `crit`, `mitigation`, optional `barrier_absorbed` |
| `heal` | Regen / future heals |
| `timeout` | Max rounds |
| `draw_break` | Tie-break rule applied |
| `combat_end` | `winner` |

Godot should animate strictly from this list.

## RNG / replay

- Never uses Godot or `math.random` for outcomes
- Same `request_id` + same inputs → identical stored result (`replay: true`)
- Changing equipment / class / level / opponent with same `request_id` → `409` conflict

## Feature flag

`combat_simulate_enabled` — default **on** when missing.

## Future integrations (not in this phase)

Plug-in modes should:

1. Build two (or more) fighter snapshots from authoritative sources
2. Call `simulate_combat` (or a thin wrapper) with a server seed
3. Apply mode-specific rewards via RewardService / LootService afterward

Candidates: Arena, Guild Wars, Bosses, Missions, Raids, World Bosses, Friends Duels, PvE.

## Known limitations

- No class passives, stims, or orbital extras (Godot MissionCombat has these)
- No ProgressionService — class/level still soft client inputs (clamped/allowlisted)
- Gear often has empty `metadata.stats` until loot/shop populate attributes
- Barrier/shield field exists (always 0 in v1 templates)
- Buffs/debuffs arrays present but unused beyond `heal_per_round`
- Training templates only — no player-vs-player character lookup yet
- No wallet/XP/loot side effects from combat

## Verification

`scripts/verify_combat_engine.mjs` via `npm run verify:backend`.
