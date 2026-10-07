/**
 * Database test for P1-11 Approvals against real Postgres:
 * "two concurrent approves execute once (db test)"
 *
 * Needs TEST_DATABASE_URL pointing at a scratch database with migrations applied.
 * Skips cleanly when unset.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvals, users } from "../../drizzle/schema";

describe.skipIf(!process.env.TEST_DATABASE_URL)("approvals (Postgres db test)", () => {
  let savedDatabaseUrl: string | undefined;
  let db: NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;
  let testUserId: number;
  const createdApprovalIds: string[] = [];

  beforeAll(async () => {
    savedDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

    const got = await (await import("../db")).getDb();
    if (!got) throw new Error("TEST_DATABASE_URL is set but no database connection was made");
    db = got;

    // Ensure a test user exists
    const [user] = await db
      .insert(users)
      .values({
        openId: `test-approval-${randomUUID().slice(0, 8)}`,
        name: "Test Approval User",
        email: `test-${randomUUID().slice(0, 8)}@example.com`,
      })
      .returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    if (db) {
      for (const id of createdApprovalIds) {
        await db.delete(approvals).where(eq(approvals.id, id));
      }
      if (testUserId) {
        await db.delete(users).where(eq(users.id, testUserId));
      }
      await (db as unknown as { $client: { end(): Promise<void> } }).$client?.end?.();
    }
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
  });

  it("two concurrent approves execute once (db test)", async () => {
    const { transitionApprovalStatus, hashArgs } = await import("./approvals");

    const id = randomUUID();
    createdApprovalIds.push(id);
    const args = { action: "send_money", amount: 100 };
    const expiresAt = new Date(Date.now() + 600 * 1000);

    // Insert pending approval row
    await db.insert(approvals).values({
      id,
      userId: testUserId,
      sessionId: "session-db-test",
      runId: "run-db-test",
      tool: "send_money",
      risk: "write",
      args,
      argsHash: hashArgs(args),
      status: "approved", // already approved, ready to execute
      expiresAt,
      createdAt: new Date(),
    });

    // Run two concurrent execution transitions: approved -> executing
    const [res1, res2] = await Promise.all([
      transitionApprovalStatus(id, "approved", "executing"),
      transitionApprovalStatus(id, "approved", "executing"),
    ]);

    // Exactly one winner transitions to executing; the second receives null
    const winners = [res1, res2].filter((r) => r !== null);
    const losers = [res1, res2].filter((r) => r === null);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(winners[0]?.status).toBe("executing");

    // Check DB state confirms status is executing
    const [finalRow] = await db.select().from(approvals).where(eq(approvals.id, id));
    expect(finalRow.status).toBe("executing");
  });
});
