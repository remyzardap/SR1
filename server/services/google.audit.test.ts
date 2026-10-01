import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// ─── googleapis fake ──────────────────────────────────────────────────────────

const g = vi.hoisted(() => ({
  getTokenResult: {
    access_token: "fake-at",
    refresh_token: "fake-rt",
    expiry_date: Date.now() + 3600000,
  } as Record<string, unknown>,
  getTokenShouldThrow: false,
  refreshResult: {
    access_token: "fresh-at",
    refresh_token: null,
    expiry_date: Date.now() + 3600000,
  } as Record<string, unknown>,
  credentialSnapshots: [] as Record<string, unknown>[],
  revoked: false,
}));

vi.mock("googleapis", () => {
  class FakeOAuth2 {
    credentials: Record<string, unknown> = {};
    tokenListeners: Record<string, (t: unknown) => Promise<void>> = {};
    constructor(_id?: string, _secret?: string, _redirect?: string) {}
    setCredentials(c: Record<string, unknown>) {
      this.credentials = c;
      g.credentialSnapshots.push({ ...c });
    }
    async getToken(_code: string) {
      if (g.getTokenShouldThrow) throw new Error("invalid code");
      return { tokens: g.getTokenResult };
    }
    async refreshAccessToken() {
      return { credentials: g.refreshResult };
    }
    on(event: string, cb: (t: unknown) => Promise<void>) {
      this.tokenListeners[event] = cb;
    }
    async revokeCredentials() {
      g.revoked = true;
    }
  }
  return {
    google: {
      auth: { OAuth2: FakeOAuth2 },
      oauth2: () => ({ userinfo: { get: async () => ({ data: { email: "user@example.test" } }) } }),
      gmail: () => ({
        users: {
          messages: {
            list: async () => ({ data: { messages: [] } }),
            get: async () => ({ data: {} }),
            send: async () => ({ data: { id: "sent-1" } }),
          },
        },
      }),
    },
  };
});

// ─── db fake ──────────────────────────────────────────────────────────────────

const d = vi.hoisted(() => ({
  tokenRows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  deleted: false,
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(d.tokenRows),
        }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        d.inserts.push(row);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (obj: Record<string, unknown>) => ({
        where: () => {
          d.updates.push(obj);
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({
      where: () => {
        d.deleted = true;
        return Promise.resolve();
      },
    }),
  })),
}));

const ENV_NAMES = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_TOKEN_ENCRYPTION_KEY", "DATABASE_URL", "REPLIT_DEV_DOMAIN", "REPLIT_DOMAINS"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.GOOGLE_CLIENT_ID = "fake-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "fake-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://example.test/api/google/callback";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "fake-encryption-key";
  g.getTokenResult = { access_token: "fake-at", refresh_token: "fake-rt", expiry_date: Date.now() + 3600000 };
  g.getTokenShouldThrow = false;
  g.refreshResult = { access_token: "fresh-at", refresh_token: null, expiry_date: Date.now() + 3600000 };
  g.credentialSnapshots = [];
  g.revoked = false;
  d.tokenRows = [];
  d.inserts = [];
  d.updates = [];
  d.deleted = false;
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

const load = async () => import("./google");

// ─── Token exchange and storage ──────────────────────────────────────────────

describe("exchangeCodeForTokens storage (audit)", () => {
  it("inserts exactly the googleTokens schema columns and encrypts at rest", async () => {
    const { exchangeCodeForTokens } = await load();
    const { googleTokens } = await import("../../drizzle/schema");
    const result = await exchangeCodeForTokens("fake-code", 3);
    expect(result).toEqual({ email: "user@example.test" });
    expect(d.inserts).toHaveLength(1);
    const row = d.inserts[0];
    const schemaColumns = Object.keys(googleTokens);
    for (const key of Object.keys(row)) {
      expect(schemaColumns, `column ${key} not in googleTokens schema`).toContain(key);
    }
    expect(row.userId).toBe(3);
    expect(row.email).toBe("user@example.test");
    expect(String(row.expiresAt)).not.toBe("Invalid Date");
    expect(String(row.scopes)).toContain("gmail.send");
    // Encrypted at rest: the raw provider token must not hit the DB.
    expect(String(row.accessToken).startsWith("enc:")).toBe(true);
    expect(String(row.accessToken)).not.toContain("fake-at");
    expect(String(row.refreshToken).startsWith("enc:")).toBe(true);
  });

  it("updates the existing row when the user reconnects", async () => {
    d.tokenRows = [{ id: 1, userId: 3, email: "old@example.test", accessToken: "x", refreshToken: "y", expiresAt: new Date(), scopes: null }];
    const { exchangeCodeForTokens } = await load();
    await exchangeCodeForTokens("fake-code", 3);
    expect(d.inserts).toHaveLength(0);
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0]).toMatchObject({ userId: 3, email: "user@example.test" });
    expect(d.updates[0].updatedAt).toBeInstanceOf(Date);
  });

  it("rejects when Google omits the refresh token (offline grant broken)", async () => {
    g.getTokenResult = { access_token: "fake-at", refresh_token: undefined };
    const { exchangeCodeForTokens } = await load();
    await expect(exchangeCodeForTokens("fake-code", 3)).rejects.toThrow(/Failed to get tokens/);
  });

  it("surfaces a code exchange failure as a rejection", async () => {
    g.getTokenShouldThrow = true;
    const { exchangeCodeForTokens } = await load();
    await expect(exchangeCodeForTokens("bad-code", 3)).rejects.toThrow();
  });

  it("stores plaintext tokens when GOOGLE_TOKEN_ENCRYPTION_KEY is unset (documented behavior)", async () => {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    const { exchangeCodeForTokens } = await load();
    await exchangeCodeForTokens("fake-code", 3);
    expect(d.inserts[0]?.accessToken).toBe("fake-at");
  });
});

// ─── Authenticated client + refresh ──────────────────────────────────────────

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 3,
    email: "user@example.test",
    accessToken: "enc:not-needed-for-this-path",
    refreshToken: "fake-rt",
    expiresAt: new Date(Date.now() + 600000),
    scopes: null,
    ...overrides,
  };
}

describe("getAuthenticatedClient via listEmails (audit)", () => {
  it("fails fast with a clear error when no row exists", async () => {
    d.tokenRows = [];
    const { listEmails } = await load();
    await expect(listEmails(3)).rejects.toThrow(/not connected/i);
  });

  it("decrypts stored tokens before handing them to the OAuth client", async () => {
    const { exchangeCodeForTokens, listEmails } = await load();
    await exchangeCodeForTokens("fake-code", 3);
    const inserted = d.inserts[0];
    d.tokenRows = [storedRow({ accessToken: String(inserted?.accessToken), refreshToken: String(inserted?.refreshToken) })];
    await listEmails(3);
    const last = g.credentialSnapshots[g.credentialSnapshots.length - 1];
    expect(last.access_token).toBe("fake-at");
    expect(last.refresh_token).toBe("fake-rt");
  });

  it("refreshes an expired token and persists the new access token ENCRYPTED", async () => {
    d.tokenRows = [storedRow({ expiresAt: new Date(Date.now() - 1000) })];
    const { listEmails } = await load();
    await listEmails(3);
    expect(d.updates.length).toBeGreaterThan(0);
    const persisted = d.updates[0];
    // The refresh path used to store the raw token while the exchange path
    // stored "enc:" - both must be encrypted when a key is configured.
    expect(String(persisted.accessToken).startsWith("enc:")).toBe(true);
    expect(String(persisted.accessToken)).not.toContain("fresh-at");
  });

  it("maps a refresh failure to the reconnect message", async () => {
    d.tokenRows = [storedRow({ expiresAt: new Date(Date.now() - 1000) })];
    const { listEmails } = await load();
    const googleMod = await import("googleapis") as any;
    const origOAuth2 = googleMod.google.auth.OAuth2;
    googleMod.google.auth.OAuth2 = class extends origOAuth2 {
      async refreshAccessToken() {
        throw new Error("revoked grant");
      }
    };
    try {
      await expect(listEmails(3)).rejects.toThrow(/expired. Please reconnect/i);
    } finally {
      googleMod.google.auth.OAuth2 = origOAuth2;
    }
  });
});

// ─── Status and disconnect shapes ────────────────────────────────────────────

describe("getConnectionStatus / disconnect (audit)", () => {
  it("returns the { connected, email } shape the Connections page and engine read", async () => {
    d.tokenRows = [];
    const { getConnectionStatus } = await load();
    await expect(getConnectionStatus(3)).resolves.toEqual({ connected: false, email: null });
    d.tokenRows = [storedRow()];
    await expect(getConnectionStatus(3)).resolves.toEqual({ connected: true, email: "user@example.test" });
  });

  it("disconnect revokes upstream and deletes the row even if revoke fails", async () => {
    d.tokenRows = [storedRow()];
    const { disconnect } = await load();
    await disconnect(3);
    expect(g.revoked).toBe(true);
    expect(d.deleted).toBe(true);
  });

  it("disconnect still deletes the row when revoking upstream throws", async () => {
    d.tokenRows = [storedRow()];
    const googleMod = await import("googleapis") as any;
    const origOAuth2 = googleMod.google.auth.OAuth2;
    googleMod.google.auth.OAuth2 = class extends origOAuth2 {
      async revokeCredentials() {
        throw new Error("network down");
      }
    };
    try {
      const { disconnect } = await load();
      await disconnect(3);
      expect(d.deleted).toBe(true);
    } finally {
      googleMod.google.auth.OAuth2 = origOAuth2;
    }
  });
});
