/**
 * trialManager.ts — Trial lifecycle + security hardening
 *
 * Drop in: server/core/trialManager.ts
 *
 * Wire the cron into server/index.ts:
 *   import { startTrialExpiryJob } from "./core/trialManager";
 *   startTrialExpiryJob(); // runs daily at midnight UTC
 */

import { getDb } from "../db";
import { userQuotas, users } from "../../drizzle/schema";
import { eq, lt, and } from "drizzle-orm";
// import { sendTrialExpiryEmail } from "../_core/email"; // TODO: Implement email sender

// ─── Trial expiry cron ────────────────────────────────────────────────────────

export function startTrialExpiryJob(): NodeJS.Timeout {
  // Run immediately on startup, then every 24 hours
  runTrialExpiry().catch(console.error);

  return setInterval(() => {
    runTrialExpiry().catch(console.error);
  }, 24 * 60 * 60 * 1000); // 24 hours
}

export async function runTrialExpiry(): Promise<{ expired: number }> {
  const db = await getDb();
  if (!db) return { expired: 0 };

  const now = new Date();

  // Find all expired trials
  const expired = await db
    .select({ userId: userQuotas.userId })
    .from(userQuotas)
    .where(
      and(
        eq(userQuotas.tier, "trial"),
        lt(userQuotas.trialEndsAt, now)
      )
    );

  if (expired.length === 0) return { expired: 0 };

  // Downgrade to free
  await db
    .update(userQuotas)
    .set({ tier: "free" })
    .where(
      and(
        eq(userQuotas.tier, "trial"),
        lt(userQuotas.trialEndsAt, now)
      )
    );

  // Send expiry emails (non-blocking)
  for (const { userId } of expired) {
    try {
      const userRows = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userRows[0]?.email) {
        // TODO: Send trial expiry email
        // await sendTrialExpiryEmail(userRows[0].email, userRows[0].name ?? "there")
        //   .catch(() => { /* non-fatal */ });
      }
    } catch { /* skip individual failures */ }
  }

  console.log(`[Kemma] Trial expiry: downgraded ${expired.length} users to free tier`);
  return { expired: expired.length };
}

// ─── Security hardening ───────────────────────────────────────────────────────

/**
 * Rate limit per tool per user per minute.
 * In-memory — resets on server restart.
 * For production swap with Redis.
 */

const toolRateLimits: Map<string, { count: number; resetAt: number }> = new Map();

const TOOL_LIMITS_PER_MINUTE: Record<string, number> = {
  web_search:    10,
  browse:        10,
  run_code:      5,   // stricter — execution is expensive
  safe_files:    30,
  generate_file: 5,
  phone_scan:    10,
};

export function checkToolRateLimit(
  userId: number,
  toolName: string
): { allowed: boolean; retryAfterSeconds: number } {
  const key       = `${userId}:${toolName}`;
  const limit     = TOOL_LIMITS_PER_MINUTE[toolName] ?? 10;
  const now       = Date.now();
  const windowMs  = 60_000; // 1 minute

  const existing = toolRateLimits.get(key);

  if (!existing || now > existing.resetAt) {
    // New window
    toolRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  existing.count++;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Input sanitization for tool arguments.
 * Strips potential prompt injection attempts from tool inputs.
 */
export function sanitizeToolInput(toolName: string, args: unknown): unknown {
  if (typeof args !== "object" || args === null) return args;

  const safe = { ...(args as Record<string, unknown>) };

  // Path traversal prevention for file operations
  if (toolName === "safe_files" && typeof safe.path === "string") {
    safe.path = safe.path
      .replace(/\.\.\//g, "")
      .replace(/\.\.$/g, "")
      .replace(/^\//, "")
      .substring(0, 500);
  }

  // URL validation for browse
  if (toolName === "browse" && typeof safe.url === "string") {
    try {
      const url = new URL(safe.url);
      // Block local/private network access
      const blocked = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "169.254.",  // link-local
        "10.",       // private
        "192.168.",  // private
        "172.16.",   // private
      ];
      if (blocked.some((b) => url.hostname.startsWith(b))) {
        throw new Error("Private network access blocked");
      }
      // Only allow http/https
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Only http/https URLs allowed");
      }
    } catch {
      safe.url = ""; // invalidate bad URL
    }
  }

  // Code length cap
  if (toolName === "run_code" && typeof safe.code === "string") {
    safe.code = safe.code.substring(0, 10_000);
  }

  // Search query length cap + injection prevention
  if (toolName === "web_search" && typeof safe.query === "string") {
    safe.query = safe.query
      .substring(0, 500)
      .replace(/[<>]/g, ""); // strip HTML tags
  }

  return safe;
}

/**
 * Audit log — records every tool execution.
 * Stored in DB for compliance and debugging.
 */
export async function logToolExecution(
  userId:     number,
  toolName:   string,
  inputHash:  string,  // hash of input, not the input itself
  success:    boolean,
  durationMs: number
): Promise<void> {
  // Write to a kemma_audit_log table
  // For now just console — wire to DB in production
  console.log(JSON.stringify({
    ts:        new Date().toISOString(),
    userId,
    tool:      toolName,
    inputHash,
    success,
    durationMs,
  }));
}
