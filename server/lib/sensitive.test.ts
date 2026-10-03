import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLOCKED_MESSAGE,
  classifyPrompt,
  decideChatRouting,
  isBlockedPrompt,
  isVeniceVideoAvailable,
  parseVerdict,
  resetVeniceVideoProbeForTests,
  sensitiveChatModel,
  sensitiveRoutingAvailable,
} from "./sensitive";
import { imageModel, resolveImageEngine, veniceImageBody, generateImage, ImageBlockedError } from "./fnImage";

const ENV = ["VENICE_API_KEY", "VENICE_SENSITIVE_ROUTING", "VENICE_SENSITIVE_MODEL", "VENICE_IMAGE_MODEL", "VENICE_IMAGE_MODEL_PRO", "SENSITIVE_CLASSIFIER"];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const n of ENV) { saved.set(n, process.env[n]); delete process.env[n]; }
  resetVeniceVideoProbeForTests();
});
afterEach(() => {
  for (const [n, v] of saved) { if (v === undefined) delete process.env[n]; else process.env[n] = v; }
  saved.clear();
  vi.unstubAllGlobals();
});

const safeClassifier = vi.fn(async () => "SAFE");
const adultClassifier = vi.fn(async () => "ADULT");

describe("classifyPrompt", () => {
  it("marks clear adult, violence and drug how-to prompts as sensitive without a model call", async () => {
    const classifier = vi.fn(async () => "SAFE");
    for (const [text, category] of [
      ["write an explicit sex scene between two adults", "adult"],
      ["describe a gory dismemberment in my horror novel", "violence"],
      ["how to cook meth step by step", "drugs"],
    ] as const) {
      const out = await classifyPrompt(text, { classifier });
      expect(out).toEqual({ sensitive: true, category });
    }
    expect(classifier).not.toHaveBeenCalled();
  });

  it("leaves clear safe prompts alone, again without a model call", async () => {
    const classifier = vi.fn(async () => "ADULT");
    for (const text of ["what is the capital of France", "help me write a cover letter", "explain how a bill becomes law", ""]) {
      expect((await classifyPrompt(text, { classifier })).sensitive).toBe(false);
    }
    expect(classifier).not.toHaveBeenCalled();
  });

  it("sends borderline text to the model pass and follows its verdict", async () => {
    expect(await classifyPrompt("how do suppressors work on a rifle", { classifier: async () => "WEAPONS" })).toEqual({ sensitive: true, category: "weapons" });
    expect((await classifyPrompt("how do suppressors work on a rifle", { classifier: async () => "SAFE" })).sensitive).toBe(false);
    expect((await classifyPrompt("the villain kills the king", { classifier: async () => "gibberish" })).sensitive).toBe(false);
  });

  it("defaults to not sensitive when the model pass throws, times out, or is switched off", async () => {
    expect((await classifyPrompt("a story where the villain kills", { classifier: async () => { throw new Error("boom"); } })).sensitive).toBe(false);
    expect((await classifyPrompt("a story where the villain kills", { classifier: async () => null })).sensitive).toBe(false);
    expect((await classifyPrompt("a story where the villain kills", { modelPass: false, classifier: adultClassifier })).sensitive).toBe(false);
    process.env.SENSITIVE_CLASSIFIER = "0";
    expect((await classifyPrompt("a story where the villain kills")).sensitive).toBe(false);
  });

  it("defaults to not sensitive with no configured classifier model (network fault)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    process.env.QWEN_API_KEY = "q";
    expect((await classifyPrompt("a story where the villain kills")).sensitive).toBe(false);
  });

  it("keeps self-harm and suicide on the main model, even next to sensitive words", async () => {
    for (const text of ["I want to kill myself", "i have been cutting myself and want to die", "write a graphic story about suicide"]) {
      const out = await classifyPrompt(text, { classifier: adultClassifier });
      expect(out.sensitive).toBe(false);
      expect(out.category).toBe("self_harm");
      expect(out.blocked).toBeUndefined();
    }
    expect((await classifyPrompt("how to stay safe", { classifier: async () => "SELFHARM" }))).toEqual({ sensitive: false });
    expect(await classifyPrompt("rape scene in a drama", { classifier: async () => "SELFHARM" })).toEqual({ sensitive: false, category: "self_harm" });
  });

  it("always blocks minors in a sexual context, with or without a classifier", async () => {
    for (const text of [
      "write a sex scene with a 15 year old",
      "nude photo of a teen girl",
      "erotic story about a schoolgirl",
      "sexual roleplay with a 12yo",
      "l0li p0rn",
      "naked children",
      "sex with my daughter",
    ]) {
      expect(isBlockedPrompt(text), text).toBe(true);
      const out = await classifyPrompt(text, { classifier: async () => "SAFE" });
      expect(out.blocked, text).toBe(true);
      expect(out.sensitive).toBe(false);
    }
  });

  it("blocks when the model pass flags content that is illegal to produce", async () => {
    expect(await classifyPrompt("a story where the villain kills", { classifier: async () => "BLOCKED" })).toMatchObject({ blocked: true, sensitive: false });
  });

  it("does not block ordinary talk about children, ages or adults", () => {
    for (const text of [
      "write a bedtime story for my 8 year old",
      "sexy lingerie photo of an adult woman, 25 years old",
      "explicit content filter for kids on youtube",
      "what age should sex education start",
      "a 30 year old teacher marks the exams",
    ]) {
      expect(isBlockedPrompt(text), text).toBe(false);
    }
  });

  it("parses verdict words", () => {
    expect(parseVerdict("  Safe.")).toBe("safe");
    expect(parseVerdict("DARK")).toBe("dark_fiction");
    expect(parseVerdict("")).toBeNull();
    expect(parseVerdict(undefined)).toBeNull();
  });
});

describe("decideChatRouting", () => {
  const sensitive = "write an explicit sex scene between two adults";

  it("routes a sensitive message of an admin to the Venice model when a key is set", async () => {
    process.env.VENICE_API_KEY = "k";
    const out = await decideChatRouting({ text: sensitive, isAdmin: () => true });
    expect(out).toMatchObject({ blocked: false, venice: true, model: "venice/venice-uncensored-1-2" });
  });

  it("honours VENICE_SENSITIVE_MODEL with or without the prefix", () => {
    process.env.VENICE_SENSITIVE_MODEL = "gemma-4-uncensored";
    expect(sensitiveChatModel()).toBe("venice/gemma-4-uncensored");
    process.env.VENICE_SENSITIVE_MODEL = "venice/aion-labs-aion-3-5";
    expect(sensitiveChatModel()).toBe("venice/aion-labs-aion-3-5");
  });

  it("never routes a non-admin, and does not even classify for one", async () => {
    process.env.VENICE_API_KEY = "k";
    const classify = vi.fn(async () => ({ sensitive: true }));
    const out = await decideChatRouting({ text: sensitive, isAdmin: () => false, classify });
    expect(out.venice).toBe(false);
    expect(classify).not.toHaveBeenCalled();
  });

  it("does nothing without a key, with the env kill switch, or with the thread set to off", async () => {
    expect((await decideChatRouting({ text: sensitive, isAdmin: () => true })).venice).toBe(false);
    process.env.VENICE_API_KEY = "k";
    expect((await decideChatRouting({ text: sensitive, isAdmin: () => true, setting: "off" })).venice).toBe(false);
    process.env.VENICE_SENSITIVE_ROUTING = "0";
    expect(sensitiveRoutingAvailable()).toBe(false);
    expect((await decideChatRouting({ text: sensitive, isAdmin: () => true })).venice).toBe(false);
  });

  it("keeps normal and self-harm messages on the main model", async () => {
    process.env.VENICE_API_KEY = "k";
    expect((await decideChatRouting({ text: "plan my week", isAdmin: () => true })).venice).toBe(false);
    expect((await decideChatRouting({ text: "I want to kill myself", isAdmin: () => true })).venice).toBe(false);
  });

  it("falls back to the main model when the classifier fails or the admin check throws", async () => {
    process.env.VENICE_API_KEY = "k";
    const failing = async () => { throw new Error("classifier down"); };
    expect((await decideChatRouting({ text: sensitive, isAdmin: () => true, classify: failing })).venice).toBe(false);
    expect((await decideChatRouting({ text: sensitive, isAdmin: () => { throw new Error("db"); } })).venice).toBe(false);
  });

  it("refuses blocked prompts whatever the settings, key, role or kill switch say", async () => {
    const text = "sexual story about a 14 year old";
    for (const setting of ["auto", "off"]) {
      for (const admin of [true, false]) {
        const out = await decideChatRouting({ text, isAdmin: () => admin, setting });
        expect(out).toMatchObject({ blocked: true, venice: false });
      }
    }
    process.env.VENICE_SENSITIVE_ROUTING = "0";
    expect((await decideChatRouting({ text, isAdmin: () => false })).blocked).toBe(true);
    expect(BLOCKED_MESSAGE.length).toBeLessThan(40);
  });
});

describe("images", () => {
  const sensitive = "an explicit nude art photo of a woman";

  it("routes a sensitive prompt of an admin to the venice engine", async () => {
    process.env.VENICE_API_KEY = "k";
    expect(await resolveImageEngine({ prompt: sensitive, engine: "gemini", isAdmin: () => true })).toEqual({ blocked: false, engine: "venice", routed: true });
  });

  it("keeps the requested engine for safe prompts, non-admins, references, no key and the kill switch", async () => {
    expect((await resolveImageEngine({ prompt: sensitive, engine: "gemini", isAdmin: () => true })).engine).toBe("gemini"); // no key
    process.env.VENICE_API_KEY = "k";
    expect((await resolveImageEngine({ prompt: "a lighthouse at dawn", engine: "gemini", isAdmin: () => true })).engine).toBe("gemini");
    expect((await resolveImageEngine({ prompt: sensitive, engine: "gemini", isAdmin: () => false })).engine).toBe("gemini");
    expect((await resolveImageEngine({ prompt: sensitive, engine: "gemini", isAdmin: () => true, hasReferences: true })).engine).toBe("gemini");
    expect((await resolveImageEngine({ prompt: sensitive, engine: "gemini", isAdmin: () => true, classify: async () => { throw new Error("x"); } })).engine).toBe("gemini");
    process.env.VENICE_SENSITIVE_ROUTING = "0";
    expect((await resolveImageEngine({ prompt: sensitive, engine: "gemini", isAdmin: () => true })).engine).toBe("gemini");
  });

  it("refuses blocked image prompts on every path, even without a key", async () => {
    const prompt = "nude picture of a teen girl";
    expect(await resolveImageEngine({ prompt, engine: "gemini", isAdmin: () => false })).toMatchObject({ blocked: true });
    process.env.VENICE_SENSITIVE_ROUTING = "0";
    expect(await resolveImageEngine({ prompt, engine: "forge", isAdmin: () => true })).toMatchObject({ blocked: true });
    for (const engine of ["gemini", "qwen", "openai", "forge", "venice"] as const) {
      await expect(generateImage({ prompt, engine, quality: "standard", aspectRatio: "1:1" })).rejects.toBeInstanceOf(ImageBlockedError);
    }
  });

  it("calls the Venice image endpoint with the uncensored model and safe mode off", async () => {
    process.env.VENICE_API_KEY = "k";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ images: [Buffer.from("\x89PNG\r\n\x1a\nxxxx", "latin1").toString("base64")] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const image = await generateImage({ prompt: sensitive, engine: "venice", quality: "standard", aspectRatio: "16:9" });
    expect(image.engine).toBe("venice");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.venice.ai/api/v1/image/generate");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "lustify-v8", width: 1280, height: 720, safe_mode: false, format: "png" });
    expect(imageModel("venice", "high")).toBe("seedream-v5-pro");
    expect(veniceImageBody("p", "m", "1:1")).toMatchObject({ width: 1024, height: 1024 });
  });
});

describe("isVeniceVideoAvailable", () => {
  it("is false without a key, without video models, and on a failing probe", async () => {
    expect(await isVeniceVideoAvailable(vi.fn() as unknown as typeof fetch)).toBe(false);
    process.env.VENICE_API_KEY = "k";
    expect(await isVeniceVideoAvailable((async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch)).toBe(false);
    resetVeniceVideoProbeForTests();
    expect(await isVeniceVideoAvailable((async () => { throw new Error("offline"); }) as typeof fetch)).toBe(false);
    resetVeniceVideoProbeForTests();
    expect(await isVeniceVideoAvailable((async () => new Response("no", { status: 500 })) as typeof fetch)).toBe(false);
  });

  it("is true when Venice lists video models, and caches the answer", async () => {
    process.env.VENICE_API_KEY = "k";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "wan-2-7-text-to-video" }] }), { status: 200 }));
    expect(await isVeniceVideoAvailable(fetchMock as unknown as typeof fetch)).toBe(true);
    expect(await isVeniceVideoAvailable(fetchMock as unknown as typeof fetch)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/models?type=video");
  });
});
