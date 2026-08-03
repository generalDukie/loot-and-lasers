# Wallet architecture

## Compatibility authority

During the dual-stack migration, the selected Node `Character` is the authoritative
ledger for all player-facing balances:

- `fuel`
- `stardust`
- `nova_crystals`

These balances are character-scoped. The Nakama `wallets/wallet` document remains
for backward-compatible storage and diagnostics, but the Godot client does not merge
or sum it with Character balances. Historical Node and Nakama Stardust values may
already differ; Node wins for the compatibility phase.

## Client contract

`loot&lasers/Autoload/CurrencyManager.gd` is the only client balance source.

Responsibilities:

1. Hydrate Fuel, Stardust, and Nova from an authoritative Character response.
2. Apply complete normalized wallets returned by trusted backend actions.
3. Reject another character's payload, replayed transaction IDs, incomplete
   realtime payloads, and older request sequences.
4. Clear all balances on logout/account switch.
5. Reconcile once from Node after character selection and socket reconnect.
6. Emit:
   - `wallet_changed(wallet)` for backward compatibility.
   - `balances_changed(balances, changed_currency_ids, source)`.
   - `balance_changed(currency_id, balance, source)`.
   - `loading_changed(loading)` and `wallet_error(error)`.

The UI may call `get_balance` and `can_afford` for display-only previews. Backend
validation is always final. UI scripts never author or deduct a balance.

## Normalized response

Trusted Node actions and the Nakama-to-Node bridge return a complete wallet:

```json
{
  "wallet_version": 2,
  "character_id": "character-id",
  "balances": {
    "fuel": 80,
    "stardust": 12500,
    "nova_crystals": 40
  },
  "source": "mission_start",
  "transaction_id": "safe-idempotency-key",
  "revision": 42,
  "updated_at": 1785780000000
}
```

Balances are results, never client inputs. Partial realtime payloads are not applied;
they trigger reconciliation.

## Mutation flow

### Node-backed action

`UI → manager → GameApiClient → Node transaction → Character + normalized wallet
→ CurrencyManager → wallet signals → every open display`

Managers apply full Character responses through `GameManager.apply_active_character`
and patches through `GameManager.apply_active_character_patch`.

### Nakama-backed action

`UI → manager → Nakama RPC → trusted server-to-server wallet bridge → Node
Character transaction → normalized wallet → Nakama action result → CurrencyManager`

Godot cannot call a generic wallet mutation endpoint. The private bridge requires a
shared server secret, verifies the Nakama account-to-Node-user mapping and Character
ownership, and accepts only allowlisted operation semantics.

Runtime configuration:

- Node: `LOOT_WALLET_BRIDGE_SECRET`.
- Nakama: the same `LOOT_WALLET_BRIDGE_SECRET`.
- Nakama: `LOOT_NODE_INTERNAL_URL` (base URL for the Node API; local Docker defaults
  to `http://host.docker.internal:8787`).

The bridge fails closed when the URL or secret is absent. Generate a separate random
secret for each environment; never reuse the JWT secret or commit the value.

## Currency flows

### Fuel

- Storage: Node `Character.fuel` / `max_fuel`.
- Purchase: Node `BuyFuel`, with a stable request ID from `MissionManager`.
- Reset/sync: Node `SyncFuelCycle`.
- Mission launch: Nakama derives the cost from its authoritative mission snapshot;
  the trusted bridge applies the Node debit before the mission becomes successful.

### Stardust

- Storage: Node `Character.stardust`.
- Node sources/sinks continue through existing Node economy functions.
- Nakama mission rewards, shops, and attachment rewards use the trusted bridge.
- Nakama and Node Stardust are never added together.

### Nova Crystals

- Storage: Node `Character.nova_crystals`.
- Node premium purchases and existing sinks remain Node-backed.
- Mission skip uses a deterministic mission operation key, preventing a retry from
  debiting twice.

## Idempotency and failure handling

- `wallet_operations` stores server-side operation receipts keyed by account,
  operation type, and operation key.
- Replays return the current Character/wallet, not a stale stored balance.
- Insufficient funds and negative results are rejected inside the Node transaction.
- Fuel purchases retain an ambiguous network request ID and reuse it on retry.
- Nakama request IDs are stable for the same shop offer/item/revision or mission.
- If a bridged payment succeeds and the gameplay write fails, the server attempts an
  idempotent compensation. A failed compensation is a recoverable transaction state,
  not silent partial success.

## Realtime and stale responses

`RealtimeManager` owns the existing sockets. It accepts `wallet_updated` only when
the payload has the selected `character_id` and all three balances. A safe payload
contains source and transaction ID; private transaction metadata is omitted.

On Nakama reconnect, the client performs one coalesced Node Character reconciliation.
It does not start another socket or poll `wallet_get`.

Current stale protection uses client request ordering, transaction replay detection,
and bridge receipt revision where supplied. Character rows do not yet have a native
economy revision; an event without a complete valid revision is reconciled.

## Account and character switching

`AuthManager` and account deletion/logout paths call
`GameManager.clear_active_character`. This clears `CurrencyManager` before the next
account or character can render. Selecting a character hydrates the wallet from that
Character and then reconciles from Node.

## Verification

Run:

```bash
npm run verify:wallet
npm run verify:backend
```

The wallet gate checks the singleton manager, three-currency normalization, UI
subscriptions, absence of direct UI balance mutation, manager routing, logout
clearing, realtime reconciliation, operation receipts, and documentation.

The Godot script audit remains:

```bash
Godot --headless --path "loot&lasers" -s res://_audit_all.gd
```

## Known migration limitation

The old account-scoped Nakama wallet can contain historical balances that differ
from Node Character balances. This phase intentionally does not migrate or sum them.
A future account-wallet migration must define multi-character merge policy and run
an explicit, audited data migration.
