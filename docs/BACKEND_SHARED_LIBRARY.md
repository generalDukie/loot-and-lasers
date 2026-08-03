# Backend shared library

Shared Nakama Lua helpers live under `modules/lib/`. Service modules (`profile`, `inventory`, `equipment`, `wallet`, `missions`) should prefer these helpers for duplicated plumbing.

## Import convention

```lua
local auth = require("lib.auth")
local responses = require("lib.responses")
local validation = require("lib.validation")
local storage = require("lib.storage")
local time = require("lib.time")
local ids = require("lib.ids")
local logging = require("lib.logging")
local transactions = require("lib.transactions")
```

Nakama resolves `lib.*` from `modules/lib/*.lua`.

## Modules

| File | Responsibility |
|------|----------------|
| `auth.lua` | `context.user_id`, profile read, character ownership vs `selected_character_id` |
| `storage.lua` | read/write/delete one object; returns found/version; does not hide errors |
| `validation.lua` | payload decode, identity-field rejection, strings/ints/enums |
| `responses.lua` | JSON envelopes with Godot-compatible `status_code` + stable `code` |
| `time.lua` | server unix/ms/ISO UTC |
| `ids.lua` | UUID / request correlation ids |
| `logging.lua` | structured info/error without secrets |
| `transactions.lua` | transaction_id / reason / source validation helpers |

## Response format

Godot-compatible (preserved):

```json
{ "success": true, "data": {}, "error": "", "status_code": 200, "code": "OK" }
```

Errors:

```json
{ "success": false, "data": {}, "error": "…", "status_code": 400, "code": "INVALID_PAYLOAD" }
```

Stable codes: `OK`, `UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_PAYLOAD`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INSUFFICIENT_FUNDS`, `STORAGE_ERROR`, `INTERNAL_ERROR`, `UNPROCESSABLE`.

## What stays local

- Wallet `apply_delta` / currency registry / OCC wallet writes
- Equipment null-slot JSON encoding
- Mission generation templates, refresh cooldown, state machine
- Profile display-name / appearance validators

## Consistency limits

Multiple Nakama `storage_write` calls are **not** fully atomic. Callers that need consistency use OCC retries (wallet, missions). Document that limitation when adding multi-object writes.

## Logging safety

Never log session tokens, passwords, cookies, purchase secrets, or full sensitive payloads.
