/**
 * Request correlation + HTTP observability middleware (Restoration 27).
 */
import { nanoid } from "nanoid";
import { CreateStructuredLogger } from "./logger.js";
import { incCounter, observeDuration } from "./metrics.js";

const log = CreateStructuredLogger("http");

export function GenerateCorrelationID() {
  return nanoid(16);
}

/**
 * Attach request_id, start time; log completion; record bounded metrics.
 * Never logs Authorization or bodies.
 */
export function requestContextMiddleware(req, res, next) {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  const requestId =
    incoming && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming) ? incoming : GenerateCorrelationID();
  req.requestId = requestId;
  req.observability = { requestId, startedAt: Date.now() };
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    try {
      const durationMs = Date.now() - req.observability.startedAt;
      const route = routeTemplate(req);
      const status = res.statusCode || 0;
      const statusClass = `${Math.floor(status / 100)}xx`;
      const method = String(req.method || "GET").toUpperCase();

      incCounter("http_requests_total", { method, status_class: statusClass, route });
      observeDuration("http_request_duration_ms", durationMs, { method, route, status_class: statusClass });

      if (status >= 500) {
        incCounter("http_unexpected_errors_total", { method, route });
        log.error("request_failed", {
          request_id: requestId,
          method,
          route,
          status,
          duration_ms: durationMs,
        });
      } else if (status >= 400) {
        incCounter("http_domain_errors_total", { method, route, status_class: statusClass });
        log.info("request_completed", {
          request_id: requestId,
          method,
          route,
          status,
          duration_ms: durationMs,
        });
      } else {
        log.debug("request_completed", {
          request_id: requestId,
          method,
          route,
          status,
          duration_ms: durationMs,
        });
      }
    } catch {
      /* telemetry isolation */
    }
  });

  next();
}

function routeTemplate(req) {
  // Prefer Express route path when available; else bounded path shape
  const base = req.route?.path
    ? `${req.baseUrl || ""}${req.route.path}`
    : String(req.path || "/").replace(/\/[0-9a-f-]{8,}[^/]*/gi, "/:id");
  return String(base).slice(0, 96) || "unknown";
}

export function CreateRequestContext(partial = {}) {
  return {
    request_id: partial.request_id || GenerateCorrelationID(),
    trace_id: partial.trace_id || null,
    operation: partial.operation || null,
    started_at: Date.now(),
  };
}
