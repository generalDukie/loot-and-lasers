# Audit Logs

Centralized, append-only audit history for support, security, economy, and admin accountability.

## Purpose

Audit logs answer *what changed, who caused it, and why* for important game and admin actions. They are separate from:

| System | Purpose |
|--------|---------|
| **Audit logs** | Evidence / support / accountability |
| **Application logs** | Developer diagnostics (`console.*`) |
| **Analytics** | Product metrics |
| **Domain events / outbox** | Reactive backend workflows (`reward_outbox`, etc.) |

Domain ledgers (rewards, entitlements, arena) remain. The central audit system covers gaps and dual-writes selected reward completions.

## Stack fit

- SQLite tables via `server/src/audit/store.js` (`ensureSchema` on import)
- Writer: `server/src/audit/writer.js`
- Routes: `GET/POST /api/audit/admin/*` (admin only)
- Admin UI: **Admin → Audit**

## Writing an audit entry

```js
import { recordCurrencyChange, ActorTypes } from "../audit/index.js";

// Inside withTransactionAsync — shares the open transaction:
recordCurrencyChange({
  user,
  character,
  currencyType: "stardust",
  before: 1000,
  after: 500,
  reasonCode: "shop_purchase",
  actorType: ActorTypes.PLAYER,
  correlationId,
});
```

Critical admin actions require `reasonText` / `administratorNote`.

Unknown actions are rejected (`AUDIT_UNKNOWN_ACTION`).

## Idempotency

Pass `idempotencyKey`. Retries return the original row with `idempotentReplay: true`.

Reward bridge keys: `reward_audit:{claimId}:reward_claimed`.

## Searching

```
GET /api/audit/admin/search?category=currency&accountId=...&limit=50&offset=0
GET /api/audit/admin/:id
GET /api/audit/admin/timeline/:accountId
GET /api/audit/admin/correlation/:correlationId
GET /api/audit/admin/item/:itemId/provenance
```

PATCH/PUT/DELETE on audit rows return `405 AUDIT_IMMUTABLE`.

## Annotations

Annotations are separate rows. They never rewrite the original entry. Creating an annotation also records `audit_annotation_created`.

## Redaction

Passwords, tokens, secrets, and similar keys are replaced with `[redacted]` before JSON persistence.

## Integrity

Each entry stores `contentHash`, `previousEntryHash`, `chainScope`, and `chainSequence` (per-account / per-actor / per-category chain). This is tamper-*evidence*, not a cryptographic guarantee of WORM storage.

## Retention classes

See `RetentionClasses` / `RETENTION_DAYS` in `registry.js`. Holds table exists for future purge jobs; no automatic purge ships yet for unresolved security/support cases.

## Tests

```bash
npm run test:audit
```

## Registering a new action

1. Add to `AUDIT_ACTIONS` in `server/src/audit/registry.js` with category, severity, retention, and `critical` if needed.
2. Call `recordAuditEntry` / helpers from the authoritative server path inside the same transaction when critical.
3. Never trust client actor IDs, timestamps, or balances for the audit payload — resolve from auth + DB.
