import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { Express } from "express";

// Same fakes as services/google.audit.test.ts: the callback route runs
// against the REAL services/google state store and exchange logic.

const g = vi.hoisted(() => ({
  exchangeShouldThrow: false,
  profileEmail: "user@example.test",
}));

vi.mock("googleapis", () => {
  class FakeOAuth2 {
    setCredentials(_c: unknown) {}
    generateAuthUrl(params: { state?: string }) {
      return `https://accounts.google.com/o/oauth2/auth?state=${params.state ?? ""}`;
    }
    async getToken(_code: string) {
      if (g.exchangeShouldThrow) throw new Error("invalid_code");
      return {
        tokens: {
          access_token: "fake-at",
          refresh_token: "fake-rt",
          expiry_date: Date.now() + 3600000,
        },
      };
    }
    on(_e: string, _cb: unknown) {}
  }
  return {
    google: {
      auth: { OAuth2: FakeOAuth2 },
      oauth2: () => ({
        userinfo: {
          get: async () => ({ data: { email: g.profileEmail } }),
        },
      }),
    },
  };
});

const d = vi.hoisted(() => ({
  tokenRows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(d.tokenRows) }) }) }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        d.inserts.push(row);
        return Promise.resolve();
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  })),
}));

import { registerGoogleCallbackRoute } from "./googleCallback";
import { getAuthUrl } from "../services/google";

type Recorded = { redirect: string | null; status: number | null; json: unknown };

function fakeApp() {
  const routes: Array<{ method: string; path: string; handler: (req: any, res: any) => Promise<void> | void }> = [];
  const app = {
    get(path: string, handler: any) {
      routes.push({ method: "get", path, handler });
    },
    post(path: string, handler: any) {
      routes.push({ method: "post", path, handler });
    },
  } as unknown as Express;
  return { app, routes };
}

function fakeRes() {
  const rec: Recorded = { redirect: null, status: null, json: null };
  const res = {
    redirect(url: string) {
      rec.redirect = url;
    },
    status(code: number) {
      rec.status = code;
      return this;
    },
    json(payload: unknown) {
      rec.json = payload;
      return this;
    },
  };
  return { res, rec };
}

const ENV_NAMES = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_TOKEN_ENCRYPTION_KEY"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.GOOGLE_CLIENT_ID = "fake-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "fake-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://example.test/api/google/callback";
  g.exchangeShouldThrow = false;
  g.profileEmail = "user@example.test";
  d.tokenRows = [];
  d.inserts = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

async function hit(query: Record<string, string>) {
  const { app, routes } = fakeApp();
  registerGoogleCallbackRoute(app);
  expect(routes).toHaveLength(1);
  expect(routes[0].method).toBe("get");
  expect(routes[0].path).toBe("/api/google/callback");
  const { res, rec } = fakeRes();
  await routes[0].handler({ query }, res);
  return rec;
}

describe("google callback (public route) audit", () => {
  it("redirects consent-denial errors without touching the exchange", async () => {
    const rec = await hit({ error: "access_denied" });
    expect(rec.redirect).toBe("/connections?google=error&reason=access_denied");
  });

  it("redirects missing code or missing state to missing_params", async () => {
    expect((await hit({ code: "c" })).redirect).toContain("reason=missing_params");
    expect((await hit({ state: "s" })).redirect).toContain("reason=missing_params");
    expect((await hit({})).redirect).toContain("reason=missing_params");
  });

  it("rejects an unknown/forged state with invalid_state", async () => {
    const rec = await hit({ code: "fake-code", state: "ffffffff".repeat(8) });
    expect(rec.redirect).toContain("reason=invalid_state");
  });

  it("completes the exchange and stores tokens for the state's user", async () => {
    const { state } = getAuthUrl(11);
    const rec = await hit({ code: "fake-code", state });
    expect(rec.redirect).toBe("/connections?google=success&email=user%40example.test");
    expect(d.inserts[0]?.userId).toBe(11);
  });

  it("rejects state REPLAY: the second callback with the same state fails", async () => {
    const { state } = getAuthUrl(12);
    const first = await hit({ code: "fake-code", state });
    expect(first.redirect).toContain("google=success");
    const replay = await hit({ code: "fake-code", state });
    expect(replay.redirect).toContain("reason=invalid_state");
    expect(d.inserts).toHaveLength(1);
  });

  it("maps a code exchange failure to token_exchange_failed, not a crash", async () => {
    g.exchangeShouldThrow = true;
    const { state } = getAuthUrl(13);
    const rec = await hit({ code: "bad-code", state });
    expect(rec.redirect).toContain("reason=token_exchange_failed");
    expect(d.inserts).toHaveLength(0);
  });

  it("URL-encodes the email in the success redirect", async () => {
    g.profileEmail = "we+ird@ex ample.test";
    const { state } = getAuthUrl(14);
    const rec = await hit({ code: "fake-code", state });
    expect(rec.redirect).toBe("/connections?google=success&email=we%2Bird%40ex%20ample.test");
  });
});
