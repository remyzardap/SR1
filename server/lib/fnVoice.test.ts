import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const env = vi.hoisted(() => ({ values: {} as Record<string, string> }));

vi.mock("../_core/env", () => ({
  ENV: {
    get elevenLabsApiKey() {
      return env.values.ELEVEN_LABS_API_KEY ?? "";
    },
    get elevenLabsVoiceId() {
      return env.values.ELEVEN_LABS_VOICE_ID ?? "";
    },
  },
}));

import { VoiceNotConfiguredError, speechToText, textToSpeech, voiceConfigured } from "./fnVoice";

const set = (key: string, value: string) => {
  env.values[key] = value;
};

beforeEach(() => {
  vi.clearAllMocks();
  env.values = {};
  set("ELEVEN_LABS_API_KEY", "configured-for-test");
  set("ELEVEN_LABS_VOICE_ID", "voice-for-test");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voiceConfigured", () => {
  it("needs the key for both directions", () => {
    expect(voiceConfigured(false)).toBe(true);
    env.values = {};
    expect(voiceConfigured(false)).toBe(false);
    expect(voiceConfigured(true)).toBe(false);
  });

  it("needs a voice as well for text to speech", () => {
    expect(voiceConfigured(true)).toBe(true);
    delete env.values.ELEVEN_LABS_VOICE_ID;
    expect(voiceConfigured(false)).toBe(true);
    expect(voiceConfigured(true)).toBe(false);
  });
});

describe("speechToText", () => {
  it("posts the recording as a multipart body and returns the text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: " order forty bolts " }) } as never);
    vi.stubGlobal("fetch", fetchMock);

    expect(await speechToText(Buffer.from("binary"), "audio/webm")).toBe("order forty bolts");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: FormData }];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(init.headers["xi-api-key"]).toBe("configured-for-test");
    const file = init.body.get("file") as File;
    expect(file.name).toBe("recording.webm");
    expect(file.type).toBe("audio/webm");
  });

  it("names the extension after the mime type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "x" }) } as never);
    vi.stubGlobal("fetch", fetchMock);
    await speechToText(Buffer.from("binary"), "audio/mpeg");
    expect((fetchMock.mock.calls[0] as unknown as [string, { body: FormData }])[1].body.get("file")).toHaveProperty("name", "recording.mp3");
  });

  it("refuses before any call when the key is missing", async () => {
    env.values = {};
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(speechToText(Buffer.from("binary"), "audio/webm")).rejects.toBeInstanceOf(VoiceNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the upstream body out of the error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "secret detail" } as never));
    let message = "";
    let status: number | undefined;
    try {
      await speechToText(Buffer.from("binary"), "audio/webm");
    } catch (err) {
      message = (err as Error).message;
      status = (err as { providerStatus?: number }).providerStatus;
    }
    expect(status).toBe(401);
    expect(message).not.toContain("secret detail");
  });
});

describe("textToSpeech", () => {
  it("reads back audio bytes for the voice in the config", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, headers: new Headers({ "content-type": "audio/mpeg" }) } as never);
    vi.stubGlobal("fetch", fetchMock);

    const out = await textToSpeech("Revenue rose.");
    expect(out.audio).toEqual(Buffer.from([1, 2, 3]));
    expect(out.contentType).toBe("audio/mpeg");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-for-test");
    expect(JSON.parse(init.body)).toMatchObject({ text: "Revenue rose." });
  });

  it("falls back to a content type when the provider sends none", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([9]).buffer, headers: new Headers() } as never));
    expect((await textToSpeech("hi")).contentType).toBe("audio/mpeg");
  });

  it("refuses when no voice id is configured", async () => {
    delete env.values.ELEVEN_LABS_VOICE_ID;
    await expect(textToSpeech("hi")).rejects.toBeInstanceOf(VoiceNotConfiguredError);
  });
});
