const MILLISECONDS_PER_SECOND = 1_000;
const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 120;
const DEFAULT_MAX_BUCKETS = 10_000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clientKey(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const address = String(req.ip || forwarded || req.socket?.remoteAddress || "unknown");
  const userId = String(req.user?.id || req.user?.nakama_user_id || "anonymous");
  return `${address}:${userId}`;
}

/** Single-instance fixed-window limiter for the current one-container API deployment. */
export function createRateLimiter({
  name = "api",
  windowMs = DEFAULT_WINDOW_SECONDS * MILLISECONDS_PER_SECOND,
  max = DEFAULT_MAX_REQUESTS,
  maxBuckets = DEFAULT_MAX_BUCKETS,
  key = clientKey,
  now = Date.now,
} = {}) {
  const safeWindowMs = positiveInteger(windowMs, DEFAULT_WINDOW_SECONDS * MILLISECONDS_PER_SECOND);
  const safeMax = positiveInteger(max, DEFAULT_MAX_REQUESTS);
  const safeMaxBuckets = positiveInteger(maxBuckets, DEFAULT_MAX_BUCKETS);
  const buckets = new Map();
  let nextPruneAt = 0;

  function prune(nowMs) {
    if (nowMs < nextPruneAt && buckets.size <= safeMaxBuckets) return;
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= nowMs) buckets.delete(bucketKey);
    }
    while (buckets.size > safeMaxBuckets) {
      buckets.delete(buckets.keys().next().value);
    }
    nextPruneAt = nowMs + safeWindowMs;
  }

  function middleware(req, res, next) {
    const nowMs = now();
    prune(nowMs);
    const bucketKey = `${name}:${key(req)}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= nowMs) {
      bucket = { count: 0, resetAt: nowMs + safeWindowMs };
      buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, safeMax - bucket.count);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - nowMs) / MILLISECONDS_PER_SECOND),
    );
    res.setHeader("RateLimit-Limit", String(safeMax));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(retryAfterSeconds));
    if (bucket.count > safeMax) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "Too many requests. Try again shortly.",
        code: "RATE_LIMITED",
        retry_after_seconds: retryAfterSeconds,
      });
    }
    return next();
  }

  middleware.clear = () => buckets.clear();
  return middleware;
}

export function rateLimitFromEnv(name, defaults) {
  const prefix = String(name).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return createRateLimiter({
    name,
    windowMs: positiveInteger(
      process.env[`${prefix}_RATE_WINDOW_SEC`],
      defaults.windowSeconds,
    ) * MILLISECONDS_PER_SECOND,
    max: positiveInteger(process.env[`${prefix}_RATE_MAX`], defaults.max),
  });
}
