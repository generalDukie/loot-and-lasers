export const ApiErrorCodes = Object.freeze({
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  AUTH_SESSION_INVALID: "AUTH_SESSION_INVALID",
  AUTH_NODE_JWT_EXPIRED: "AUTH_NODE_JWT_EXPIRED",
  ACCOUNT_MAPPING_NOT_FOUND: "ACCOUNT_MAPPING_NOT_FOUND",
  CHARACTER_NOT_OWNED: "CHARACTER_NOT_OWNED",
  INSUFFICIENT_STARDUST: "INSUFFICIENT_STARDUST",
  TRANSACTION_CONFLICT: "TRANSACTION_CONFLICT",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
  SCHEMA_VERSION_MISMATCH: "SCHEMA_VERSION_MISMATCH",
  MAINTENANCE_MODE: "MAINTENANCE_MODE",
});

export function defaultErrorCode(status) {
  if (status === 401) return ApiErrorCodes.UNAUTHORIZED;
  if (status === 403) return ApiErrorCodes.FORBIDDEN;
  if (status === 404) return ApiErrorCodes.NOT_FOUND;
  if (status === 409) return ApiErrorCodes.CONFLICT;
  if (status === 400 || status === 422) return ApiErrorCodes.VALIDATION_ERROR;
  return ApiErrorCodes.INTERNAL_ERROR;
}

export function apiErrorBody(err, { fallbackMessage = "Request failed" } = {}) {
  const status = Number(err?.status) || 500;
  const exposeMessage = status < 500;
  const body = {
    success: false,
    error: exposeMessage
      ? String(err?.message || fallbackMessage)
      : fallbackMessage,
    code: String(err?.code || defaultErrorCode(status)),
  };
  if (err?.details !== undefined) body.details = err.details;
  return body;
}

export function sendApiError(res, err, options = {}) {
  const status = Number(err?.status) || 500;
  return res.status(status).json(apiErrorBody(err, options));
}

/**
 * Add a success discriminator without moving existing resources or changing
 * arrays/scalars consumed by legacy clients.
 */
export function normalizeFunctionBody(body, status = 200) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  if (body.error && !body.code) {
    return {
      success: false,
      ...body,
      code: defaultErrorCode(status),
    };
  }
  if (Object.prototype.hasOwnProperty.call(body, "success")) return body;
  return {
    success: status < 400 && !body.error,
    ...body,
  };
}

