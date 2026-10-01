import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit tests for server/llmProvider.ts (document generation LLM helper).

const authState = vi.hoisted(() => ({ token: "fake-access-token" }));

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

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "QWEN_BASE_URL", "QWEN_API_KEY", "GEMINI_API_KEY", "KEMMA_MODEL_CHAT", "KEMMA_MODEL_VISION",
  "KEMMA_MODEL_FALLBACK", "LITELLM_API_KEY",
];

const saved = new Map<string, string | undefined>();
let fetchMock: ReturnType<typeof vi.fn>;
let reply: () => Response;

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  fsState.readable = true;
  authState.token = "fake-access-token";
  reply = () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '```json\n{"title":"T","sections":[{"heading":"H","body":"B"}],"summary":"S"}\n```',
            },
          },
        ],
      }),
      { status: 200 },
    );
  fetchMock = vi.fn(async (_url: string, _init: any) => reply());
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
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

const load = async () => import("./llmProvider");

const call = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, any];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body) };
};

describe("route selection", () => {
  it("prefers the chat slot and posts non-streaming to its own endpoint", async () => {
    process.env.QWEN_API_KEY = "q";
    process.env.GEMINI_API_KEY = "g";
    const { generateDocumentContent } = await load();
    const doc = await generateDocumentContent("quarterly report", "memo", "Elegant");
    expect(doc.title).toBe("T");
    const c = call();
    expect(c.url).toBe("https://token-plan.maas.qwencloudapi.com/compatible-mode/v1/chat/completions");
    expect(c.headers.Authorization).toBe("Bearer q");
    expect(c.body).toMatchObject({ model: "qwen3.8-max", stream: false, max_tokens: 4096 });
    expect(c.body.messages[1].content).toContain("memo");
    expect(c.body.messages[1].content).toContain("Elegant style");
  });

  it("walks the fallback chain to the vision slot when the chat slot has no key", async () => {
    process.env.GEMINI_API_KEY = "g"; // no QWEN_API_KEY
    const { generateDocumentContent } = await load();
    await generateDocumentContent("p");
    const c = call();
    expect(c.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(c.headers.Authorization).toBe("Bearer g");
    expect(c.body.model).toBe("gemini-3.8-flash");
  });

  it("uses resolveRouteAuth for a vertex route: vertex URL, google/ model and a real bearer", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    process.env.VERTEX_PROJECT = "env-project";
    process.env.KEMMA_MODEL_CHAT = "gemini-3.8-flash";
    const { generateDocumentContent } = await load();
    await generateDocumentContent("p");
    const c = call();
    expect(c.url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/endpoints/openapi/chat/completions",
    );
    expect(c.body.model).toBe("google/gemini-3.8-flash");
    expect(c.headers.Authorization).toBe("Bearer fake-access-token");
    expect(c.headers.Authorization).not.toBe("Bearer ");
  });

  it("throws nothing outward when no provider is configured: it returns a filler document", async () => {
    const { generateDocumentContent, generateStyleOptions } = await load();
    const doc = await generateDocumentContent("the real prompt");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(doc.title).toBe("Document: the real prompt");
    expect(doc.sections[1].body).toContain("Please expand");
    // The style list is the same silent-fallback shape the UI receives.
    const styles = await generateStyleOptions("p");
    expect(styles.map((s) => s.label)).toEqual(["Professional", "Creative", "Elegant"]);
  });

  it("a malformed model answer degrades to the filler document instead of surfacing the error", async () => {
    process.env.QWEN_API_KEY = "q";
    reply = () => new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 });
    const { generateDocumentContent } = await load();
    const doc = await generateDocumentContent("p");
    expect(doc.sections[0].heading).toBe("Overview");
  });

  it("an upstream error status is swallowed into the same filler document", async () => {
    process.env.QWEN_API_KEY = "q";
    reply = () => new Response("provider exploded", { status: 503 });
    const { generateStyleOptions } = await load();
    const styles = await generateStyleOptions("p");
    expect(styles).toHaveLength(3);
    expect(styles[0].label).toBe("Professional");
  });
});
