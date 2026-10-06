import { Router } from "express";
import {
  getApprovalById,
  hashArgs,
  resolveWaiter,
  transitionApprovalStatus,
} from "../kemma/approvals";
import { getToolSpec } from "../kemma/toolkit/registry";
import { logAuditEvent } from "../middleware/audit-logging";

export const approvalsRouter = Router();

/**
 * POST /api/kemma/approvals/:id
 * Body: { decision: "approve" | "reject", args?: Record<string, unknown> }
 *
 * Approves or rejects a pending human-in-the-loop tool execution (P1-11).
 */
approvalsRouter.post("/:id", async (req, res) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.params;
  const { decision, args } = req.body ?? {};

  if (decision !== "approve" && decision !== "reject") {
    return res.status(400).json({ error: "Invalid decision: must be 'approve' or 'reject'" });
  }

  const row = await getApprovalById(id);
  if (!row) {
    return res.status(404).json({ error: "Approval not found" });
  }

  if (row.userId !== user.id) {
    return res.status(403).json({ error: "Forbidden: approval belongs to another user" });
  }

  if (row.status !== "pending") {
    return res.status(409).json({ error: `Approval is already ${row.status}`, status: row.status });
  }

  if (new Date() > row.expiresAt) {
    await transitionApprovalStatus(id, "pending", "expired");
    return res.status(409).json({ error: "Approval has expired", status: "expired" });
  }

  if (decision === "approve") {
    let finalArgs = row.args;
    let finalArgsHash = row.argsHash;
    let finalPreview = row.preview;

    if (args !== undefined && args !== null) {
      const spec = getToolSpec(row.tool);
      if (spec) {
        const parsed = spec.args.safeParse(args);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid edited arguments",
            issues: parsed.error.issues,
          });
        }
        finalArgs = parsed.data;
      } else {
        finalArgs = args;
      }

      // The card the human read names a target resource. Editing the arguments so they point
      // somewhere else would approve a different action than the one displayed, so the target is not
      // allowed to move (P1-11). Fail closed: a target that cannot be re-read cannot be written to.
      if (spec?.targetRef) {
        let moved: string | undefined;
        try {
          moved = (await spec.targetRef(finalArgs, { userId: user.id } as any)) ?? undefined;
        } catch {
          return res.status(400).json({ error: "Could not re-read the target of the edited action" });
        }
        if (moved !== (row.targetRef ?? undefined)) {
          return res.status(400).json({ error: "Cannot change the target of an approved action" });
        }
      }

      finalArgsHash = hashArgs(finalArgs);
      if (spec?.preview) {
        try {
          finalPreview = (await spec.preview(finalArgs, { userId: user.id } as any)) as any;
        } catch {
          // Keep existing preview if preview generation throws
        }
      }
    }

    const updated = await transitionApprovalStatus(id, "pending", "approved", {
      decidedArgs: finalArgs as any,
      decidedAt: new Date(),
      argsHash: finalArgsHash,
      preview: finalPreview as any,
    });

    if (!updated) {
      return res.status(409).json({ error: "Conflict: approval status changed concurrently" });
    }

    await logAuditEvent({
      userId: String(user.id),
      action: "approval.approve",
      resourceType: "tool",
      resourceId: row.tool,
      metadata: { approvalId: id, argsHash: finalArgsHash },
      sessionId: row.sessionId ?? undefined,
      severity: "info",
      status: "success",
    });

    resolveWaiter(id, { decision: "approved", args: finalArgs });

    return res.status(200).json({ ok: true, status: "approved" });
  } else {
    // decision === "reject"
    const updated = await transitionApprovalStatus(id, "pending", "rejected", {
      decidedAt: new Date(),
    });

    if (!updated) {
      return res.status(409).json({ error: "Conflict: approval status changed concurrently" });
    }

    await logAuditEvent({
      userId: String(user.id),
      action: "approval.reject",
      resourceType: "tool",
      resourceId: row.tool,
      metadata: { approvalId: id },
      sessionId: row.sessionId ?? undefined,
      severity: "info",
      status: "success",
    });

    resolveWaiter(id, { decision: "rejected", args: row.args });

    return res.status(200).json({ ok: true, status: "rejected" });
  }
});

/**
 * GET /api/kemma/approvals/:id
 * Fetches the status and preview of an approval row.
 */
approvalsRouter.get("/:id", async (req, res) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.params;
  const row = await getApprovalById(id);
  if (!row) {
    return res.status(404).json({ error: "Approval not found" });
  }

  if (row.userId !== user.id) {
    return res.status(403).json({ error: "Forbidden: approval belongs to another user" });
  }

  return res.json({
    id: row.id,
    tool: row.tool,
    risk: row.risk,
    args: row.args,
    preview: row.preview,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  });
});
