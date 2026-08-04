# Phase / Restoration 27 — Telemetry, Logging, Operational Monitoring

Architecture: **Observability watches Node gameplay authority**. It does not create
progression, rewards, economy, or Arena state. Analytics ≠ Prompt 19 statistics.

## Completion verdict

Restored **in-process** structured logging, redaction, request correlation,
bounded metrics, health probes, non-authoritative analytics ingest, and a Godot
`DiagnosticLogger` — without inventing an external APM (Datadog/Grafana/OTel)
that was not in the product stack. Honest gaps: no hosted dashboards/alerts,
no crash-reporting vendor, no distributed tracer exporter.

---

## Audit summary (before)

| Area | Was |
|------|-----|
| Node logs | Ad-hoc `console.*` |
| Metrics | None (Nakama Prometheus only in compose) |
| Health | Single `/health` |
| Correlation | Audit `newCorrelationId`; no HTTP `X-Request-Id` |
| Analytics | Spend entities + career stats (authority elsewhere) |
| Godot | Scattered `print` / `push_error` |
| Secrets risk | OTP + reset tokens printed when SMTP off |

---

## Completion report (selected)

### Logging
- **Structured logger:** `server/src/shared/observability/logger.js` (JSON lines)
- **Schema fields:** `ts`, `severity`, `service`, `environment`, `release`, `build`, `message`, plus redacted context (`request_id`, `operation`, …)
- **Severity:** debug/info/warn/error/critical via `LOG_LEVEL`
- **Redaction:** `redactOps.js` + audit `redact.js` — tokens, passwords, Authorization, emails masked
- **Removed:** console OTP / reset-token plaintext (dev codes only in admin email-log ring)

### Correlation
- Middleware assigns/validates `X-Request-Id`
- RPC responses echo `request_id`
- Audit correlation IDs unchanged for economy/admin evidence
- Godot `ApiClient` sends `X-Request-Id` and records safe failures via DiagnosticLogger

### Metrics
- In-memory registry (`metrics.js`) — counters/gauges/histograms
- **Cardinality protection:** rejects `account_id`, `character_id`, `transaction_id`, UUIDs as labels
- HTTP + RPC + WS counters; exposed on admin `GetOpsDashboard.ops_metrics` / `GetOpsTelemetry`
- Exporter outage = N/A (in-process); record failures never throw into gameplay

### Health
| Probe | Path |
|-------|------|
| Liveness | `GET /health/live` |
| Readiness | `GET /health/ready` (+ `/health` alias) |
| Build | `GET /health/build` |

Dependencies classified: DB/schema critical; metrics/analytics optional; Nakama external.

### Analytics
- Bounded registry `ANALYTICS_EVENTS`
- `RecordClientAnalytics` RPC — untrusted, consent-aware, **`authoritative: false`**
- Buffer drop under pressure; never blocks gameplay
- Does **not** drive Prompt 19 statistics

### Godot
- `DiagnosticLogger.gd` — severity, redaction, bounded `user://logs/client.log`, breadcrumbs
- No crash-reporting vendor integrated (gap documented)
- Production debug lines suppressed for `debug` severity on release feature

### Alerts / dashboards / runbooks
- **In-repo:** admin Ops dashboard + telemetry RPC (metrics snapshot)
- **Absent:** hosted alert routing, Grafana boards, on-call pages — ops gap, not invented
- Minimal runbook: `docs/runbooks/OBSERVABILITY.md`

### Tests
`npm run test:observability`

### Files
**Node:** `shared/observability/*`, `index.js`, `auth.js`, `apiResponse.js`, `adminOpsService.js`, `functions/index.js`, `test-observability.mjs`  
**Godot:** `DiagnosticLogger.gd`, `ApiClient.gd`, `project.godot`  
**Nakama:** unchanged (existing `modules/lib/logging.lua` retained)

---

## Distinctions (do not conflate)

```
Gameplay statistics (Prompt 19) → SQLite / Character — AUTHORITATIVE
Operational metrics → in-process counters — health only
Product analytics → RecordClientAnalytics — NON-AUTHORITATIVE
Audit logs (25/26) → evidence of privileged/economy actions
```

## Commands

```bash
npm run test:observability
curl -s localhost:8787/health/live
curl -s localhost:8787/health/ready
curl -s localhost:8787/health/build
```

## Deferred / gaps (not launch-blocking for gameplay)
- External metrics/trace/error backends
- Formal SLOs and paging alerts
- Legal retention/consent policy review
- Godot crash symbolication vendor
- Full per-domain metric instrumentation on every economy/combat path (hooks ready via `incCounter` / `RecordAnalyticsEvent`)
- Load / failure-injection lab results (not run in this pass)

## Regression
Gameplay formulas, auth bridge, ledgers, and admin permissions unchanged. Observability failures are isolated.
