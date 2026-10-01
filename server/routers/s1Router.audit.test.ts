import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit tests for the S1 routing layer (server/routers/s1Router.ts).
// The blend fans the conversation out to every configured backend, then hands the caller a
// synthesis request. These tests capture the outgoing fetch calls so the base URL, model id and
// Authorization header of each contributor are checked, not just the returned plan shape.

const authState = vi.hoisted(() => ({ token: "fake-access-token" as string | undefined }));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: authState.token }) };
    }
    async getProjectId() {
      return "adc-project-123";
    }
  },
}));

const fsState = vi.hoisted(() => ({ readable: true }));

vi.mock("node:fs", () => ({
  accessSync: vi.fn(() => {
    if (!fsState.readable) throw new Error("ENOENT");
  }),
  constants: { R_OK: 4 },
}));

const AI_STUDIO = "https://generativelanguage.googleapis.com/v1beta/openai";
const VERTEX_GLOBAL = "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/endpoints/openapi";
const QWEN_URL = "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1";
const PERPLEXITY = "https://api.perplexity.ai";

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "GOOGLE_CLOUD_PROJECT", "GEMINI_API_KEY", "GEMINI", "QWEN_API_KEY", "SONAR_API_KEY",
  "SONAR_PERPLEXITY", "PERPLEXITY_API_KEY", "KEMMA_MODEL_CHAT", "KEMMA_MODEL_VISION",
  "KEMMA_MODEL_PRO", "KEMMA_MODEL_PRO_FALLBACK", "KEMMA_MODEL_LONG_DOC", "KEMMA_MODEL_SEARCH",
];

const saved = new Map<string, string | undefined>();

type Recorded = { url: string; headers: Record<string, string>; body: any };
let calls: Recorded[] = [];
let failFor: (url: string, model: string) => boolean = () => false;

function stubFetch() {
  calls = [];
  failFor = () => false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url, headers: init.headers, body });
      if (failFor(url, body.model)) return new Response("upstream rejected", { status: 500 });
      const who = url.includes("perplexity")
        ? "sonar"
        : url.includes("googleapis")
          ? "gemini"
          : "qwen";
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: `draft-from-${who}:${body.model}` } }],
          ...(who === "sonar" ? { citations: ["https://a.example"] } : {}),
        }),
        { status: 200 },
      );
    }),
  );
}

const byUrlPart = (part: string) => calls.filter((c) => c.url.includes(part));

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  authState.token = "fake-access-token";
  fsState.readable = true;
  stubFetch();
  vi.spyOn(console, "warn").mockImplementation(() => {});
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

const load = async () => import("./s1Router");

const msgs = [
  { role: "system", content: "SYS" },
  { role: "user", content: "explain recursion" },
];

describe("agent config resolution", () => {
  it("the gemini member sends a model the Gemini backend serves, not the raw chat slot id", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    const { s1Blend } = await load();
    await s1Blend("explain recursion", msgs);

    const geminiCall = byUrlPart("googleapis")[0];
    expect(geminiCall).toBeDefined();
    // The repo default chat slot is a Qwen id; sending it to Gemini 404s, so S1 must not do that.
    expect(geminiCall.body.model).not.toBe("qwen3.8-max");
    expect(geminiCall.body.model).toBe("gemini-3.8-flash"); // the vision slot is the gemini fallback
    const qwenCall = byUrlPart(QWEN_URL)[0];
    expect(qwenCall.body.model).toBe("qwen3.8-max"); // the long-doc (qwen) slot
  });

  it("uses the chat slot for gemini when the chat slot is a gemini model, and the pro slot in max mode", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    process.env.KEMMA_MODEL_CHAT = "gemini-3.8-flash";
    process.env.KEMMA_MODEL_PRO = "gemini-3.1-pro-preview";
    const { s1Blend } = await load();

    await s1Blend("explain recursion", msgs);
    expect(byUrlPart("googleapis")[0].body.model).toBe("gemini-3.8-flash");

    calls = [];
    await s1Blend("explain recursion", msgs, { max: true });
    expect(byUrlPart("googleapis")[0].body.model).toBe("gemini-3.1-pro-preview");
  });

  it("the qwen member follows KEMMA_MODEL_LONG_DOC, and sonar follows the web question and max flag", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    process.env.SONAR_API_KEY = "s";
    process.env.KEMMA_MODEL_LONG_DOC = "qwen-doc-extended";
    const { s1Blend } = await load();

    await s1Blend("what is the latest news today", msgs);
    expect(byUrlPart(QWEN_URL)[0].body.model).toBe("qwen-doc-extended");
    expect(byUrlPart(PERPLEXITY)[0].body.model).toBe("sonar");
    expect(byUrlPart(PERPLEXITY)[0].headers.Authorization).toBe("Bearer s");

    calls = [];
    await s1Blend("what is the latest news today", msgs, { max: true });
    expect(byUrlPart(PERPLEXITY)[0].body.model).toBe("sonar-pro");
  });

  it("slot env changes made after the module was imported still take effect", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    const m = await load(); // imported with the stock defaults
    process.env.KEMMA_MODEL_LONG_DOC = "qwen-late";
    await m.s1Blend("hi", [{ role: "user", content: "hi" }]);
    expect(byUrlPart(QWEN_URL)[0].body.model).toBe("qwen-late");
  });

  it("sonar is only a contributor for web-shaped questions", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    process.env.SONAR_API_KEY = "s";
    const { s1Blend } = await load();
    await s1Blend("explain recursion", msgs);
    expect(byUrlPart(PERPLEXITY)).toHaveLength(0);
    const plan = await s1Blend("what are the stock prices now", msgs);
    expect(byUrlPart(PERPLEXITY)).toHaveLength(1);
    expect(plan.contributors).toContain("sonar");
  });
});

describe("agent config backends", () => {
  it("the AI Studio branch uses GEMINI_API_KEY as the bearer", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    const { s1Blend } = await load();
    await s1Blend("hi", [{ role: "user", content: "hi" }]);
    expect(byUrlPart("googleapis")[0].url).toBe(`${AI_STUDIO}/chat/completions`);
    expect(byUrlPart("googleapis")[0].headers.Authorization).toBe("Bearer g");
  });

  it("the vertex branch builds the vertex URL, a google/ prefixed model and a service-account bearer", async () => {
    process.env.VERTEX_PROJECT = "env-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    process.env.QWEN_API_KEY = "q";
    const { s1Blend } = await load();
    await s1Blend("hi", [{ role: "user", content: "hi" }]);

    const call = byUrlPart("aiplatform")[0];
    expect(call.url).toBe(`${VERTEX_GLOBAL}/chat/completions`);
    expect(call.body.model).toMatch(/^google\//);
    expect(call.body.model).toBe("google/gemini-3.8-flash");
    expect(call.headers.Authorization).toBe("Bearer fake-access-token");
    expect(call.headers.Authorization).not.toBe("Bearer ");
  });

  it("the vertex branch is chosen from VERTEX_PROJECT + credentials, whatever GEMINI_BACKEND says", async () => {
    // Documents a divergence from kemmaRouter: GEMINI_BACKEND is not consulted here, so the
    // legacy blend can talk to Vertex while the agent engine talks to AI Studio.
    process.env.GEMINI_BACKEND = "aistudio";
    process.env.GEMINI_API_KEY = "g";
    process.env.VERTEX_PROJECT = "env-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    process.env.QWEN_API_KEY = "q";
    const { s1Blend } = await load();
    await s1Blend("hi", [{ role: "user", content: "hi" }]);
    expect(byUrlPart("aiplatform")).toHaveLength(1);
    expect(byUrlPart(AI_STUDIO)).toHaveLength(0);
  });

  it("VERTEX_LOCATION moves the vertex member to the regional host", async () => {
    process.env.VERTEX_PROJECT = "env-project";
    process.env.VERTEX_LOCATION = "eu-west1";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    process.env.QWEN_API_KEY = "q";
    const { s1Blend } = await load();
    await s1Blend("hi", [{ role: "user", content: "hi" }]);
    expect(byUrlPart("aiplatform")[0].url).toBe(
      "https://eu-west1-aiplatform.googleapis.com/v1/projects/env-project/locations/eu-west1/endpoints/openapi/chat/completions",
    );
  });

  it("resolveBearer returns the static key for non-vertex configs and throws instead of an empty token", async () => {
    process.env.GEMINI_API_KEY = "g";
    const { resolveBearer } = await load();
    expect(
      await resolveBearer({ baseUrl: AI_STUDIO, model: "gemini-3.8-flash", apiKey: "g" }),
    ).toBe("g");

    authState.token = undefined;
    await expect(
      resolveBearer({
        baseUrl: VERTEX_GLOBAL,
        model: "google/gemini-3.8-flash",
        apiKey: "",
        vertexProject: "env-project",
      }),
    ).rejects.toThrow(/no access token/i);
  });

  it("a vertex token that cannot be resolved drops the draft instead of calling with an empty bearer", async () => {
    process.env.VERTEX_PROJECT = "env-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    process.env.QWEN_API_KEY = "q";
    authState.token = undefined;
    const { s1Blend } = await load();
    const plan = await s1Blend("hi", [{ role: "user", content: "hi" }]);
    const vertexCalls = byUrlPart("aiplatform");
    expect(vertexCalls).toHaveLength(0);
    expect(calls.every((c) => c.headers.Authorization !== "Bearer ")).toBe(true);
    expect(plan.contributors).toEqual(["qwen"]);
  });

  it("a member is dropped when its provider has no key, and no contributors at all is an error", async () => {
    process.env.QWEN_API_KEY = "q";
    const { s1Blend } = await load();
    const plan = await s1Blend("hi", [{ role: "user", content: "hi" }]);
    expect(plan.contributors).toEqual(["qwen"]);
    expect(byUrlPart("googleapis")).toHaveLength(0);
  });

  it("throws with the configuration hint when no provider is configured", async () => {
    const { s1Blend } = await load();
    await expect(s1Blend("hi", [{ role: "user", content: "hi" }])).rejects.toThrow(/No LLM provider/);
  });
});

describe("blend fan-out and synthesis plan", () => {
  it("fans out to every member in parallel and blends the drafts into the system prompt", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    const { s1Blend } = await load();
    const plan = await s1Blend("explain recursion", msgs, { draftMaxTokens: 700 });

    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.body.stream).toBe(false);
      expect(c.body.max_tokens).toBe(700);
      expect(c.body.messages).toEqual(msgs);
    }
    expect(plan.contributors.slice().sort()).toEqual(["gemini", "qwen"]);
    expect(plan.info.agent).toBe("blend");
    expect(plan.config.baseUrl).toContain("googleapis"); // synthesis prefers Gemini
    expect(plan.messages).not.toBe(msgs);
    expect(msgs[0].content).toBe("SYS"); // the caller's array is not mutated
    expect(plan.messages[0].role).toBe("system");
    expect(plan.messages[0].content.startsWith("SYS")).toBe(true);
    expect(plan.messages[0].content).toContain("INTERNAL DRAFTS");
    expect(plan.messages[0].content).toContain("draft-from-gemini");
    expect(plan.messages[0].content).toContain("draft-from-qwen:qwen3.8-max");
    expect(plan.messages[1]).toEqual({ role: "user", content: "explain recursion" });
  });

  it("appends sonar citations to the sonar draft before blending", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    process.env.SONAR_API_KEY = "s";
    const { s1Blend } = await load();
    const plan = await s1Blend("latest news today", msgs);
    expect(plan.messages[0].content).toContain("[1] https://a.example");
    expect(plan.contributors.slice().sort()).toEqual(["gemini", "qwen", "sonar"]);
  });

  it("with one contributor failing, the client gets the surviving draft alone and no error", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    failFor = (url) => url.includes("googleapis");
    const { s1Blend } = await load();
    const plan = await s1Blend("explain recursion", msgs);
    expect(plan.contributors).toEqual(["qwen"]);
    expect(plan.messages).toEqual(msgs); // no blend note
    expect(plan.config.baseUrl).toBe(QWEN_URL); // the caller streams from the backend that answered
    const warnings = vi.mocked(console.warn).mock.calls.flat().map(String).join(" ");
    expect(warnings).toContain("gemini draft failed: 500");
  });

  it("with the preferred synthesis backend failing, blending still uses a backend that answered", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    process.env.SONAR_API_KEY = "s";
    failFor = (url) => url.includes("googleapis");
    const { s1Blend } = await load();
    const plan = await s1Blend("latest news today", msgs);
    expect(plan.contributors.slice().sort()).toEqual(["qwen", "sonar"]);
    expect(plan.config.baseUrl).not.toContain("googleapis");
    expect(plan.messages[0].content).toContain("INTERNAL DRAFTS");
  });

  it("when every draft fails the plan falls back to the default backend with no contributors", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    failFor = () => true;
    const { s1Blend } = await load();
    const plan = await s1Blend("explain recursion", msgs);
    expect(plan.contributors).toEqual([]);
    expect(plan.messages).toEqual(msgs);
    expect(plan.config.baseUrl).toContain("googleapis");
  });

  it("a single configured provider answers alone without any draft call", async () => {
    process.env.GEMINI_API_KEY = "g";
    const { s1Blend } = await load();
    const plan = await s1Blend("explain recursion", msgs);
    expect(calls).toHaveLength(0);
    expect(plan.contributors).toEqual(["gemini"]);
    expect(plan.messages).toEqual(msgs);
  });

  it("a system message is synthesised when the conversation has none", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.QWEN_API_KEY = "q";
    const { s1Blend } = await load();
    const plan = await s1Blend("hi", [{ role: "user", content: "hi" }]);
    expect(plan.messages[0].role).toBe("system");
    expect(plan.messages[0].content).toContain("INTERNAL DRAFTS");
  });
});

describe("persona and prompt builders", () => {
  it("buildS1SystemPrompt hides the underlying models and carries the persona and identity context", async () => {
    const { buildS1SystemPrompt, S1_BLEND_INFO } = await load();
    const prompt = buildS1SystemPrompt(S1_BLEND_INFO, "USER CONTEXT TEXT", "narrator");
    expect(prompt).toContain("You are S1");
    expect(prompt).toContain("The Narrator");
    expect(prompt).toContain("Never reference, hint at, or acknowledge any underlying model");
    expect(prompt).toContain("USER CONTEXT TEXT");
    expect(prompt).toContain(new Date().toDateString());
  });

  it("detectGoogleIntent classifies gmail, calendar, drive and nothing else", async () => {
    const { detectGoogleIntent } = await load();
    expect(detectGoogleIntent("read my inbox")).toBe("gmail");
    expect(detectGoogleIntent("what is on my calendar today")).toBe("calendar");
    expect(detectGoogleIntent("find a file in google drive")).toBe("drive");
    expect(detectGoogleIntent("explain recursion")).toBeNull();
  });

  it("buildGoogleToolPrompt lists only the detected capability", async () => {
    const { buildGoogleToolPrompt } = await load();
    const gmail = buildGoogleToolPrompt("gmail");
    expect(gmail).toContain("GMAIL");
    expect(gmail).not.toContain("CALENDAR");
    expect(buildGoogleToolPrompt(null)).toContain("DRIVE");
  });
});
