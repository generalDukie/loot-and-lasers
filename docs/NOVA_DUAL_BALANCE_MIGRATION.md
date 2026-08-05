# Nova Dual-Balance Migration Report

Date: 2026-08-05  
Feature: Wagerable (Purchased) vs Promotional (Bonus) Nova Crystals

## Audit conclusion

Prior to this change, Nova was a **single** Character balance stored as half-units. Only a subset of credits went through `creditNova` / `wallet_operations`:

| Source | Ledgered? | Class |
|--------|-----------|-------|
| Crystal pack grants | Yes (`nova_pack_grant`) | Purchased |
| Character creation 500 | Yes (`character_creation`) | Promotional |
| Casino payouts | Yes (`casino_payout`) | Recirculation |
| Daily login / mail / many admin grants | Often **no** (raw patch) | Promotional (intent) |
| Weekly quests | Was patch-only | Promotional |

**Origin of existing balances cannot be fully reconstructed.** Pack grants that explicitly reference a character id are the only strong purchased signal.

## Migration policy (applied)

Migration key: `nova_dual_balance_v1` in `app_meta` + per-character flags.

For each Character:

1. `total = nova_crystals` (half-units)
2. Sum `wallet_operations` credits with `category: nova_pack_grant` **and** `related_entity_id` / `character_id` matching this character → `evidenced_wagerable`
3. `wagerable = min(total, evidenced_wagerable)`
4. `promotional = total - wagerable`
5. Classification tag stored on character:
   - `pack_evidence_full`
   - `pack_evidence_remainder_promotional`
   - `uncertain_remainder_as_promotional` ← **no pack evidence; remainder not treated as purchased**
   - `empty`

### What we did **not** do

- Did **not** classify all existing Nova as Purchased
- Did **not** invent purchased amounts without pack ledger evidence
- Did **not** delete or rescale total Nova

## Forward rules

| Event | Balance type |
|-------|----------------|
| Character creation 500 | Promotional |
| Daily / weekly / quest / mail / promo rewards | Promotional |
| Crystal pack / IAP | Wagerable |
| Admin grant Purchased | Wagerable |
| Admin grant Bonus | Promotional |
| Casino wager debit | **Wagerable only** |
| Casino payout credit | **Wagerable** |

Non-casino Nova sinks (fuel, shop, skips) debit **promotional first**, then wagerable.

## Precision

- Display Nova continues as 0.5 increments (half-units ×2)
- Casino Nova wagers accept `.0` / `.5`
- Nova payouts use `FLOOR_TO_0.5(wager × mult)`

## Follow-up for ops

If a player can prove a historical purchase that was not attributed (missing `related_entity_id` on pack receipts), admin can grant Purchased Nova with reason after review. Review characters tagged `uncertain_remainder_as_promotional` if support tickets arise.
