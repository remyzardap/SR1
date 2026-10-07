import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Behaviour tests for the real service worker in `client/public/sw.js`.
 *
 * The worker is a plain script with no module exports, so it is loaded into a
 * `node:vm` context with stubbed worker globals (self/caches/fetch/clients) and
 * driven through its event listeners. That keeps the assertions against shipped
 * code: editing a rule in sw.js changes these results, which a re-declared copy
 * of the logic could never do.
 */

const ORIGIN = "https://sutaeru.test";
const SW_SOURCE = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

type FakeInit = { status?: number; statusText?: string; type?: string; headers?: Record<string, string> };

class FakeResponse {
  status: number;
  statusText: string;
  type: string;
  bodyUsed = false;
  headers: { get(name: string): string | null };
  readonly body: string;

  constructor(body: string, init: FakeInit = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "";
    this.type = init.type ?? "basic";
    // Header names are case-insensitive in the real Response API.
    const headers = Object.fromEntries(
      Object.entries(init.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])
    );
    this.headers = { get: (name: string) => headers[name.toLowerCase()] ?? null };
  }

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  clone(): FakeResponse {
    if (this.bodyUsed) throw new TypeError("Cannot clone a consumed response");
    return new FakeResponse(this.body, {
      status: this.status,
      statusText: this.statusText,
      type: this.type,
    });
  }

  async text(): Promise<string> {
    this.bodyUsed = true;
    return this.body;
  }
}

type FakeRequest = {
  url: string;
  method: string;
  mode: string;
  destination: string;
  headers: { get(name: string): string | null };
};

function request(url: string, init: Partial<Pick<FakeRequest, "method" | "mode" | "destination">> = {}): FakeRequest {
  return {
    url: new URL(url, ORIGIN).href,
    method: init.method ?? "GET",
    mode: init.mode ?? "no-cors",
    destination: init.destination ?? "",
    headers: { get: () => null },
  };
}

function navigation(url = "/inbox"): FakeRequest {
  return request(url, { mode: "navigate", destination: "document" });
}

/** Absolute URL for either a request object or a relative/absolute string. */
function keyOf(input: string | FakeRequest): string {
  return typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
}

function createWorker() {
  const listeners = new Map<string, Array<(event: never) => void>>();
  const cachesStore = new Map<string, Map<string, FakeResponse>>();
  const fetchLog: string[] = [];
  const waits: Array<Promise<unknown>> = [];
  let network: (req: FakeRequest) => Promise<FakeResponse> = async (req) =>
    new FakeResponse(`served ${req.url}`);

  const store = (name: string) => {
    let existing = cachesStore.get(name);
    if (!existing) {
      existing = new Map<string, FakeResponse>();
      cachesStore.set(name, existing);
    }
    return existing;
  };

  const cacheLike = (name: string) => ({
    async put(input: string | FakeRequest, response: FakeResponse) {
      store(name).set(keyOf(input), response);
    },
    async match(input: string | FakeRequest) {
      return store(name).get(keyOf(input));
    },
  });

  const caches = {
    open: async (name: string) => cacheLike(name),
    keys: async () => [...cachesStore.keys()],
    delete: async (name: string) => cachesStore.delete(name),
    match: async (input: string | FakeRequest) => {
      const key = keyOf(input);
      for (const entries of cachesStore.values()) {
        const hit = entries.get(key);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const fetchStub = async (input: string | FakeRequest) => {
    const url = keyOf(input);
    fetchLog.push(url);
    const req = typeof input === "string" ? request(url) : input;
    return network(req);
  };

  const state = { skipWaiting: 0, claim: 0, notifications: [] as unknown[] };

  const self = {
    addEventListener: (type: string, handler: (event: never) => void) => {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    location: { origin: ORIGIN, href: `${ORIGIN}/` },
    clients: {
      claim: async () => {
        state.claim += 1;
      },
      matchAll: async () => [],
      openWindow: async (url: string) => ({ url }),
    },
    registration: { showNotification: async (title: string, options: unknown) => void state.notifications.push({ title, options }) },
    skipWaiting: async () => {
      state.skipWaiting += 1;
    },
  };

  const context = createContext({
    self,
    caches,
    fetch: fetchStub,
    Response: FakeResponse,
    URL,
    console,
    setTimeout,
    Promise,
  });
  runInContext(SW_SOURCE, context);

  /** Drains the microtask queue so fire-and-forget `cache.put()` has landed. */
  async function flush(rounds = 10) {
    for (let i = 0; i < rounds; i += 1) {
      await Promise.resolve();
    }
  }

  async function fire(type: string, event: Record<string, unknown> = {}) {
    const extended = {
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        waits.push(promise.catch(() => undefined));
      },
    };
    for (const handler of listeners.get(type) ?? []) {
      (handler as (e: Record<string, unknown>) => void)(extended);
    }
    await Promise.all(waits.splice(0, waits.length));
    await flush();
  }

  type FetchOutcome = { handled: boolean; response?: FakeResponse; error?: unknown };

  async function dispatchFetch(req: FakeRequest): Promise<FetchOutcome> {
    let captured: Promise<FakeResponse> | undefined;
    const event = {
      request: req,
      respondWith: (promise: Promise<FakeResponse>) => {
        captured = promise;
      },
      waitUntil: () => undefined,
    };
    for (const handler of listeners.get("fetch") ?? []) {
      (handler as (e: typeof event) => void)(event);
    }
    if (!captured) return { handled: false };
    try {
      return { handled: true, response: await captured };
    } catch (error) {
      return { handled: true, error };
    } finally {
      await flush();
    }
  }

  return {
    dispatch: {
      install: () => fire("install"),
      activate: () => fire("activate"),
      message: (data: unknown) => fire("message", { data }),
      fetch: dispatchFetch,
    },
    /** Sets what the stubbed network returns; throw to simulate being offline. */
    route(handler: (req: FakeRequest) => Promise<FakeResponse>) {
      network = handler;
    },
    offline() {
      network = async (req) => {
        throw new TypeError(`Failed to fetch ${req.url}`);
      };
    },
    /** Writes a cache directly, to stand in for an older deployment's leftovers. */
    seedCache(name: string, entries: Record<string, string>) {
      const target = store(name);
      for (const [path, body] of Object.entries(entries)) {
        target.set(new URL(path, ORIGIN).href, new FakeResponse(body));
      }
    },
    /** Paths the worker actually fetched, absolute → root-relative. */
    fetched: () => fetchLog.map((url) => url.slice(ORIGIN.length)),
    cachedPaths: (cacheName: string) =>
      [...(cachesStore.get(cacheName)?.keys() ?? [])].map((key) => key.slice(ORIGIN.length)),
    cacheNames: () => [...cachesStore.keys()],
    hasCacheEntry: (cacheName: string, path: string) =>
      store(cacheName).has(new URL(path, ORIGIN).href),
    responseIn: (cacheName: string, path: string) => store(cacheName).get(new URL(path, ORIGIN).href),
    calls: state,
    listeners: (type: string) => (listeners.get(type) ?? []).length,
  };
}

const worker = () => createWorker();

describe("sw.js install", () => {
  it("caches every app shell entry and does not skipWaiting", async () => {
    const sw = worker();
    await sw.dispatch.install();

    expect(sw.calls.skipWaiting).toBe(0);
    const cached = sw.cachedPaths("sutaeru-v4");
    for (const path of [
      "/",
      "/index.html",
      "/manifest.webmanifest",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable-512.png",
      "/apple-touch-icon.png",
      "/favicon.svg",
      "/favicon.png",
    ]) {
      expect(cached).toContain(path);
    }
  });

  it("keeps installing the shell when one entry 404s", async () => {
    const sw = worker();
    sw.route(async (req) =>
      req.url === `${ORIGIN}/icon-512.png` ? new FakeResponse("nope", { status: 404 }) : new FakeResponse("ok")
    );
    await sw.dispatch.install();

    // cache.addAll() would have rejected the whole install over this one 404.
    expect(sw.hasCacheEntry("sutaeru-v4", "/index.html")).toBe(true);
    expect(sw.hasCacheEntry("sutaeru-v4", "/icon-512.png")).toBe(false);
  });

  it("survives a shell fetch that rejects outright", async () => {
    const sw = worker();
    sw.route(async (req) => {
      if (req.url === `${ORIGIN}/favicon.ico` || req.url === `${ORIGIN}/favicon.png`) {
        throw new TypeError("network down");
      }
      return new FakeResponse("ok");
    });
    await expect(sw.dispatch.install()).resolves.toBeUndefined();
    expect(sw.hasCacheEntry("sutaeru-v4", "/index.html")).toBe(true);
  });

  it("names the cache after a version so updates can be swapped in", async () => {
    const sw = worker();
    await sw.dispatch.install();
    expect(sw.cacheNames()).toEqual(["sutaeru-v4"]);
    expect(sw.cacheNames()[0]).toMatch(/^sutaeru-v\d+$/);
  });
});

describe("sw.js activate", () => {
  it("deletes a cache left by the previous version and claims the page", async () => {
    const sw = worker();
    sw.seedCache("sutaeru-v3", { "/index.html": "shell from the old build" });
    await sw.dispatch.install();
    await sw.dispatch.activate();

    expect(sw.cacheNames()).toEqual(["sutaeru-v4"]);
    expect(sw.calls.claim).toBe(1);
  });

  it("serves the new shell, never the old build's copy", async () => {
    const sw = worker();
    sw.seedCache("sutaeru-v3", { "/index.html": "shell from the old build" });
    await sw.dispatch.install();
    await sw.dispatch.activate();
    sw.offline();

    const result = await sw.dispatch.fetch(navigation("/"));
    expect(await result.response?.text()).not.toBe("shell from the old build");
  });
});

describe("sw.js never caches API or streaming traffic", () => {
  const neverCached = [
    "/api/kemma/stream",
    "/api/fn/research",
    "/api/chat/history",
    "/api/documents/generate",
    "/trpc/kemma.stream",
  ];

  it.each(neverCached)("leaves %s to the network with no respondWith", async (path) => {
    const sw = worker();
    await sw.dispatch.install();
    const result = await sw.dispatch.fetch(request(path));

    expect(result.handled).toBe(false);
    // Nothing was written for it, so a repeat visit cannot be served from cache.
    expect(sw.hasCacheEntry("sutaeru-v4", path)).toBe(false);
  });

  it("does not intercept non-GET requests", async () => {
    const sw = worker();
    const result = await sw.dispatch.fetch(request("/index.html", { method: "POST" }));
    expect(result.handled).toBe(false);
  });

  it("does not intercept cross-origin requests", async () => {
    const sw = worker();
    await sw.dispatch.install();
    const result = await sw.dispatch.fetch(request("https://cdn.example.com/assets/app.js", { destination: "script" }));
    expect(result.handled).toBe(false);
    expect(sw.cachedPaths("sutaeru-v4")).not.toContain("/assets/app.js");
  });
});

describe("sw.js navigation", () => {
  it("goes to the network while online", async () => {
    const sw = worker();
    await sw.dispatch.install();
    sw.route(async () => new FakeResponse("<!doctype html>fresh"));

    const result = await sw.dispatch.fetch(navigation("/inbox"));
    expect(await result.response?.text()).toBe("<!doctype html>fresh");
  });

  it("serves the cached shell offline so a deep link still opens", async () => {
    const sw = worker();
    await sw.dispatch.install();
    sw.offline();

    const result = await sw.dispatch.fetch(navigation("/inbox"));
    expect(result.handled).toBe(true);
    expect(result.error).toBeUndefined();
    expect(await result.response?.text()).toBe("served https://sutaeru.test/index.html");
  });

  it("settles on a 504 offline instead of rejecting when nothing is cached", async () => {
    const sw = worker();
    sw.offline();

    const result = await sw.dispatch.fetch(navigation("/inbox"));
    expect(result.error).toBeUndefined();
    expect(result.response?.status).toBe(504);
  });
});

describe("sw.js static assets", () => {
  it("serves a cached asset without touching the network", async () => {
    const sw = worker();
    await sw.dispatch.install();
    const before = sw.fetched().length;

    const result = await sw.dispatch.fetch(request("/index.html", { mode: "same-origin", destination: "document" }));
    expect(result.response?.status).toBe(200);
    expect(sw.fetched().length).toBe(before);
  });

  it("stores a freshly fetched script so the next load works offline", async () => {
    const sw = worker();
    await sw.dispatch.install();

    const first = await sw.dispatch.fetch(request("/assets/app.js", { destination: "script" }));
    expect(first.response?.status).toBe(200);
    expect(sw.hasCacheEntry("sutaeru-v4", "/assets/app.js")).toBe(true);

    sw.offline();
    const second = await sw.dispatch.fetch(request("/assets/app.js", { destination: "script" }));
    expect(second.error).toBeUndefined();
    expect(await second.response?.text()).toBe("served https://sutaeru.test/assets/app.js");
  });

  it("does not store a 404 that would be replayed offline forever", async () => {
    const sw = worker();
    await sw.dispatch.install();
    sw.route(async () => new FakeResponse("missing", { status: 404 }));

    const result = await sw.dispatch.fetch(request("/assets/gone.js", { destination: "script" }));
    expect(result.response?.status).toBe(404);
    expect(sw.hasCacheEntry("sutaeru-v4", "/assets/gone.js")).toBe(false);
  });

  it("does not store an opaque cross-origin body", async () => {
    const sw = worker();
    await sw.dispatch.install();
    sw.route(async () => new FakeResponse("opaque", { status: 200, type: "opaque" }));

    await sw.dispatch.fetch(request("/fonts/ink.woff2", { destination: "font" }));
    expect(sw.hasCacheEntry("sutaeru-v4", "/fonts/ink.woff2")).toBe(false);
  });

  it("returns a 504 for an uncached chunk when offline rather than throwing", async () => {
    const sw = worker();
    await sw.dispatch.install();
    sw.offline();

    const result = await sw.dispatch.fetch(request("/assets/lazy-route.js", { destination: "script" }));
    expect(result.error).toBeUndefined();
    expect(result.response?.status).toBe(504);
    expect(result.response?.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });
});

describe("sw.js update messaging", () => {
  it("takes effect immediately when the page posts skip-waiting", async () => {
    const sw = worker();
    await sw.dispatch.message({ type: "skip-waiting" });
    expect(sw.calls.skipWaiting).toBe(1);
  });

  it("ignores unrelated and non-object messages", async () => {
    const sw = worker();
    await sw.dispatch.message({ type: "stream-start" });
    await sw.dispatch.message("skip-waiting");
    await sw.dispatch.message(undefined);
    expect(sw.calls.skipWaiting).toBe(0);
  });
});
