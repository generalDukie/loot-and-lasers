/**
 * Admin audit-log HTTP routes.
 */

import { requireAuth } from "../auth.js";
import { isAdmin } from "../entityAccess.js";
import { AuditError, AuditErrors } from "./errors.js";
import {
  annotateAudit,
  exportAuditLogs,
  getAuditDetail,
  recordAuditEntry,
  searchAuditLogs,
  verifyAuditIntegrity,
} from "./writer.js";
import { AuditPermissions, adminHasAuditPermission, ActorTypes } from "./registry.js";
import { assertImmutable } from "./store.js";

function handleErr(res, err) {
  if (err instanceof AuditError) {
    return res.status(err.status || 400).json({
      error: err.message,
      code: err.code,
      details: err.details || undefined,
    });
  }
  if (err?.code === "AUDIT_IMMUTABLE") {
    return res.status(405).json({ error: err.message, code: err.code });
  }
  console.error("[audit]", err);
  return res.status(500).json({ error: "Internal error", code: AuditErrors.WRITE_FAILED });
}

function requireAdmin(req, res, permission = AuditPermissions.VIEW) {
  if (!req.user || !isAdmin(req.user) || !adminHasAuditPermission(req.user, permission)) {
    res.status(403).json({ error: "Admin only", code: AuditErrors.FORBIDDEN });
    return false;
  }
  return true;
}

export function createAuditRouter(express) {
  const router = express.Router();

  router.get("/admin/search", requireAuth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const q = req.query || {};
      const result = searchAuditLogs({
        auditId: q.auditId,
        category: q.category,
        action: q.action,
        result: q.result,
        severity: q.severity,
        actorType: q.actorType,
        actorId: q.actorId,
        targetType: q.targetType,
        targetId: q.targetId,
        accountId: q.accountId,
        characterId: q.characterId,
        subjectType: q.subjectType,
        subjectId: q.subjectId,
        correlationId: q.correlationId,
        eventId: q.eventId,
        commandId: q.commandId,
        requestId: q.requestId,
        sourceService: q.sourceService,
        environment: q.environment,
        from: q.from,
        to: q.to,
        highRisk: q.highRisk === "1" || q.highRisk === "true",
        failedOnly: q.failedOnly === "1" || q.failedOnly === "true",
        limit: q.limit,
        offset: q.offset,
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get("/admin/timeline/:accountId", requireAuth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = searchAuditLogs({
        accountId: req.params.accountId,
        category: req.query.category,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit || 50,
        offset: req.query.offset || 0,
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get("/admin/correlation/:correlationId", requireAuth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = searchAuditLogs({
        correlationId: req.params.correlationId,
        limit: req.query.limit || 100,
        offset: 0,
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get("/admin/item/:itemId/provenance", requireAuth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = searchAuditLogs({
        subjectType: "item",
        subjectId: req.params.itemId,
        limit: req.query.limit || 100,
        offset: req.query.offset || 0,
      });
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post("/admin/export", requireAuth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = exportAuditLogs(req.user, req.body || {});
      res.json(result);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get("/admin/:id/integrity", requireAuth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const detail = getAuditDetail(req.params.id);
      if (!detail) {
        return res.status(404).json({ error: "Not found", code: AuditErrors.NOT_FOUND });
      }
      res.json(verifyAuditIntegrity(detail.entry));
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.post("/admin/:id/annotations", requireAuth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const note = req.body?.note;
      if (!note || !String(note).trim()) {
        return res.status(400).json({ error: "note required", code: AuditErrors.INVALID_PAYLOAD });
      }
      const annotation = annotateAudit(req.user, req.params.id, note, {
        resolutionStatus: req.body.resolutionStatus,
        supportCaseId: req.body.supportCaseId,
        incidentId: req.body.incidentId,
      });
      res.status(201).json({ annotation });
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.get("/admin/:id", requireAuth, (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const detail = getAuditDetail(req.params.id);
      if (!detail) {
        return res.status(404).json({ error: "Not found", code: AuditErrors.NOT_FOUND });
      }
      const bucket = Math.floor(Date.now() / 60_000);
      try {
        recordAuditEntry({
          action: "admin_audit_viewed",
          actorType: ActorTypes.ADMINISTRATOR,
          actorId: req.user.id,
          actorAccountId: req.user.id,
          targetType: "audit",
          targetId: req.params.id,
          reasonText: "view",
          idempotencyKey: `view:${req.user.id}:${req.params.id}:${bucket}`,
        });
      } catch {
        /* ignore */
      }
      res.json(detail);
    } catch (err) {
      handleErr(res, err);
    }
  });

  router.patch("/admin/:id", requireAuth, (_req, res) => {
    try {
      assertImmutable();
    } catch (err) {
      handleErr(res, err);
    }
  });
  router.delete("/admin/:id", requireAuth, (_req, res) => {
    try {
      assertImmutable();
    } catch (err) {
      handleErr(res, err);
    }
  });
  router.put("/admin/:id", requireAuth, (_req, res) => {
    try {
      assertImmutable();
    } catch (err) {
      handleErr(res, err);
    }
  });

  return router;
}
