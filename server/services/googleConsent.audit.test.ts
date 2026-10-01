import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  getAuthUrl,
  isGoogleConfigured,
  validateOAuthState,
} from "./google";

// The real googleapis OAuth2.generateAuthUrl is a pure URL builder (no
// network), so the consent-URL shape is verified against the actual library.
// Token-endpoint paths live in google.audit.test.ts with a mocked googleapis.

const ENV_NAMES = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "REPLIT_DEV_DOMAIN", "REPLIT_DOMAINS", "GOOGLE_TOKEN_ENCRYPTION_KEY"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.GOOGLE_CLIENT_ID = "fake-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "fake-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://example.test/api/google/callback";
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("getAuthUrl consent build (audit)", () => {
  it("returns a Google consent URL carrying the state and offline scopes", () => {
    const { url, state } = getAuthUrl(42);
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://accounts.google.com");
    expect(parsed.searchParams.get("state")).toBe(state);
    expect(parsed.searchParams.get("client_id")).toBe("fake-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://example.test/api/google/callback");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    const scopes = parsed.searchParams.get("scope") ?? "";
    for (const need of ["gmail.readonly", "gmail.send", "calendar", "drive.readonly", "drive.file", "userinfo.email"]) {
      expect(scopes).toContain(need);
    }
  });

  it("issues a fresh state per call and maps each state to its user", () => {
    const a = getAuthUrl(1);
    const b = getAuthUrl(2);
    expect(a.state).not.toBe(b.state);
    expect(validateOAuthState(a.state)).toBe(1);
    expect(validateOAuthState(b.state)).toBe(2);
  });

  it("throws without a client id/secret instead of building a broken URL", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(() => getAuthUrl(9)).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("isGoogleConfigured reflects both env vars", () => {
    expect(isGoogleConfigured()).toBe(true);
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(isGoogleConfigured()).toBe(false);
  });
});

describe("oauth state CSRF store (audit)", () => {
  it("is single-use: the state dies with the first validation (replay rejected)", () => {
    const { state } = getAuthUrl(5);
    expect(validateOAuthState(state)).toBe(5);
    expect(validateOAuthState(state)).toBeNull();
    expect(validateOAuthState(state)).toBeNull();
  });

  it("rejects unknown states and states older than the 10 minute window", () => {
    expect(validateOAuthState("deadbeef")).toBeNull();
    const { state } = getAuthUrl(6);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(validateOAuthState(state)).toBeNull();
    vi.useRealTimers();
  });

  it("still accepts a state inside the window", () => {
    const { state } = getAuthUrl(8);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 9 * 60 * 1000);
    expect(validateOAuthState(state)).toBe(8);
    vi.useRealTimers();
  });
});
