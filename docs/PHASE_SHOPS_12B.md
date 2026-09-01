# Phase / Restoration 12B — Shop Purchasing, Transactions, Sold-Out, Recovery & Security

> **HISTORICAL.** Live purchase / Sold Out / backpack / idempotency authority is Phase 6: `docs/PHASE6_BLACK_MARKET.md`.

Architecture: Nakama = auth only. **Node owns purchase settlement.** Godot presents
balances, sold-out, and pending UI — never deducts currency or inserts items.

Builds on Restoration 12A (`docs/PHASE_SHOPS_12A.md`).

## Completion report

### 1. Purchase pipeline

```
BuyShopGear / BuyShopConsumable
  → assertShopPurchaseClientSafe (reject cost/price/balance fields)
  → normalizeOperationKey(request_id)
  → withTransactionAsync (SQLite IMMEDIATE)
  → requireMyChar (ownership)
  → wallet_operations replay if request_id known
  → normalizeShopMeta + stock/generation checks
  → validate slot + sold-out maps
  → server listing cost (+ optional haggle roll)
  → balance checks
  → grantItemOrPending (Prompt 06 inventory path)
  → mark purchased / yanked on shop_meta
  → Character.update (currency + shop_meta)
  → auditShopPurchase
  → saveWalletOperation receipt
  → serializeShopPresentation
```

Sequence commits exactly once per `request_id`.

### 2. Currency validation

- Balances read from authoritative Character fields inside the transaction.
- Price from persisted `slot.cost` / `slot.nova_cost` only.
- Client `cost`, `price`, `stardust`, `nova*`, `discount`, `currency`, etc. → **400 SHOP_PRICE_TAMPER**.
- Insufficient funds → 400 before mutation.

### 3. Inventory integration

`grantOrCompensate` → `grantItemOrPending` / `collectGrant` (Prompt 06).
Gear: `stripShopFields(slot)` preserves generated stats — **no regen at buy**.
Stim: same definition/pricing as listing — **no rarity reroll**.
Full bag → pending_loot (charge kept; item not lost).

### 4. Sold-out implementation

| Flag | Meaning |
|------|---------|
| `shop_meta.purchased[slotId]` | Bought |
| `shop_meta.yanked[slotId]` | Haggle fail |
| `hot_purchased` / `hot_yanked` | Hot Deal outcomes |

Persists on Character JSON across logout/restart. Cleared only by window rotate /
`RefreshShop` new inventory (not by reconnect).

Unlimited slots: none in recovered Black Market — every stall is one-shot until refresh.

### 5. Recovery strategy

1. Client sends stable `request_id` (Godot keeps pending id until success).
2. Lost response → retry same `request_id` → `idempotent_replay` with same receipt
   (costs, item ids, haggle outcome) + live shop presentation.
3. Without `request_id`, sold-out maps still block a second debit for the same slot.

### 6. Idempotency

`wallet_operations` rows:

- `buy_shop_gear`
- `buy_shop_consumable`

Keyed by `(account_id, operation_type, operation_key)`.

Receipt includes: `transaction_id`, `slot_id`, `cost`, `nova_cost`, `items`,
`pending_loot`, `refresh_id`, `vendor`, haggle fields.

### 7. Concurrency

SQLite `BEGIN IMMEDIATE` serializes writers. Second concurrent buy for the same
slot sees sold-out → 409. Same `request_id` after commit → replay.

### 8. Database changes

None new. Reuses `wallet_operations` + Character `shop_meta`.

### 9. Node changes

- `server/src/functions/economy.js` — hardened `BuyShopGear` / `BuyShopConsumable`
- `server/src/shared/shopService.js` — tamper detection, `shopMetaHasStock`
- `server/scripts/test-shop-purchases.mjs` — **new**
- `package.json` — `test:shop-purchases`
- `scripts/verify_shop_service.mjs` — 12B static checks

### 10. Godot / web changes

- `loot&lasers/Autoload/ShopManager.gd` — `request_id` + `refresh_id` on buys;
  pending id retained across transport failure until success
- `src/pages/ShopPage.jsx` — same

Godot still applies only authoritative Character patch / shop_meta from Node.

### 11. Regression risks

- Buys against empty/rotated meta now **409 SHOP_STOCK_EXPIRED** (must EnsureShop)
  instead of silent mid-buy regen
- Clients omitting `request_id` still work but lose transport-level replay
- Full-bag still charges and parks in pending_loot (Phase 15 wanted reject — retained)

### 12. Outstanding issues

- Dedicated `shop_transactions` table not added (receipts in `wallet_operations` + audit)
- Sell-to-vendor depth remains inventory dissolve path
- Concurrent multi-device without shared `request_id` relies on sold-out race (safe)
- Haggle entropy not seeded per request (acceptable; outcome stored in receipt)

### Security rejects

| Case | Code / status |
|------|----------------|
| Client cost/price/balance | `SHOP_PRICE_TAMPER` 400 |
| Sold out / yanked | `SHOP_SOLD_OUT` 409 |
| Wrong refresh id | `SHOP_GENERATION_MISMATCH` 409 |
| Empty / rotated stock | `SHOP_STOCK_EXPIRED` 409 |
| Wrong character / no character | gameplayContext 4xx |
| Insufficient SD / Nova | 400 |

### Tests

```
npm run test:shop-purchases  → 11 passed
npm run test:shops           → 13 passed (12A regression)
```

### Status

**12B complete** — purchases are atomic, server-priced, inventorial via Prompt 06,
idempotent with `request_id`, and sold-out durable. Godot does not settle.
