/**
 * Batch 2 audit test, item 4: with the server behind exactly one reverse proxy
 * (Caddy), Express must derive req.ip from the trusted hop, and the auth limiter
 * must key on req.ip instead of the first, client-controlled x-forwarded-for entry.
 * Before the fix, prefixing/rotating XFF entries minted a fresh limiter bucket per
 * attempt and the 10-per-15-minutes lockout never fired.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

const store = vi.hoisted(() => ({
  users: [] as any[],
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./db");
  return {
    ...actual,
    getDb: vi.fn(async () => null),
    getUserByEmail: vi.fn(async (email: string) => store.users.find((u) => u.email === email)),
    getUserByHandle: vi.fn(async () => undefined),
    upsertUser: vi.fn(async () => {}),
  };
});
vi.mock("./_core/email", async () => {
  const { vi: vitest } = await import("vitest");
  return {
    sendPasswordResetEmail: vitest.fn(async () => {}),
    sendEmailVerification: vitest.fn(async () => {}),
  };
});
vi.mock("./routers/kemma", async () => {
  const { router } = await import("./_core/trpc");
  return { kemmaRouter: router({}) };
});
vi.mock("./llmProvider", () => ({
  generateStyleOptions: vi.fn(async () => []),
  generateDocumentContent: vi.fn(async () => ""),
}));
vi.mock("./fileGenerator", () => ({
  generateFile: vi.fn(async () => ({ buffer: Buffer.from(""), mimeType: "", extension: "" })),
  STYLE_DEFINITIONS: [],
}));
vi.mock("./services/vectorSearch", () => ({
  embed: vi.fn(async () => []),
  upsertVector: vi.fn(async () => {}),
  removeVector: vi.fn(async () => {}),
  searchSimilar: vi.fn(async () => []),
  isVectorSearchConfigured: vi.fn(() => false),
}));

async function buildCaller(ctx: any) {
  const { appRouter } = await import("./routers");
  return appRouter.createCaller(ctx as never);
}

// One true client behind Caddy: req.ip is the address Caddy connected from. The
// client spoofs x-forwarded-for; Caddy appends, so the real address is the LAST
// entry, which Express with trust proxy=1 exposes as req.ip.
function proxiedCtx(realIp: string, spoofPrefix: string) {
  return {
    user: null as any,
    req: {
      protocol: "https",
      headers: {
        "x-forwarded-for": `${spoofPrefix}, ${realIp}`,
        "x-forwarded-proto": "https",
      },
      // set("trust proxy", 1) is what makes req.ip resolve to the real client:
      // emulate it here the way Express would (last untrusted hop).
      get ip() {
        const parts = (this.headers["x-forwarded-for"] || "").split(",").map((s: string) => s.trim());
        return parts[parts.length - 1] || "127.0.0.1";
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
  };
}

beforeEach(async () => {
  vi.resetModules();
  const hash = await bcrypt.hash("right-pw", 4);
  store.users = [
    { id: 3, openId: "open-bob", name: "Bob", email: "bob@example.com", passwordHash: hash, loginMethod: "local", role: "user", onboarded: true, emailVerified: true, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  ];
  process.env.SESSION_SECRET = "audit-test-session-secret";
  process.env.ALLOWED_LOGIN = "bob@example.com";
});

describe("auth limiter keys on the true client ip", () => {
  it("a rotating spoofed XFF prefix can no longer mint fresh buckets", { timeout: 30000 }, async () => {
    const ctx = proxiedCtx("203.0.113.77", "1.1.1.1");
    const caller = await buildCaller(ctx);
    let blocked: string | null = null;
    for (let i = 0; i < 15; i++) {
      ctx.req.headers["x-forwarded-for"] = `198.51.${i}.1, 203.0.113.77`;
      const err = await caller.auth
        .login({ email: "bob@example.com", password: "wrong" })
        .then(() => null)
        .catch((e: any) => e);
      if (err?.code === "TOO_MANY_REQUESTS") {
        blocked = String(i);
        break;
      }
    }
    expect(blocked, "15 bad logins from one client were never rate limited").not.toBeNull();
  });

  it("the tripwire in _core/index.ts: trust proxy is set to exactly one hop", { timeout: 30000 }, async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/app\.set\(\s*["']trust proxy["']\s*,\s*1\s*\)/);
  });

  it("the tripwire in _core/index.ts: error monitoring is registered", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/registerGlobalErrorHandlers\(\)/);
    expect(src).toMatch(/app\.use\(\s*errorMonitoringMiddleware\s*\)/);
  });
});
