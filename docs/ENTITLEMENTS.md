# Entitlements

## What an entitlement is

A trusted **server** record that an account or character may access, own, or consume something. It is not inventory, not a feature flag, and not a reward payload.

| System | Answers |
|--------|---------|
| Entitlements | What may this account/character use? |
| Inventory | Which item instances are held? |
| Rewards | What value to grant after a valid action? |
| Feature flags | Is the system available at all? |

## Architecture (this repo)

- Express + SQLite (`server/src/entitlements/`)
- Code registry: `definitions.js` + `products.js`
- Durable tables: `entitlements`, `entitlement_status_history`, `entitlement_consumptions`, `entitlement_audit`, `external_purchase_verifications`, `entitlement_outbox`
- Mutations only via `grantEntitlement` / `revokeEntitlement` / `consumeEntitlement` / `verifyAndClaimPurchase`
- Runtime checks use `resolveEntitlement` / guards — workers do not replace them

## Clock & expiration

Uses the shared `clock` module. Temporary rows store `expires_at` UTC. Resolution compares `clock.now()`; the `entitlement-expiry-sweep` schedule marks expired rows for audit/cache.

## Character slots

- Base capacity: **1**
- Each active `account.character_slot` quantity adds slots (max 3)
- `Character.create` calls `assertCanCreateCharacter`
- `BuyCharacterSlot` grants via entitlement service, then syncs `users.purchased_slots` as a denormalized cache for `/api/auth/me`
- Revoking a slot entitlement does **not** delete characters; new creates are blocked when over capacity

## Cosmetics / titles

Achievement titles grant `cosmetic.title.{achievementId}` (character scope). `unlocked_titles` / `active_title` are locked on entity PATCH. Equip still goes through `SyncAchievements`.

## Rename tokens

`account.rename_token` is consumable. `RenameCharacter` prefers a token unless `pay_with_nova: true`.

## Inventory expansion

`getInventoryCap` = 10 + cargo_hold ship mods + `account.inventory_expansion` quantity (server).

## Purchases

Product mappings in `products.js`. Stripe packages require server verification — **currently fails closed** until Stripe webhook/secrets exist. Set `ENTITLEMENT_DEV_VERIFY=1` only in non-production for local testing.

Internal Nova slot purchases use provider `internal_nova` with unique transaction keys.

## API

Player:

- `GET /api/entitlements/me`
- `GET /api/entitlements/definitions`
- `GET /api/entitlements/check/:key`
- `POST /api/entitlements/claim-purchase`

Admin (role=admin):

- `GET /api/entitlements/admin/search`
- `GET /api/entitlements/admin/:id`
- `POST /api/entitlements/admin/grant` (high-value needs `confirm: true`)
- `POST /api/entitlements/admin/:id/revoke|suspend|restore`
- `GET /api/entitlements/admin/audit`

## Register a new entitlement

1. Add definition to `definitions.js`
2. Optionally map a product in `products.js`
3. Call `requireEntitlement("your.key", { accountId })` in the protected function
4. Never trust client ownership booleans

## Grant example

```js
await grantEntitlement({
  entitlementKey: "account.rename_token",
  accountId: user.id,
  quantity: 1,
  sourceType: "administrator",
  idempotencyKey: `admin-rename:${user.id}:${requestId}`,
  createdBy: admin.email,
  metadata: { reason: "compensation" },
});
```

## Migration

On server boot, `migrateLegacyEntitlements()` imports:

- `users.purchased_slots` → `account.character_slot`
- Founder/admin legacy markers → `account.founder_status`
- Character `unlocked_achievements` titles → `cosmetic.title.*`

Flag: `app_meta.entitlements_migrate_v1`

## Tests

```bash
npm run test:entitlements
```

## Env

| Variable | Purpose |
|----------|---------|
| `ENTITLEMENT_CACHE_TTL_MS` | Resolution cache TTL (default 15000) |
| `ENTITLEMENT_DEV_VERIFY` | Allow unverified Stripe claims in non-prod only |

## Known gaps

- No live Stripe/App Store/Steam receipt verification yet
- No full subscription provider webhook pipeline
- Client bag UI does not yet load expansion entitlements (server still enforces)
- Equipped gear map still client-writable for `equipped_items` (separate from cosmetic entitlements)
