import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit tests for server/kemma/executors/webSearch.ts: the sonar endpoint and key it uses, the
// KEMMA_SEARCH_RPM throttle, the 429 backoff, and the error shapes.

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

const PERPLEXITY = "https://api.perplexity.ai/chat/completions";

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT",
  "KEMMA_MODEL_SEARCH", "SONAR_API_KEY", "PERPLEXITY_API_KEY", "SONAR_PERPLEXITY",
  "KEMMA_SEARCH_RPM", "LITELLM_BASE_URL", "LITELLM_API_KEY", "KOBOILLM_API_KEY", "QWEN_API_KEY",
];

const saved = new Map<string, string | undefined>();
let fetchMock: ReturnType<typeof vi.fn>;
let responses: Array<() => Response> = [];

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  fsState.readable = true;
  authState.token = "fake-access-token";
  responses = [];
  fetchMock = vi.fn(async (_url: string, _init: any) => {
    const next = responses.shift();
    return next ? next() : new Response(JSON.stringify({ choices: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  process.env.SONAR_API_KEY = "s";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

const load = async () => import("./webSearch");

const ok = (payload: unknown) => () => new Response(JSON.stringify(payload), { status: 200 });
const status = (code: number, body = "") => () => new Response(body, { status: code });

const answer = {
  id: "x",
  model: "sonar-pro",
  object: "chat.completion",
  created: 1,
  choices: [{ index: 0, message: { role: "assistant", content: "Sonic was 2023." }, finish_reason: "stop" }],
  search_results: [{ title: "Sonic the Hedgehog", url: "https://wiki.example/sonic", snippet: "Film article", date: "2023" }],
  citations: [{ url: "https://wiki.example/sonic" }, "https://news.example/sonic-review"],
};

describe("request shape", () => {
  it("posts the search slot model to the Perplexity endpoint with the sonar key", async () => {
    process.env.PERPLEXITY_API_KEY = "p"; // must not win over SONAR_API_KEY
    responses = [ok(answer)];
    const { webSearch } = await load();
    await webSearch("  sonic movie  ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe(PERPLEXITY);
    expect(init.headers.Authorization).toBe("Bearer s");
    expect(JSON.parse(init.body)).toEqual({
      model: "sonar-pro",
      messages: [{ role: "user", content: "sonic movie" }],
    });
  });

  it("falls back to PERPLEXITY_API_KEY and then to a configuration error", async () => {
    delete process.env.SONAR_API_KEY;
    process.env.PERPLEXITY_API_KEY = "p";
    responses = [ok(answer)];
    const { webSearch } = await load();
    await webSearch("q");
    expect((fetchMock.mock.calls[0] as [string, any])[1].headers.Authorization).toBe("Bearer p");

    delete process.env.PERPLEXITY_API_KEY;
    const { webSearch: ws2, PerplexityConfigError } = await load();
    await expect(ws2("q")).rejects.toThrow(PerplexityConfigError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the config check happens before any call
  });

  it("rejects an empty query before touching the rate limiter", async () => {
    const { webSearch } = await load();
    await expect(webSearch("")).rejects.toThrow(/cannot be empty/);
    await expect(webSearch("   ")).rejects.toThrow(/cannot be empty/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors KEMMA_MODEL_SEARCH, including a gateway prefix that moves it off Perplexity", async () => {
    process.env.LITELLM_API_KEY = "gw";
    process.env.KEMMA_MODEL_SEARCH = "sonar";
    responses = [ok(answer)];
    const { webSearch } = await load();
    await webSearch("q");
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, any])[1].body).model).toBe("sonar");

    vi.resetModules();
    process.env.KEMMA_MODEL_SEARCH = "litellm/my-search-model";
    responses = [ok(answer)];
    const second = await load();
    await second.webSearch("q");
    const [url] = fetchMock.mock.calls.at(-1) as [string, any];
    expect(url).toBe("https://api.koboillm.com/v1/chat/completions");
  });

  it("in vertex mode a Gemini search slot goes to the Vertex OpenAI endpoint", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    process.env.VERTEX_PROJECT = "env-project";
    process.env.KEMMA_MODEL_SEARCH = "gemini-3.8-flash";
    responses = [ok(answer)];
    const { webSearch } = await load();
    await webSearch("q");
    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/env-project/locations/global/endpoints/openapi/chat/completions",
    );
    expect(init.headers.Authorization).toBe("Bearer fake-access-token");
    expect(JSON.parse(init.body).model).toBe("google/gemini-3.8-flash");
  });
});

describe("results parsing", () => {
  it("merges search_results and citations, dedupes URLs and pins the answer to the first hit", async () => {
    responses = [ok(answer)];
    const { webSearch } = await load();
    const results = await webSearch("sonic movie");
    expect(results.map((r) => r.url)).toEqual(["https://wiki.example/sonic", "https://news.example/sonic-review"]);
    expect(results[0].title).toBe("Sonic the Hedgehog");
    expect(results[0].snippet).toContain("SEARCH ANSWER");
    expect(results[0].snippet).toContain("Sonic was 2023.");
    expect(results[1]).toEqual({
      title: "Sonic Review",
      url: "https://news.example/sonic-review",
      snippet: "",
    });
  });

  it("returns a sourceless content result when the model answered without citations", async () => {
    responses = [
      ok({
        id: "x",
        model: "sonar-pro",
        object: "chat.completion",
        created: 1,
        choices: [{ index: 0, message: { role: "assistant", content: "no sources here" }, finish_reason: "stop" }],
      }),
    ];
    const { webSearch } = await load();
    expect(await webSearch("q")).toEqual([
      { title: "Search Result", url: "", snippet: "no sources here" },
    ]);
  });

  it("a response without choices is an API error", async () => {
    responses = [ok({ id: "x", choices: null })];
    const { webSearch, PerplexityAPIError } = await load();
    await expect(webSearch("q")).rejects.toThrow(PerplexityAPIError);
  });

  it("an empty answer with no sources yields an empty list", async () => {
    responses = [ok({ id: "x", model: "sonar-pro", object: "chat.completion", created: 1, choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }] })];
    const { webSearch } = await load();
    expect(await webSearch("q")).toEqual([]);
  });
});

describe("error handling", () => {
  it("surfaces the provider error message and keeps the status code", async () => {
    responses = [status(400, JSON.stringify({ error: { message: "model_deprecated", type: "invalid_request", code: "400" } }))];
    const { webSearch, PerplexityAPIError } = await load();
    const err = await webSearch("q").catch((e) => e as InstanceType<typeof PerplexityAPIError>);
    expect(err).toBeInstanceOf(PerplexityAPIError);
    expect(err.message).toBe("model_deprecated");
    expect(err.statusCode).toBe(400);
  });

  it("falls back to the raw body or the status when the error is not JSON", async () => {
    responses = [status(500, "gateway exploded")];
    const { webSearch } = await load();
    await expect(webSearch("q")).rejects.toThrow(/gateway exploded|status 500/);
  });

  it("wraps a transport failure as a connection error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const { webSearch, PerplexityAPIError } = await load();
    await expect(webSearch("q")).rejects.toThrow(PerplexityAPIError);
    await expect(webSearch("q")).rejects.toThrow(/Failed to connect to Perplexity API: ECONNREFUSED/);
  });
});

describe("429 backoff and KEMMA_SEARCH_RPM", () => {
  it("retries 429 with exponential backoff and gives up after three attempts", async () => {
    vi.useFakeTimers();
    responses = [status(429), status(429), status(429)];
    const { webSearch } = await load();
    const pending = webSearch("q");
    pending.catch(() => {}); // handled by the assertion below
    await vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000);
    await expect(pending).rejects.toThrow(/rate limit persisted after retries/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("succeeds on the attempt after a 429", async () => {
    vi.useFakeTimers();
    responses = [status(429), ok(answer)];
    const { webSearch } = await load();
    const pending = webSearch("q");
    const t = vi.advanceTimersByTimeAsync(2_000);
    const results = await pending;
    await t;
    expect(results.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("KEMMA_SEARCH_RPM=1 holds the second call until the rolling window passes", async () => {
    vi.useFakeTimers();
    process.env.KEMMA_SEARCH_RPM = "1";
    responses = [ok(answer), ok(answer)];
    const { webSearch } = await load();
    await webSearch("first");
    const pending = webSearch("second");
    let secondDone = false;
    void pending.then(() => {
      secondDone = true;
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(secondDone).toBe(false); // still inside the 60s window
    await vi.advanceTimersByTimeAsync(31_000);
    await pending;
    expect(secondDone).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("an unusable KEMMA_SEARCH_RPM falls back to the default of 40 per minute", async () => {
    process.env.KEMMA_SEARCH_RPM = "0";
    responses = Array.from({ length: 3 }, () => ok(answer));
    const { webSearch } = await load();
    await webSearch("a");
    await webSearch("b");
    await webSearch("c");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.resetModules();
    process.env.KEMMA_SEARCH_RPM = "not-a-number";
    const second = await load();
    await second.webSearch("d");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
