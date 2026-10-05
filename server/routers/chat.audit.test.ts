import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit tests for the legacy SSE route in server/routers/chat.ts (POST /api/chat/stream and
// GET /api/chat/history). The route is mounted with its own auth in server/_core/index.ts.
// Everything below runs against fakes: no network, no database, fake credentials only.

const auth = vi.hoisted(() => ({
  user: null as null | { id: number; openId: string },
  throwOnAuth: false,
  vertexToken: "fake-access-token" as string | undefined,
  vertexThrows: false,
}));

const db = vi.hoisted(() => ({
  available: true,
  identity: null as null | { id: number; displayName: string; handle: string; bio: string | null },
  identityThrows: false,
  memories: [] as unknown[],
  skills: [] as unknown[],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  sessions: new Set<string>(),
  history: [] as unknown[],
  queryThrows: false,
}));

const google = vi.hoisted(() => ({
  connected: false,
  throws: false,
  emails: [] as unknown[],
  events: [] as unknown[],
  files: [] as unknown[],
}));

const openclaw = vi.hoisted(() => ({ sent: [] as Array<{ event: string; payload: unknown }> }));

vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => {
      if (auth.throwOnAuth) throw new Error("Invalid session");
      if (!auth.user) throw new Error("Invalid session");
      return auth.user;
    }),
  },
}));

vi.mock("../db", () => ({
  getOrCreateIdentity: async () => {
    if (db.identityThrows) throw new Error("db down");
    return db.identity;
  },
  getSkillsByIdentity: async () => db.skills,
  getMemoriesByIdentity: async () => db.memories,
  getDb: async () => (db.available ? fakeDb() : null),
}));

vi.mock("../services/google", () => ({
  getConnectionStatus: async () => {
    if (google.throws) throw new Error("token expired");
    return { connected: google.connected };
  },
  listEmails: async () => google.emails,
  listCalendarEvents: async () => google.events,
  listDriveFiles: async () => google.files,
}));

vi.mock("../lib/openclaw", () => ({
  openclaw: {
    send: vi.fn(async (event: string, payload: unknown) => {
      openclaw.sent.push({ event, payload });
    }),
  },
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      if (auth.vertexThrows) {
        throw new Error(`Could not load the default credentials; file: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
      }
      return { getAccessToken: async () => ({ token: auth.vertexToken }) };
    }
    async getProjectId() {
      return "adc-project-123";
    }
  },
}));

// vertexEnabled() checks GOOGLE_APPLICATION_CREDENTIALS readability; the harness
// points it at a path that does not exist on this box, so report it readable
// while keeping the rest of node:fs real.
const fsState = vi.hoisted(() => ({ readable: true }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    accessSync: (_path: string | Uint8Array, _mode?: number) => {
      if (!fsState.readable) throw new Error("ENOENT");
    },
  };
});

import { registerChatStreamRoute } from "./chat";
import { chatMessages, chatSessions } from "../../drizzle/schema";

// ─── Fakes ───────────────────────────────────────────────────────────────────

/** The fake only knows about rows the test seeded: sessions and the history read. */
function rowsFor(selectTable: unknown) {
  if (selectTable === chatSessions) return [...db.sessions].map((id) => ({ id }));
  if (selectTable === chatMessages) return db.history;
  return [];
}

function fakeDb() {
  const chain: any = {
    __selectTable: undefined as unknown,
    __insertTable: undefined as unknown,
    from(table: unknown) {
      chain.__selectTable = table;
      if (db.queryThrows) {
        const boom: any = {
          where: () => {
            throw new Error('column "createdAt" does not exist');
          },
        };
        return boom;
      }
      return chain;
    },
    where: () => chain,
    limit: () => Promise.resolve(rowsFor(chain.__selectTable)),
    orderBy: () => Promise.resolve(rowsFor(chain.__selectTable)),
    values: (values: Record<string, unknown>) => {
      db.inserts.push({
        table: chain.__insertTable === chatMessages ? "chatMessages" : String((chain.__insertTable as any)?.name ?? "other"),
        values,
      });
      if (chain.__insertTable === chatSessions) db.sessions.add(String(values.id));
      return Promise.resolve();
    },
  };
  return {
    select(_probe?: unknown) {
      chain.__selectTable = undefined;
      return chain;
    },
    insert(table: unknown) {
      chain.__insertTable = table;
      return chain;
    },
  };
}

function fakeRes() {
  const res = {
    statusCode: 200,
    json: null as unknown,
    frames: [] as string[],
    headers: {} as Record<string, string>,
    ended: false,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    jsonBody(payload: unknown) {
      res.json = payload;
      return res;
    },
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
    flushHeaders() {},
    write(chunk: string) {
      res.frames.push(chunk);
    },
    end() {
      res.ended = true;
    },
    on() {},
  };
  // express Response.json is a method; keep both spellings for the fake.
  (res as any).json = (payload: unknown) => {
    res.jsonBody(payload);
    return res;
  };
  return res;
}

type Handler = (req: unknown, res: unknown) => Promise<void>;

function register() {
  const routes = new Map<string, Handler>();
  const app = {
    post(path: string, handler: Handler) {
      routes.set(`POST ${path}`, handler);
    },
    get(path: string, handler: Handler) {
      routes.set(`GET ${path}`, handler);
    },
  };
  registerChatStreamRoute(app as never);
  return routes;
}

function parseSse(raw: string): { event: string; data: string } {
  const block = raw.trim();
  const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
  const data = /^data: (.*)$/m.exec(block)?.[1] ?? "";
  return { event, data };
}

const frames = (res: ReturnType<typeof fakeRes>) => res.frames.map(parseSse);
const events = (res: ReturnType<typeof fakeRes>) => frames(res).map((f) => f.event);

const ENV_NAMES = [
  "GEMINI_BACKEND", "GEMINI_API_KEY", "GEMINI", "QWEN_API_KEY", "SONAR_API_KEY",
  "PERPLEXITY_API_KEY", "VERTEX_PROJECT", "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_LOCATION", "KEMMA_MODEL_CHAT",
  "KEMMA_MODEL_VISION", "KEMMA_MODEL_PRO", "KEMMA_MODEL_LONG_DOC",
];

const saved = new Map<string, string | undefined>();
let fetchMock: ReturnType<typeof vi.fn>;
let llmResponder: (url: string, body: unknown) => Response;

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  auth.user = { id: 7, openId: "user-7" };
  auth.throwOnAuth = false;
  auth.vertexToken = "fake-access-token";
  auth.vertexThrows = false;
  db.available = true;
  db.identity = { id: 42, displayName: "Ada", handle: "ada", bio: null };
  db.identityThrows = false;
  db.memories = [];
  db.skills = [];
  db.inserts = [];
  db.sessions = new Set();
  db.history = [];
  db.queryThrows = false;
  google.connected = false;
  google.throws = false;
  google.emails = [];
  google.events = [];
  google.files = [];
  openclaw.sent = [];

  llmResponder = () =>
    new Response(
      [
        'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join(""),
      { status: 200 },
    );

  fetchMock = vi.fn(async (url: string, init: any) => llmResponder(url, init?.body ? JSON.parse(init.body) : null));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

const body = (over: Record<string, unknown> = {}) => ({
  messages: [{ role: "user", content: "hello there" }],
  ...over,
});

async function callStream(reqBody: unknown, routes = register()) {
  const res = fakeRes();
  await routes.get("POST /api/chat/stream")!({ body: reqBody, headers: {} }, res);
  return res;
}

const llmCall = () => {
  // The synthesis call is the one made with stream: true; the blend drafts are non-streaming.
  const call = fetchMock.mock.calls.find(([url, init]) => {
    if (!String(url).includes("/chat/completions") || !init?.body) return false;
    return JSON.parse(init.body).stream === true;
  });
  if (!call) return null;
  return { url: String(call[0]), headers: call[1].headers as Record<string, string>, body: JSON.parse(call[1].body) };
};

const draftCalls = () =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url).includes("/chat/completions") && init?.body && JSON.parse(init.body).stream === false)
    .map(([url, init]) => ({ url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(init.body) }));

describe("authentication and body validation", () => {
  it("401s before writing any SSE frame when the session is missing", async () => {
    auth.user = null;
    const res = await callStream(body());
    expect(res.statusCode).toBe(401);
    expect(res.json).toEqual({ error: "Unauthorized" });
    expect(res.frames).toHaveLength(0);
  });

  it("400s on a missing, empty or non-array messages field", async () => {
    for (const bad of [{}, { messages: [] }, { messages: "hello" }, { messages: null }]) {
      const res = await callStream(bad);
      expect([JSON.stringify(bad), res.statusCode]).toEqual([JSON.stringify(bad), 400]);
      expect(res.json).toEqual({ error: "messages array is required" });
    }
  });

  it("400s instead of throwing when express.json never populated the body", async () => {
    // A non-JSON Content-Type leaves req.body undefined; destructuring it used to reject the
    // async handler, which leaves the request hanging with no response at all.
    const routes = register();
    const res = fakeRes();
    let thrown: unknown;
    try {
      await routes.get("POST /api/chat/stream")!({ headers: {} }, res);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeUndefined();
    expect(res.statusCode).toBe(400);
    expect(events(res)).toHaveLength(0);
  });

  it("500s when the identity lookup fails and 404s when there is no identity", async () => {
    db.identityThrows = true;
    expect((await callStream(body())).statusCode).toBe(500);
    db.identityThrows = false;
    db.identity = null;
    const res = await callStream(body());
    expect(res.statusCode).toBe(404);
    expect(res.json).toEqual({ error: "Identity not found" });
  });

  it("accepts the legacy provider field and ignores it", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    const res = await callStream(body({ provider: "openai" }));
    expect(events(res)).toContain("token");
    expect(llmCall()!.url).toContain("googleapis"); // S1 picked the backend, not the client
  });
});

describe("SSE frames on the happy path", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
  });

  it("emits agent, then token deltas, then done with the model id", async () => {
    const res = await callStream(body());
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    const f = frames(res);
    expect(f.map((x) => x.event)).toEqual(["agent", "token", "token", "done"]);
    expect(JSON.parse(f[0].data)).toEqual({
      agent: "blend",
      label: "S1 Blend",
      reason: "Qwen + Gemini (+ Sonar for web) combined",
      emoji: "\u{1F9EC}",
      color: "#f2f2f2",
    });
    expect(JSON.parse(f[1].data)).toBe("Hel");
    expect(JSON.parse(f[2].data)).toBe("lo");
    expect(JSON.parse(f[3].data)).toBe("gemini-3.8-flash"); // done carries the model id
  });

  it("streams to the AI Studio Gemini backend with the static key", async () => {
    const res = await callStream(body());
    const call = llmCall()!;
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(call.headers.Authorization).toBe("Bearer g");
    expect(call.body.model).toBe("gemini-3.8-flash");
    expect(call.body.stream).toBe(true);
    expect(call.body.max_tokens).toBe(4096);
    expect(res.ended).toBe(true);
  });

  it("keeps the persona in the system prompt and the caller messages after it", async () => {
    await callStream(body());
    const call = llmCall()!;
    const messages = call.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("You are Sutaeru");
    expect(messages[0].content).toContain("You are speaking with Ada");
    expect(messages[1]).toEqual({ role: "user", content: "hello there" });
  });

  it("persists the user message and the assistant answer, attributed to the user", async () => {
    const sessionId = "session-abc";
    await callStream(body({ sessionId }));
    const roles = db.inserts.map((i) => i.values.role);
    expect(roles).toEqual(["user", "assistant"]);
    for (const insert of db.inserts) {
      expect(insert.table).toBe("chatMessages");
      expect(insert.values.sessionId).toBe(sessionId);
      // Unattributed rows are invisible to the session ownership check in GET /api/chat/history.
      expect(insert.values.userId).toBe(7);
    }
    expect(db.inserts[1].values.content).toBe("Hello");
    // Legacy rows are not attributed to a model the way the kemma path does it.
    expect(db.inserts[1].values.model).toBeUndefined();
  });

  it("creates no chat_sessions row, so the history endpoint cannot read the transcript back", async () => {
    await callStream(body({ sessionId: "brand-new-session" }));
    expect(db.inserts.map((i) => i.table)).toEqual(["chatMessages", "chatMessages"]);

    const routes = register();
    const res = fakeRes();
    await routes.get("GET /api/chat/history")!({ query: { sessionId: "brand-new-session" }, headers: {} }, res);
    expect(res.statusCode).toBe(404); // the session was never registered as owned
    expect(res.json).toEqual({ error: "Not found" });
  });

  it("mirrors the finished answer to OpenClaw/Telegram", async () => {
    await callStream(body());
    expect(openclaw.sent).toEqual([
      { event: "message", payload: { channel: "telegram", text: "Hello" } },
    ]);
  });
});

describe("vertex backend on the legacy route (GEMINI_BACKEND=vertex)", () => {
  beforeEach(() => {
    process.env.GEMINI_BACKEND = "vertex";
  });
  it("exchanges the service account for a bearer and posts to the vertex openai URL", async () => {
    process.env.VERTEX_PROJECT = "env-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    const res = await callStream(body());
    const call = llmCall()!;
    expect(call.url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/endpoints/openapi/chat/completions",
    );
    expect(call.headers.Authorization).toBe("Bearer fake-access-token");
    expect(call.body.model).toBe("google/gemini-3.8-flash");
    expect(events(res)).toContain("token");
  });

  it("emits a generic auth error without the credential path when the token exchange fails", async () => {
    process.env.VERTEX_PROJECT = "env-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    auth.vertexThrows = true;
    const res = await callStream(body());
    const f = frames(res);
    expect(f.map((x) => x.event)).toEqual(["agent", "error"]);
    const data = JSON.parse(f[1].data) as string;
    expect(data).toContain("Vertex AI authentication failed");
    expect(data).not.toContain("/tmp/private/service-account.json");
    expect(llmCall()).toBeNull();
    expect(res.ended).toBe(true);
  });

  it("refuses to send an empty bearer when the token exchange yields no token", async () => {
    process.env.VERTEX_PROJECT = "env-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    auth.vertexToken = undefined;
    const res = await callStream(body());
    expect(events(res)).toEqual(["agent", "error"]);
    expect(llmCall()).toBeNull();
  });
});

describe("error and blank-response handling", () => {
  it("emits an error frame when no provider is configured, after the SSE stream started", async () => {
    const res = await callStream(body());
    const f = frames(res);
    expect(f.map((x) => x.event)).toEqual(["agent", "error"]);
    expect(JSON.parse(f[1].data)).toMatch(/No LLM provider configured/);
    expect(res.statusCode).toBe(200); // the status line was already sent as text/event-stream
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
  });

  it("forwards the upstream error body verbatim and persists nothing when the call fails", async () => {
    process.env.GEMINI_API_KEY = "g";
    llmResponder = () => new Response("SECRET-UPSTREAM-DETAIL", { status: 401 });
    const res = await callStream(body());
    const f = frames(res);
    expect(f.map((x) => x.event)).toEqual(["agent", "error"]);
    expect(JSON.parse(f[1].data)).toBe("LLM API error (401): SECRET-UPSTREAM-DETAIL");
    expect(db.inserts).toHaveLength(0); // the user's message is dropped too
    expect(res.ended).toBe(true);
  });

  it("network failures are reported as an error frame", async () => {
    process.env.GEMINI_API_KEY = "g";
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await callStream(body());
    expect(events(res)).toEqual(["agent", "error"]);
    expect(frames(res)[1].data).toContain("Network error");
  });

  it("BLANK RESPONSE: a provider that answers 200 with plain JSON produces no token, done or error frame", async () => {
    process.env.GEMINI_API_KEY = "g";
    llmResponder = () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "Hi there" } }] }), { status: 200 });
    const res = await callStream(body());
    expect(events(res)).toEqual(["agent"]); // no token, no done, no error: the client sees a closed stream
    expect(res.ended).toBe(true);
    // The user message was stored before the read loop, the answer was never produced.
    expect(db.inserts.map((i) => i.values.role)).toEqual(["user"]);
  });

  it("BLANK RESPONSE: a stream that only carries reasoning deltas is silently dropped", async () => {
    process.env.GEMINI_API_KEY = "g";
    llmResponder = () =>
      new Response(
        'data: {"choices":[{"delta":{"reasoning_content":"thinking"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        { status: 200 },
      );
    const res = await callStream(body());
    expect(events(res)).toEqual(["agent", "done"]);
    expect(frames(res)[1].data).toBe('"gemini-3.8-flash"');
    expect(db.inserts.map((i) => i.values.role)).toEqual(["user"]);
  });

  it("NO DONE FRAME: a stream that ends without finish_reason stop never emits done", async () => {
    process.env.GEMINI_API_KEY = "g";
    llmResponder = () =>
      new Response(
        'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
        { status: 200 },
      );
    const res = await callStream(body());
    expect(events(res)).toEqual(["agent", "token"]);
    expect(db.inserts.map((i) => i.values.role)).toEqual(["user", "assistant"]);
    expect(db.inserts[1].values.content).toBe("partial");
  });

  it("a stream read error emits an error frame and still persists what arrived", async () => {
    process.env.GEMINI_API_KEY = "g";
    let pulled = 0;
    const bodyStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled++ === 0) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"He"}}]}\n\n'));
        } else {
          controller.error(new Error("socket closed"));
        }
      },
    });
    llmResponder = () => new Response(bodyStream, { status: 200 });
    const res = await callStream(body());
    const evs = events(res);
    expect(evs).toEqual(["agent", "token", "error"]);
    expect(db.inserts.map((i) => i.values.role)).toEqual(["user", "assistant"]);
    expect(db.inserts[1].values.content).toBe("He");
  });
});

describe("Google Workspace context injection", () => {
  it("appends live gmail data to the system prompt when the connection is active", async () => {
    process.env.GEMINI_API_KEY = "g";
    google.connected = true;
    google.emails = [{ isUnread: true, subject: "Invoice", from: "acct@example.com", date: "10/1", snippet: "pay up" }];
    await callStream(body({ messages: [{ role: "user", content: "any new email today" }] }));
    const system = llmCall()!.body.messages[0].content as string;
    expect(system).toContain("GOOGLE WORKSPACE INTEGRATION");
    expect(system).toContain("[LIVE GMAIL DATA]");
    expect(system).toContain("Invoice");
  });

  it("swallows Google service failures and still answers", async () => {
    process.env.GEMINI_API_KEY = "g";
    google.throws = true;
    const res = await callStream(body({ messages: [{ role: "user", content: "check my calendar" }] }));
    expect(events(res)).toContain("token");
    const system = llmCall()!.body.messages[0].content as string;
    expect(system).not.toContain("LIVE CALENDAR DATA");
  });
});

describe("GET /api/chat/history", () => {
  async function callHistory(query: Record<string, string>) {
    const routes = register();
    const res = fakeRes();
    await routes.get("GET /api/chat/history")!({ query, headers: {} }, res);
    return res;
  }

  it("401s without a session", async () => {
    auth.user = null;
    const res = await callHistory({ sessionId: "s1" });
    expect(res.statusCode).toBe(401);
  });

  it("returns an empty array when no sessionId is supplied or the db is unavailable", async () => {
    expect(await callHistory({})).toMatchObject({ json: [] });
    db.available = false;
    expect(await callHistory({ sessionId: "s1" })).toMatchObject({ json: [] });
  });

  it("404s for a session with no chat_sessions row, and returns the transcript when one exists", async () => {
    const routes = register();
    const missing = fakeRes();
    await routes.get("GET /api/chat/history")!({ query: { sessionId: "other" }, headers: {} }, missing);
    expect(missing.statusCode).toBe(404);
    expect(missing.json).toEqual({ error: "Not found" });

    db.sessions.add("s1");
    db.history = [{ id: "m1", role: "user", content: "hi" }];
    const found = fakeRes();
    await routes.get("GET /api/chat/history")!({ query: { sessionId: "s1" }, headers: {} }, found);
    expect(found.json).toEqual([{ id: "m1", role: "user", content: "hi" }]);
  });

  it("swallows a database error into an empty transcript", async () => {
    db.sessions.add("s1");
    db.queryThrows = true;
    const res = await callHistory({ sessionId: "s1" });
    expect(res.statusCode).toBe(200);
    expect(res.json).toEqual([]);
  });
});
