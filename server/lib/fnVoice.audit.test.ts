/**
 * Audit tests (area 3): the ElevenLabs contract behind /api/fn/voice.
 *
 * fnVoice.test.ts checks the happy path and that a provider body stays out of the
 * error. The gaps here are the shapes that change what the user sees: a provider
 * auth fault must not reach the browser as a 401 (the client logs out on 401), the
 * key has to appear in exactly one header and nowhere else, and the transcript
 * reader only understands `text` as a string.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ENV_KEY = "ELEVEN_LABS_API_KEY";
const ENV_VOICE = "ELEVEN_LABS_VOICE_ID";

vi.mock("../_core/env", () => ({
  ENV: {
    get elevenLabsApiKey() {
      return process.env[ENV_KEY] ?? "";
    },
    get elevenLabsVoiceId() {
      return process.env[ENV_VOICE] ?? "";
    },
  },
}));

import { VoiceUpstreamError, speechToText, textToSpeech, voiceConfigured } from "./fnVoice";
import { FnError } from "./fnErrors";
import { handleVoice } from "../routes/fn/voice";

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of [ENV_KEY, ENV_VOICE]) {
    saved.set(name, process.env[name]);
    process.env[name] = name === ENV_KEY ? "fake-eleven-key" : "fake-voice-id";
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

const jsonBody = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init } as ResponseInit);

describe("speech to text against the provider", () => {
  it("sends the key in xi-api-key only, and never in a query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonBody({ text: " order forty steel bolts \n" }));
    vi.stubGlobal("fetch", fetchMock);

    const transcript = await speechToText(Buffer.from("audio"), "audio/webm");
    expect(transcript).toBe("order forty steel bolts");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(headers["xi-api-key"]).toBe("fake-eleven-key");
    expect(headers.Authorization).toBeUndefined();
    expect(url).not.toContain("fake-eleven-key");
    expect(String(init.body)).not.toContain("fake-eleven-key");
  });

  it("answers a 401 from the provider as a 502, never as a 401 the client would take as a session expiry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonBody({ detail: { status: "invalid_api_key" } }, { status: 401 })));
    await expect(speechToText(Buffer.from("audio"), "audio/webm")).rejects.toMatchObject({ providerStatus: 401 });

    // And through the function: the browser must not see status 401.
    const res = {
      statusCode: 200,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      setHeader() {},
      flushHeaders() {},
      write() {},
      end() {},
      on() {},
    };
    const req = { body: {}, file: { buffer: Buffer.from("a"), mimetype: "audio/webm", size: 1 }, query: {}, on: () => {} };
    await handleVoice(7, req as never, res as never).catch((err: unknown) => err);
    const fault = await handleVoice(7, req as never, res as never).catch((err: Error) => err);
    expect(fault).toBeInstanceOf(FnError);
    expect((fault as FnError).status).toBe(502);
    expect((fault as FnError).message).toBe("Voice is unavailable right now. Please try again.");
  });

  it("only understands `text` as a string: a segment-array answer reads as silence", async () => {
    // ElevenLabs carries word-level output in some response formats. Nothing here reads
    // it, so the client gets an empty transcript and shows "I couldn't make out any
    // speech" for a recording that was perfectly well transcribed upstream.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonBody({ text: [{ value: "hello" }, { value: "there" }] }))
    );
    await expect(speechToText(Buffer.from("audio"), "audio/webm")).resolves.toBe("");
  });

  it("throws no fault when the 200 body is not JSON, it just fails the parse", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>gateway</html>", { status: 200 })));
    await expect(speechToText(Buffer.from("audio"), "audio/webm")).rejects.toThrow();
  });

  it("carries no timeout: a provider that never answers holds the request open", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeUndefined();
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = speechToText(Buffer.from("audio"), "audio/webm");
    pending.catch(() => {});
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("text to speech against the provider", () => {
  it("posts the voice id in the path and reads back the bytes with the provider type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(Buffer.from("mpeg"), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await textToSpeech("read this aloud");
    expect(out.contentType).toBe("audio/mpeg");
    expect(out.audio.toString()).toBe("mpeg");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/fake-voice-id");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("fake-eleven-key");
    expect(JSON.parse(init.body as string).model_id).toBe("eleven_multilingual_v2");
  });

  it("keeps a JSON error body out of the fault but keeps the status for the log", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonBody({ detail: { status: "quota_exceeded", text: "used all characters" } }, { status: 422 })));
    const fault = await textToSpeech("x").catch((err: Error) => err);
    expect(fault).toBeInstanceOf(VoiceUpstreamError);
    expect((fault as VoiceUpstreamError).providerStatus).toBe(422);
    expect(String((fault as Error).message)).not.toContain("quota");
  });

  it("reports the switch off when either half of the config is gone", () => {
    expect(voiceConfigured(true)).toBe(true);
    delete process.env[ENV_VOICE];
    expect(voiceConfigured(true)).toBe(false);
    expect(voiceConfigured(false)).toBe(true);
    delete process.env[ENV_KEY];
    expect(voiceConfigured(false)).toBe(false);
  });
});
