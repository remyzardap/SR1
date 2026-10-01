import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit tests for the two legacy _core media helpers. Neither is imported by any route in this
// worktree (image generation goes through server/lib/fnImage.ts, voice through fnVoice.ts), so
// these tests pin the behaviour in case they are ever wired up again.

const state = vi.hoisted(() => ({ calls: [] as any[], parts: [] as any[] }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(opts: unknown) {
      state.calls.push({ kind: "client", opts });
    }
    models = {
      generateContent: async (req: unknown) => {
        state.calls.push({ kind: "generate", req });
        return { candidates: [{ content: { parts: state.parts } }] };
      },
    };
  },
}));

const ENV_NAMES = [
  "VERTEX_PROJECT", "VERTEX_LOCATION", "GEMINI_BACKEND", "GEMINI_API_KEY",
  "KEMMA_MODEL_IMAGE", "BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
];

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  state.calls = [];
  state.parts = [];
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

describe("_core/imageGeneration", () => {
  it("requires both VERTEX_PROJECT and VERTEX_LOCATION, whatever the gemini backend is", async () => {
    const { generateImage } = await import("./imageGeneration");
    await expect(generateImage({ prompt: "a cat" })).rejects.toThrow(
      /VERTEX_PROJECT and VERTEX_LOCATION must be set/,
    );

    process.env.VERTEX_PROJECT = "env-project"; // location unset: vertexAuth defaults to global, this does not
    await expect(generateImage({ prompt: "a cat" })).rejects.toThrow(/must be set/);
    expect(state.calls).toHaveLength(0);
  });

  it("builds a Vertex client and ignores the image slot default used by the router", async () => {
    process.env.VERTEX_PROJECT = "env-project";
    process.env.VERTEX_LOCATION = "us-central1";
    state.parts = [{ inlineData: { data: Buffer.from("pngbytes").toString("base64"), mimeType: "image/webp" } }];
    const { generateImage } = await import("./imageGeneration");
    const out = await generateImage({ prompt: "a cat" });
    expect(out.mimeType).toBe("image/webp");
    expect(out.buffer.toString()).toBe("pngbytes");

    const client = state.calls.find((c) => c.kind === "client");
    expect(client.opts).toEqual({ vertexai: true, project: "env-project", location: "us-central1" });
    const gen = state.calls.find((c) => c.kind === "generate");
    expect(gen.req.model).toBe("gemini-2.0-flash-001"); // NOT the router's imageRoute() default
    const router = await import("../core/kemmaRouter");
    expect(router.imageRoute().model).toBe("gemini-3.1-flash-image");

    process.env.KEMMA_MODEL_IMAGE = "gemini-3.1-flash-image-preview";
    state.calls = [];
    await generateImage({ prompt: "a dog" });
    expect(state.calls.find((c) => c.kind === "generate").req.model).toBe("gemini-3.1-flash-image-preview");
  });

  it("errors when the model returns no inline image and wraps provider failures", async () => {
    process.env.VERTEX_PROJECT = "env-project";
    process.env.VERTEX_LOCATION = "global";
    const { generateImage } = await import("./imageGeneration");
    state.parts = [{ text: "sorry, I cannot draw that" }];
    await expect(generateImage({ prompt: "a cat" })).rejects.toThrow(/returned no image data/);

    // A provider failure is rethrown as a generic wrapper that keeps the SDK message.
    state.parts = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    await expect(generateImage({ prompt: "a cat" })).rejects.toThrow(/image generation failed/);
  });
});

describe("_core/voiceTranscription", () => {
  const audioResponse = () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "audio/webm" },
    });

  it("returns structured service errors instead of throwing when the forge service is unset", async () => {
    const { transcribeAudio } = await import("./voiceTranscription");
    expect(await transcribeAudio({ audioUrl: "https://x/a.webm" })).toEqual({
      error: "Voice transcription service is not configured",
      code: "SERVICE_ERROR",
      details: "BUILT_IN_FORGE_API_URL is not set",
    });

    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example.com";
    expect(await transcribeAudio({ audioUrl: "https://x/a.webm" })).toEqual({
      error: "Voice transcription service authentication is missing",
      code: "SERVICE_ERROR",
      details: "BUILT_IN_FORGE_API_KEY is not set",
    });
  });

  it("downloads the audio and posts multipart whisper with the forge key", async () => {
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example.com";
    process.env.BUILT_IN_FORGE_API_KEY = "forge-key";
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      if (String(url) === "https://x/a.webm") return audioResponse();
      return new Response(
        JSON.stringify({ task: "transcribe", language: "en", duration: 2, text: "hello", segments: [] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeAudio } = await import("./voiceTranscription");
    const out = await transcribeAudio({ audioUrl: "https://x/a.webm", language: "en" });
    expect(out).toMatchObject({ text: "hello", language: "en" });

    const post = fetchMock.mock.calls.find(([, init]) => (init as any)?.method === "POST");
    expect(post?.[0]).toBe("https://forge.example.com/v1/audio/transcriptions");
    expect((post?.[1] as any).headers.authorization).toBe("Bearer forge-key");
    const form = (post?.[1] as any).body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(String(form.get("prompt"))).toContain("working language is English");
  });

  it("rejects oversized audio, download failures, provider failures and bad payloads", async () => {
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example.com/";
    process.env.BUILT_IN_FORGE_API_KEY = "forge-key";

    let postResponse = () =>
      new Response(JSON.stringify({ task: "transcribe", language: "en", duration: 1, text: "hi", segments: [] }), {
        status: 200,
      });
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      if ((init as any)?.method === "POST") return postResponse();
      if (String(url).startsWith("https://big")) return new Response(new Uint8Array(17 * 1024 * 1024), { status: 200 });
      if (String(url).startsWith("https://bad")) return new Response("nope", { status: 404, statusText: "Not Found" });
      return new Response("data", { status: 200, headers: { "content-type": "audio/webm" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeAudio } = await import("./voiceTranscription");

    expect(await transcribeAudio({ audioUrl: "https://ok/a" })).toMatchObject({ text: "hi" });
    expect(await transcribeAudio({ audioUrl: "https://big/a" })).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(await transcribeAudio({ audioUrl: "https://bad/a" })).toMatchObject({ code: "INVALID_FORMAT" });

    postResponse = () => new Response("quota exceeded", { status: 429, statusText: "Too Many Requests" });
    expect(await transcribeAudio({ audioUrl: "https://ok/a" })).toMatchObject({
      code: "TRANSCRIPTION_FAILED",
      details: expect.stringContaining("429"),
    });

    postResponse = () => new Response(JSON.stringify({ text: 42 }), { status: 200 });
    expect(await transcribeAudio({ audioUrl: "https://ok/a" })).toMatchObject({ code: "SERVICE_ERROR" });

    // A trailing slash in the configured URL must not double up in the request path.
    const post = fetchMock.mock.calls.find(([, init]) => (init as any)?.method === "POST");
    expect(post?.[0]).toBe("https://forge.example.com/v1/audio/transcriptions");
  });

  it("reports a transport failure while downloading as a service error", async () => {
    process.env.BUILT_IN_FORGE_API_URL = "https://forge.example.com";
    process.env.BUILT_IN_FORGE_API_KEY = "forge-key";
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ENOTFOUND");
    }));
    const { transcribeAudio } = await import("./voiceTranscription");
    expect(await transcribeAudio({ audioUrl: "https://x/a" })).toEqual({
      error: "Failed to fetch audio file",
      code: "SERVICE_ERROR",
      details: "ENOTFOUND",
    });
  });
});
