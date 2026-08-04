# Runbook — Observability

## Meaning
Operational signals for Loot & Lasers Node API. Telemetry does **not** prove
gameplay outcomes.

## Immediate checks
1. `GET /health/live` — process up?
2. `GET /health/ready` — DB + schema OK?
3. `GET /health/build` — release/build identity
4. Admin `GetOpsTelemetry` — metrics series + dependency notes
5. Search structured JSON logs for `request_id` from Godot/API response

## Containment
- Optional telemetry never requires restart for gameplay.
- If readiness fails on `database` / `schema` → treat as critical dependency.
- Maintenance mode is separate (writes drained); readiness still reports it.

## Do not
- Page on single 4xx validation failures
- Use analytics buffer as economy ledger
- Log `Authorization` headers or JWTs while debugging

## Escalation
Integrity findings → Prompt 25 tools (`RunIntegrityAudit`)  
Privileged abuse → Prompt 26 audit routes
