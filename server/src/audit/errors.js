export class AuditError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const AuditErrors = Object.freeze({
  UNKNOWN_ACTION: "AUDIT_UNKNOWN_ACTION",
  INVALID_PAYLOAD: "AUDIT_INVALID_PAYLOAD",
  FORBIDDEN_FIELD: "AUDIT_FORBIDDEN_FIELD",
  FORBIDDEN: "AUDIT_FORBIDDEN",
  NOT_FOUND: "AUDIT_NOT_FOUND",
  IDEMPOTENCY_CONFLICT: "AUDIT_IDEMPOTENCY_CONFLICT",
  WRITE_FAILED: "AUDIT_WRITE_FAILED",
  REASON_REQUIRED: "AUDIT_REASON_REQUIRED",
  IMMUTABLE: "AUDIT_IMMUTABLE",
});
