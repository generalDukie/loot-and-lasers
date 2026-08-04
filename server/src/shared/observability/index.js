/**
 * Observability barrel (Restoration 27).
 */
export {
  logger,
  CreateStructuredLogger,
  setLogLevel,
  getBuildInfo,
  log,
} from "./logger.js";
export {
  redactForLog,
  RedactSensitiveData,
  redactHeaders,
  maskEmail,
  hashIp,
} from "./redactOps.js";
export {
  RecordMetric,
  incCounter,
  setGauge,
  observeDuration,
  getMetricsSnapshot,
  resetMetricsForTests,
  getDroppedMetricCount,
} from "./metrics.js";
export {
  requestContextMiddleware,
  GenerateCorrelationID,
  CreateRequestContext,
} from "./requestContext.js";
export {
  GetLiveness,
  GetReadiness,
  GetBuildInfoPublic,
  GetDependencyHealth,
} from "./health.js";
export {
  RecordAnalyticsEvent,
  getAnalyticsBuffer,
  ANALYTICS_EVENTS,
  resetAnalyticsForTests,
} from "./analytics.js";
