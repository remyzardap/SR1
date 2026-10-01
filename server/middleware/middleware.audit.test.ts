/**
 * AREA 4 (part 1) audit tests for server/middleware and _core rate limiting,
 * security headers, audit-log persistence, and the Express wiring gaps in
 * server/_core/index.ts (read-only tripwires; index.ts is owned by the
 * wiring agent). No network, no DB.
 */
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("../db", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../db");
  return { ...actual, getDb: vi.fn(async () => null) };
});

import { rateLimitMiddleware } from "./rate-limiting";
import { cspMiddleware, errorMonitoringMiddleware, getRecentErrors } from "./security";
import { logAuditEvent, cleanupOldAuditLogs } from "./audit-logging";
import { generalApiRateLimiter } from "../_core/rateLimiter";

let anonCounter = 0;
function freshSocketIp() {
  anonCounter += 1;
  return `10.88.${Math.floor(anonCounter / 256) % 256}.${anonCounter % 256}`;
}

function makeRes() {
  const res: any = new EventEmitter();
  res.locals = {};
  res.statusCode = 200;
  res.headers = {} as Record<string, string>;
  res.writableEnded = false;
  res.setHeader = (k: string, v: string) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.status = (s: number) => {
    res.statusCode = s;
    return res;
  };
  res.json = (body: unknown) => {
    res.sent = body;
    res.writableEnded = true;
    return res;
  };
  res.send = (body: unknown) => {
    res.sent = body;
    res.writableEnded = true;
    return res;
  };
  return res;
}

function makeReq(opts: { ip?: string; user?: any; headers?: Record<string, string>; path?: string }) {
  return {
    ip: opts.ip,
    path: opts.path ?? "/api/anything",
    method: "GET",
    headers: opts.headers ?? {},
    socket: { remoteAddress: opts.ip ?? "127.0.0.1" },
    app: { get: (_k: string) => false },
    user: opts.user,
  } as unknown as Request;
}

describe("rateLimitMiddleware (server/middleware/rate-limiting.ts)", () => {
  it("keys the bucket on the authenticated user id, so two users are independent", () => {
    const ip = freshSocketIp();
    const userA = { id: 91001 };
    const userB = { id: 91002 };
    // authenticated window is 200/min: consume exactly 200 for user A
    for (let i = 0; i < 200; i++) {
      const res = makeRes();
      let nextCalled = false;
      rateLimitMiddleware(makeReq({ ip, user: userA }), res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }
    const limitedRes = makeRes();
    rateLimitMiddleware(makeReq({ ip, user: userA }), limitedRes, () => {});
    expect(limitedRes.statusCode).toBe(429);

    // user B on the same shared NAT ip is untouched
    const bRes = makeRes();
    let bNext = false;
    rateLimitMiddleware(makeReq({ ip, user: userB }), bRes, () => { bNext = true; });
    expect(bNext).toBe(true);
    expect(bRes.statusCode).toBe(200);
  });

  it("anonymous users share one bucket per ip and get 429 with Retry-After + headers", () => {
    const ip = freshSocketIp();
    for (let i = 0; i < 50; i++) {
      const res = makeRes();
      let called = false;
      rateLimitMiddleware(makeReq({ ip }), res, () => { called = true; });
      expect(called).toBe(true);
    }
    const res = makeRes();
    rateLimitMiddleware(makeReq({ ip }), res, () => {});
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect((res.sent as any).error).toBe("Too Many Requests");
    expect(res.headers["x-ratelimit-limit"]).toBe("50");
  });

  it("CURRENT BEHAVIOR (finding MW-1): requests without an ip collapse into one shared 'unknown' bucket", () => {
    // If Express ever hands us an undefined req.ip (unix sockets, bad proxy),
    // EVERY anonymous visitor shares one 50/min bucket - a self-inflicted DoS.
    const first = makeReq({ ip: undefined });
    for (let i = 0; i < 50; i++) {
      rateLimitMiddleware(first, makeRes(), () => {});
    }
    const second = makeReq({ ip: undefined }); // a different, also-unknown client
    const res = makeRes();
    rateLimitMiddleware(second, res, () => {});
    expect(res.statusCode).toBe(429); // blocked by a stranger's traffic
  });
});

describe("generalApiRateLimiter (the ONLY limiter wired in _core/index.ts)", () => {
  function hit(req: any, res: any) {
    return new Promise<boolean>((resolve) => {
      let passed = false;
      generalApiRateLimiter(req as Request, res as Response, () => { passed = true; });
      // The limiter is async (store increment), give it a tick to decide.
      setTimeout(() => resolve(passed), 10);
    });
  }

  it("ignores X-Forwarded-For when keying (trust proxy unset): all users behind one proxy share the 200/min bucket", async () => {
    // Production runs behind Caddy (Caddyfile: reverse_proxy -> app). With
    // Express trust proxy left at its default false, req.ip is the PROXY ip
    // for every visitor, and express-rate-limit v8 keys on req.ip.
    const proxyIp = "10.88.200.5";
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const req = makeReq({ ip: proxyIp, headers: { "x-forwarded-for": `203.0.${i}.1` } });
      const res = makeRes();
      await hit(req, res);
      const header = res.headers["ratelimit"];
      if (header) seen.push(String(header));
    }
    // Remaining must DECREASE across different XFF values: one shared bucket.
    expect(seen).toHaveLength(3);
    expect(seen[1]).not.toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[1]);
    expect(String(seen[2])).toContain("remaining=197");
  });

  it("skips /api/health (never rate limited, no ratelimit headers)", async () => {
    const req = makeReq({ ip: freshSocketIp(), path: "/api/health" });
    const res = makeRes();
    const passed = await hit(req, res);
    expect(passed).toBe(true);
    expect(res.headers["ratelimit"]).toBeUndefined();
  });
});

describe("cspMiddleware (server/middleware/security.ts)", () => {
  const origEnv = process.env.NODE_ENV;
  it("development: sets CSP with eval allowed, nosniff, DENY framing, no HSTS", () => {
    delete process.env.NODE_ENV;
    const res = makeRes();
    let next = false;
    cspMiddleware(makeReq({}), res as Response, () => { next = true; });
    expect(next).toBe(true);
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["content-security-policy"]).toContain("object-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("'unsafe-eval'");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeUndefined();
    process.env.NODE_ENV = origEnv;
  });

  it("production: drops unsafe-eval, adds HSTS + upgrade-insecure-requests", () => {
    process.env.NODE_ENV = "production";
    const res = makeRes();
    cspMiddleware(makeReq({}), res as Response, () => {});
    const csp = res.headers["content-security-policy"];
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("upgrade-insecure-requests");
    // FINDING MW-2: script-src still allows unsafe-inline in production (XSS mitigation weakened).
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
    process.env.NODE_ENV = origEnv;
  });
});

describe("errorMonitoringMiddleware", () => {
  const origEnv = process.env.NODE_ENV;
  it("buffers the error, answers 500 with a generic message in production", () => {
    process.env.NODE_ENV = "production";
    const res = makeRes();
    const before = getRecentErrors().length;
    errorMonitoringMiddleware(
      Object.assign(new Error("db exploded"), { status: 500 }),
      makeReq({ path: "/api/fn/secret" }) as any,
      res as any,
      () => {}
    );
    expect(res.statusCode).toBe(500);
    expect(res.sent).toEqual({ error: "Internal server error" });
    const recent = getRecentErrors();
    expect(recent.length).toBe(before + 1);
    expect(recent[0].path).toBe("/api/fn/secret");
    expect(recent[0].level).toBe("error");
    // FINDING MW-3: userId is never populated (interface declares it, middleware ignores req.user)
    expect((recent[0] as any).userId).toBeUndefined();
    process.env.NODE_ENV = origEnv;
  });

  it("passes 4xx messages through outside production and logs at warn", () => {
    delete process.env.NODE_ENV;
    const res = makeRes();
    errorMonitoringMiddleware(
      Object.assign(new Error("bad input"), { status: 400 }),
      makeReq({}) as any,
      res as any,
      () => {}
    );
    expect(res.statusCode).toBe(400);
    expect(res.sent).toEqual({ error: "bad input" });
    process.env.NODE_ENV = origEnv;
  });

  it("does not write when headers are already sent", () => {
    const res = makeRes();
    res.headersSent = true;
    res.status = vi.fn(() => res);
    errorMonitoringMiddleware(new Error("late"), makeReq({}) as any, res as any, () => {});
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("logAuditEvent (server/middleware/audit-logging.ts)", () => {
  it("writes a mapped row; bigint createdAt; string userId", async () => {
    const { getDb } = await import("../db");
    let inserted: any = null;
    const fakeDb = { insert: () => ({ values: async (v: any) => { inserted = v; } }) };
    (getDb as any).mockResolvedValue(fakeDb as any);
    await logAuditEvent({ userId: "42", action: "user.login", resourceType: "session" });
    expect(inserted).toBeTruthy();
    expect(inserted.userId).toBe("42");
    expect(inserted.action).toBe("user.login");
    expect(inserted.severity).toBe("info");
    expect(inserted.status).toBe("success");
    expect(typeof inserted.createdAt).toBe("number");
  });

  it("swallows DB failures instead of breaking the caller", async () => {
    const { getDb } = await import("../db");
    (getDb as any).mockRejectedValueOnce(new Error("pool down"));
    await expect(
      logAuditEvent({ userId: "1", action: "file.delete", resourceType: "file" })
    ).resolves.toBeUndefined();
  });

  it("no-ops when there is no database", async () => {
    const { getDb } = await import("../db");
    (getDb as any).mockResolvedValue(null as any);
    await expect(
      logAuditEvent({ userId: "1", action: "x", resourceType: "y" })
    ).resolves.toBeUndefined();
    expect(await cleanupOldAuditLogs(90)).toBe(0);
  });

  it("cleanupOldAuditLogs deletes via lte cutoff and reports success", async () => {
    const { getDb } = await import("../db");
    let deleted = false;
    const fakeDb = {
      delete: () => ({ where: async () => { deleted = true; } }),
    };
    (getDb as any).mockResolvedValue(fakeDb as any);
    expect(await cleanupOldAuditLogs(7)).toBe(1);
    expect(deleted).toBe(true);
  });
});

describe("_core/index.ts wiring tripwires (report-only; file owned by the wiring agent)", () => {
  const src = readFileSync(fileURLToPath(new URL("../_core/index.ts", import.meta.url)), "utf8");

  it("PASS: the general limiter is mounted before every protected route", () => {
    const limiterAt = src.indexOf("app.use(generalApiRateLimiter)");
    const kemmaAt = src.indexOf("app.post('/api/kemma/stream'");
    const fnAt = src.indexOf("app.use('/api/fn'");
    const trpcAt = src.indexOf("app.use('/api/trpc'");
    expect(limiterAt).toBeGreaterThan(-1);
    expect(limiterAt).toBeLessThan(kemmaAt);
    expect(limiterAt).toBeLessThan(fnAt);
    expect(limiterAt).toBeLessThan(trpcAt);
  });

  it("PASS: requireSession sits in the same chain as /api/kemma/stream and /api/fn", () => {
    expect(src).toMatch(/app\.post\('\/api\/kemma\/stream',\s*requireSession,\s*kemmaStreamRoute\)/);
    expect(src).toMatch(/app\.use\('\/api\/fn',\s*requireSession,\s*fnRouter\)/);
  });

  it("FIXED (was MW-4): error monitoring is registered; cspMiddleware stays off deliberately", () => {
    // The CSP policy in security.ts sets frame-src 'none' and a production
    // connect-src that omits wss:, which would break the FloatingVideoPlayer
    // YouTube embeds and the /ws/intelligence socket. Register it only after
    // the policy accounts for both.
    expect(src).toContain("app.use(errorMonitoringMiddleware)");
    expect(src).toContain("registerGlobalErrorHandlers()");
    expect(src).not.toMatch(/app\.use\(\s*cspMiddleware\s*\)/);
  });

  it("FINDING MW-5: the purpose-built auth limiters and rateLimitMiddleware are never registered", () => {
    expect(src).not.toContain("loginRateLimiter");
    expect(src).not.toContain("registerRateLimiter");
    expect(src).not.toContain("passwordResetRateLimiter");
    expect(src).not.toContain("rateLimitMiddleware");
  });

  it("FIXED (was MW-6): Express trusts exactly one proxy hop, so req.ip is the real client", () => {
    expect(src).toMatch(/app\.set\(\s*['"]trust proxy['"]\s*,\s*1\s*\)/);
  });
});
