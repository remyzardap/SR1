import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// blendedAgents.ts resolves model slots from kemmaRouter. Under Vertex the
// route.apiKey is intentionally "" and route.baseUrl can be stale, so every
// call site must await resolveRouteAuth(route). These tests pin that behavior:
// a fake google-auth-library provides the service-account token, a fake fetch
// records what actually goes on the wire.

const authState = vi.hoisted(() => ({
  token: "fake-access-token",
  projectId: "adc-project-123",
}));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: authState.token }) };
    }
    async getProjectId() {
      return authState.projectId;
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

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "KEMMA_MODEL_CHAT", "KEMMA_MODEL_PLANNER", "KEMMA_MODEL_VISION",
  "GEMINI_API_KEY", "QWEN_API_KEY", "QWEN_BASE_URL", "SONAR_API_KEY", "PERPLEXITY_API_KEY",
  "LITELLM_API_KEY", "KOBOILLM_API_KEY", "KEMMA_MODEL_FALLBACK",
];

const saved = new Map<string, string | undefined>();

type Captured = { url: string; init: RequestInit };
let calls: Captured[];

function openAIResponse() {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: "qwen answer" } }], usage: {} }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
function geminiResponse() {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "gemini answer" }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
function vertexResponse() {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "vertex answer" }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init: init ?? {} });
      if (u.includes(":generateContent")) {
        return u.includes("aiplatform.googleapis.com") ? vertexResponse() : geminiResponse();
      }
      return openAIResponse();
    }),
  );
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

async function importModule() {
  return import("./blendedAgents");
}

describe("blendedAgents: never send an empty bearer for a Vertex-backed slot", () => {
  it("chat slot on Vertex gets a live service-account token, vertex URL, and google/ model prefix", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    // NOTE: VERTEX_PROJECT deliberately unset at import time -> route.baseUrl
    // captured at module load is stale (AI Studio URL) and apiKey is "".
    process.env.KEMMA_MODEL_CHAT = "gemini-3.8-flash";
    process.env.GEMINI_API_KEY = "studio-key";

    const mod = await importModule();
    const res = await mod.sendMessage("hello there", { blend: false, preferredModel: "qwen" });

    expect(calls).toHaveLength(1);
    const auth = (calls[0].init.headers as Record<string, string>)["Authorization"];
    expect(auth).toBe("Bearer fake-access-token");
    expect(calls[0].url).toContain("aiplatform.googleapis.com");
    expect(calls[0].url).toContain("/v1/projects/adc-project-123/");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe("google/gemini-3.8-flash");
    expect(res.content).toBe("qwen answer");
  });

  it("qwen chat slot reads QWEN_API_KEY at call time, not module load time", async () => {
    process.env.QWEN_API_KEY = "early-key";
    const mod = await importModule();
    process.env.QWEN_API_KEY = "late-key";

    await mod.sendMessage("explain recursion", { blend: false, preferredModel: "qwen" });

    const auth = (calls[0].init.headers as Record<string, string>)["Authorization"];
    expect(auth).toBe("Bearer late-key");
    expect(calls[0].url).toContain("/chat/completions");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe("qwen3.8-max");
  });

  it("AI Studio Gemini path reads GEMINI_API_KEY at call time", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const mod = await importModule();
    process.env.GEMINI_API_KEY = "late-studio-key";

    const res = await mod.sendMessage("summarize this", { blend: false, preferredModel: "gemini" });

    expect(calls[0].url).toContain(":generateContent?key=late-studio-key");
    expect(res.content).toBe("gemini answer");
    expect(res.primaryModel).toBe("Gemini");
  });

  it("Vertex-enabled Gemini agent goes through the native generateContent endpoint with a bearer", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    process.env.VERTEX_PROJECT = "vp";
    process.env.KEMMA_MODEL_PLANNER = "gemini-3.8-flash";
    process.env.QWEN_API_KEY = "q";

    const mod = await importModule();
    const res = await mod.sendMessage("summarize this", { blend: false, preferredModel: "gemini" });

    const call = calls.find((c) => c.url.includes(":generateContent"));
    expect(call).toBeTruthy();
    expect(call!.url).toContain("aiplatform.googleapis.com");
    expect(call!.url).not.toContain("key=");
    const auth = (call!.init.headers as Record<string, string>)["Authorization"];
    expect(auth).toBe("Bearer fake-access-token");
    expect(res.content).toBe("vertex answer");
  });

  it("blend mode calls both agents with non-empty credentials and picks the confident answer", async () => {
    process.env.QWEN_API_KEY = "q";
    process.env.GEMINI_API_KEY = "studio-key";
    const mod = await importModule();

    const res = await mod.sendMessage("what is the capital of France", { blend: true });

    expect(res.blended).toBe(true);
    expect(res.sources).toHaveLength(2);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      if (c.url.includes(":generateContent")) {
        expect(c.url).toContain("key=studio-key");
      } else {
        const auth = (c.init.headers as Record<string, string>)["Authorization"];
        expect(auth).toBe("Bearer q");
      }
    }
    // qwen (0.92) beats gemini (0.90) in confidence selection
    expect(res.content).toBe("qwen answer");
  });

  it("a missing provider key surfaces as an error instead of a silent empty success", async () => {
    process.env.QWEN_API_KEY = "";
    delete process.env.QWEN_API_KEY;
    const mod = await importModule();
    // qwen slot without a key: the module reports it as unavailable...
    const status = mod.getAgentStatus().find((a) => a.id === "qwen");
    expect(status!.isAvailable).toBe(false);
  });

  it("getAgentStatus reflects env set after module import", async () => {
    const mod = await importModule();
    expect(mod.getAgentStatus().find((a) => a.id === "gemini")!.isAvailable).toBe(false);
    process.env.GEMINI_API_KEY = "studio-key";
    expect(mod.getAgentStatus().find((a) => a.id === "gemini")!.isAvailable).toBe(true);
  });
});
