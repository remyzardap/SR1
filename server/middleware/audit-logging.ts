import { getDb } from "../db";
import { auditLogs, type AuditAction } from "../../drizzle/schema";
import { lte } from "drizzle-orm";

export interface AuditEventPayload {
  userId: string;
  action: AuditAction | string;
  resourceType: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  severity?: "info" | "warn" | "error" | "critical";
  status?: "success" | "failure";
  errorMessage?: string;
  sessionId?: string;
}

/**
 * Write a single audit event to the audit_logs table.
 * Non-blocking — errors are swallowed so they never break the main request.
 */
export async function logAuditEvent(payload: AuditEventPayload): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: payload.userId,
      action: payload.action,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId ?? null,
      changes: payload.changes ?? null,
      metadata: payload.metadata ?? null,
      severity: payload.severity ?? "info",
      status: payload.status ?? "success",
      errorMessage: payload.errorMessage ?? null,
      sessionId: payload.sessionId ?? null,
      createdAt: Date.now(),
    });
  } catch {
    // Audit logging must never crash the application
  }
}

/**
 * Delete audit logs older than `daysToKeep` days.
 * Intended to be called by a scheduled job or admin endpoint.
 */
export async function cleanupOldAuditLogs(daysToKeep = 90): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    await db
      .delete(auditLogs)
      .where(lte(auditLogs.createdAt, cutoff));
    return 1; // success indicator
  } catch {
    return 0;
  }
}
