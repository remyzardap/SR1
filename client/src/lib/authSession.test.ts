import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearAuthToken, getAuthToken, setAuthToken } from "./authSession";

const KEY = "sutaeru-auth-token";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    entries: map,
  };
}

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  (globalThis as { window?: unknown }).window = { localStorage: store };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("authSession", () => {
  it("reads the token back from the one key it owns", () => {
    expect(setAuthToken("abc123")).toBe(true);
    expect(store.entries.get(KEY)).toBe("abc123");
    expect(getAuthToken()).toBe("abc123");
  });

  it("refuses to store anything that is not a usable token", () => {
    for (const bad of ["", "   ", "\t\n", null, undefined, 42, {}, []]) {
      expect(setAuthToken(bad)).toBe(false);
    }
    expect(store.entries.size).toBe(0);
    expect(getAuthToken()).toBeNull();
  });

  it("clears only its own key", () => {
    store.entries.set("sutaeru:fold:studio", '["brief"]');
    setAuthToken("abc123");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
    expect(store.entries.get("sutaeru:fold:studio")).toBe('["brief"]');
  });

  it("is inert before the window exists (SSR and the first paint)", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(getAuthToken()).toBeNull();
    expect(setAuthToken("abc123")).toBe(false);
    expect(clearAuthToken()).toBeUndefined();
  });
});
