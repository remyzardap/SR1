import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// jobs.ts: pg-boss must never crash app boot. Guarded paths: missing DATABASE_URL,
// JOBS_ENABLED=false, and a start() that rejects (unreachable db). The module keeps
// a module-level singleton, so each test re-imports it fresh.

const bossState = vi.hoisted(() => ({ ctorCalls: [] as any[], startImpl: async () => {}, instances: [] as any[] }));

vi.mock("pg-boss", () => ({
  default: class FakePgBoss {
    opts: any;
    constructor(opts: any) {
      bossState.ctorCalls.push(opts);
      bossState.instances.push(this);
    }
    on() {}
    async start() {
      return bossState.startImpl();
    }
    async createQueue(_name: string) {
      bossState.createdQueues?.push?.(_name);
    }
    async work(name: string, opts: any, cb: any) {
      (bossState.workers ??= {})[name] = cb;
    }
    async send(name: string, data: any, opts: any) {
      bossState.sends.push({ name, data, opts });
      return "job-id-1";
    }
    async stop() {
      bossState.stopped = true;
    }
  },
}));
vi.mock("../db", () => ({ getDb: vi.fn(async () => null) }));

const savedEnv: Record<string, string | undefined> = {};
for (const k of ["DATABASE_URL", "JOBS_ENABLED"]) {
  savedEnv[k] = process.env[k];
  delete process.env[k];
}

async function freshJobs() {
  vi.resetModules();
  bossState.ctorCalls = [];
  bossState.instances = [];
  bossState.createdQueues = [];
  bossState.workers = {};
  bossState.sends = [];
  bossState.stopped = false;
  bossState.startImpl = async () => {};
  return await import("./jobs");
}

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.JOBS_ENABLED;
});

describe("startJobRunner guards (boot must not crash)", () => {
  it("DATABASE_URL missing => resolves null and never constructs pg-boss", async () => {
    const jobs = await freshJobs();
    await expect(jobs.startJobRunner()).resolves.toBeNull();
    expect(bossState.ctorCalls).toHaveLength(0);
  });

  it("JOBS_ENABLED=false => resolves null even with a DATABASE_URL set", async () => {
    process.env.DATABASE_URL = "postgres://fake:fake@localhost/fake";
    process.env.JOBS_ENABLED = "false";
    const jobs = await freshJobs();
    await expect(jobs.startJobRunner()).resolves.toBeNull();
    expect(bossState.ctorCalls).toHaveLength(0);
  });

  it("a pg-boss start() rejection is swallowed: boot continues with null", async () => {
    process.env.DATABASE_URL = "postgres://fake:fake@localhost/fake";
    const jobs = await freshJobs();
    bossState.startImpl = async () => {
      throw new Error("connection refused");
    };
    await expect(jobs.startJobRunner()).resolves.toBeNull();
    expect(bossState.ctorCalls).toHaveLength(1);
  });

  it("start succeeds => queues are created and the audit-test handler is wired", async () => {
    process.env.DATABASE_URL = "postgres://fake:fake@localhost/fake";
    const jobs = await freshJobs();
    const boss = await jobs.startJobRunner();
    expect(boss).not.toBeNull();
    expect(bossState.createdQueues).toContain("audit-test");
    expect(Object.keys(bossState.workers)).toContain("audit-test");
  });

  it("enqueueJob without a runner returns null instead of throwing", async () => {
    const jobs = await freshJobs(); // no DATABASE_URL
    await expect(jobs.enqueueJob("audit-test", { marker: "x" })).resolves.toBeNull();
    expect(bossState.sends).toHaveLength(0);
  });

  it("enqueueJob passes startAfterSeconds through when the runner is up", async () => {
    process.env.DATABASE_URL = "postgres://fake:fake@localhost/fake";
    const jobs = await freshJobs();
    const id = await jobs.enqueueJob("audit-test", { marker: "m" }, { startAfterSeconds: 60 });
    expect(id).toBe("job-id-1");
    expect(bossState.sends[0]).toMatchObject({ name: "audit-test", data: { marker: "m" }, opts: { startAfter: 60 } });
  });
});

describe("audit-test job handler", () => {
  it("handler throws a clean error when the db is unavailable (job failure, not crash)", async () => {
    process.env.DATABASE_URL = "postgres://fake:fake@localhost/fake";
    const jobs = await freshJobs();
    await jobs.startJobRunner();
    const handler = bossState.workers["audit-test"];
    await expect(handler([{ data: { marker: "m" } }])).rejects.toThrow(/Database unavailable/);
  });
});

describe("stopJobRunner resets the singleton", () => {
  it("after stop, a fresh start can construct pg-boss again", async () => {
    process.env.DATABASE_URL = "postgres://fake:fake@localhost/fake";
    const jobs = await freshJobs();
    await jobs.startJobRunner();
    await jobs.stopJobRunner();
    expect(bossState.stopped).toBe(true);
    await jobs.startJobRunner();
    expect(bossState.ctorCalls.length).toBeGreaterThanOrEqual(2);
  });
});
