# Phase / Restoration 17 — Stim System

Architecture: **Nakama = auth only.** Node owns Stim inventory activation,
`active_buffs` persistence, and effective-attribute application. Godot is
presentation + `UseConsumable` / `GetActiveStims` / `DismissActiveBuff` only.

## Completion report

### 1–7. Authoritative implementation found

| Concern | Location |
|---------|----------|
| Definitions | `CONSUMABLE_TIERS` in `economyFormulas.js` (+ mirror `gameData.js`) |
| Activation | `UseConsumable` → `prepareConsumableBuffs` |
| Persistence | `Character.active_buffs[]` (`stat`, `mult`, `rarity`, `duration_hours`, `stacks`, `expires_at`, `last_applied_at`) |
| Dismiss | `DismissActiveBuff` |
| Attributes | `statEngine.computeTotalStats` → permanent then `applyBuffs` (Stim last) |
| Godot | `AuthManager.use_consumable` / `refresh_active_stims` / `dismiss_active_buff` |

No separate Nakama Stim store. No Godot local activation math.

### 2–4. Valid rarities & attributes

| Rarity | Bonus | Base | Max (×3 stacks) |
|--------|------:|-----:|----------------:|
| Uncommon | +5% | 6h | 18h |
| Rare | +10% | 12h | 36h |
| Epic | +20% | 24h | 72h |

Attributes: Strength, Agility, Intellect, Vitality, Luck only.  
Common/Legendary **not** in `CONSUMABLE_TIERS`. Legacy `common`/`major` labels remap via `resolveStimRarity`; activation then **clamps** to tier mult/duration.

### 5–6. Inventory & activation

- Stims are inventory `Item` rows (`type: consumable`); activation **deletes** one item instance
- `prepareConsumableBuffs` validates; item deleted only on `ok`
- New: `UseConsumable` idempotent via `wallet_operations` (`use_consumable` + `item:{id}` or `request_id`)
- Client-forged body fields (`mult`, `duration`, `rarity`, …) stripped

### 8–11. Interaction rules (recovered)

| Case | Behavior |
|------|----------|
| Same rarity | Remaining + base, cap at max; bonus unchanged; blocked until half that tier's base duration has elapsed since `last_applied_at` |
| Higher rarity | **Replace**; duration = **now + new base** (fresh; old remaining discarded) |
| Lower rarity | **Reject**, no consume |
| 4th attribute | **Reject**, no consume |
| Expired same-attr | Treated as empty; fresh activation |

### 12. Expiration

Soft filter on every read (`getActiveBuffs` / `getActiveStims` / `prepareConsumableBuffs`).  
`GetActiveStims` also soft-cleans expired rows from Character. Offline time does **not** pause.

### 13. Vitality / Current HP

No persistent `current_hp` on Character — Max HP is derived at combat snapshot from Vitality.  
Policy: **recalculate at encounter start**; no unauthorized heal on Stim activate. Current HP cannot exceed Max HP inside combat snapshots.

### 14–19. Integration

| Mode | Status |
|------|--------|
| Effective attributes | Stim final multiplier on completed permanent+gear |
| Mission / Dungeon / Arena combat | Shared `computeTotalStats` / combat snapshot at prepare |
| Mining | Isolated — level/time only; Stims do not alter rewards |
| Arena bots | No inventory Stims unless separately designed |

### 20–21. Acquisition / vendor

- Mission/shop drop weights: server Uncommon **40%** / Rare **40%** / Epic **20%** (authoritative)
- Web `gameData.randomConsumable` may still differ for client-only previews — **acquisition balance not redesigned**
- Shop buy/sell primitives: `STIM_SHOP_MULT` / `STIM_SELL_MULT` via production `stardustPerFuel` (Phase 6 Market purchase is not implemented)
- Day-23 login: fixed **Rare Vitality Stim +10%** (was invalid Major 15%)

### 22–25. Files changed

**Node:** `economyFormulas.js` (clamp, serialize, getActiveStims), `economy.js` (UseConsumable idempotency, GetActiveStims), `rewards.js`  
**Web:** `gameData.js` clamp, `dailyLoginEngine.js`, `InventoryFullModal.jsx` (always UseConsumable)  
**Godot:** `AuthManager.gd` request_id + `refresh_active_stims`  
**Tests:** `test-stims.mjs`  
**Docs:** this file

### 26–27. Removed / repaired

- InventoryFullModal client `Character.update({ active_buffs })` path removed
- Legacy Major 15% login Stim repaired
- Item-forged mult/duration no longer authoritative on activate

### 28–30. Transaction / idempotency / recovery

- Single DB transaction: validate → delete item → write `active_buffs` → wallet receipt
- Retry same `item_id` / `request_id` returns prior result without re-consume
- Reconnect: character load + `GetActiveStims`; expiry by server timestamps

### 31. Security

- Entity API blocks client writes to `active_buffs`
- Activation ignores client mechanical fields
- Ownership check on item
- Attribute whitelist; invalid derived targets rejected

### 32–35. Tests

```
npm run test:stims          # definitions, stack, replace, reject, clamp, attributes
npm run test:arena-authority / test:economy / test:dungeon  # regressions as needed
```

### 36–39. Unresolved / deferred

- Full dedupe of `gameData.js` vs `economyFormulas.js` Stim helpers (logic synced; single module import deferred)
- Web client drop-weight preview drift (non-authoritative)
- Stim stack **quantity** on one Item row (current model: one Item = one use)
- Stress harness for concurrent multi-device activation (wallet key covers item-level idempotency)

### 40–44. Diagrams

**Activation**

```
JWT → UseConsumable(item_id)
  → load owned Item → prepareConsumableBuffs (tier clamp)
  → delete Item + write active_buffs + wallet receipt
  → attribute sheet + active_stims → Godot
```

**Same-rarity**

```
remaining + baseDuration → min(maxDuration) → one effect, same mult
```

**Higher rarity**

```
replace mult/rarity → expires = now + newBase (fresh) → stacks = 1
```

**Effective attribute**

```
permanent (base+purchases+gear+race) × (1 + stimMult) → ROUND
→ derived combat stats
```

**Expiration / reconnect**

```
expires_at vs server now → omit from getActiveBuffs
→ GetActiveStims soft-clean → Godot countdown from expires_at
```
