import { describe, it, expect, vi, beforeEach } from "vitest";

const voice = vi.hoisted(() => ({
  speechToText: vi.fn(),
  textToSpeech: vi.fn(),
  voiceConfigured: vi.fn().mockReturnValue(true),
  VoiceNotConfiguredError: class VoiceNotConfiguredError extends Error {},
  VoiceUpstreamError: class VoiceUpstreamError extends Error {
    providerStatus?: number;
    constructor(status?: number) {
      super("The voice service could not be reached.");
      this.providerStatus = status;
    }
  },
}));

vi.mock("../../lib/fnVoice", () => voice);

import { MAX_AUDIO_BYTES, MAX_SPEAK_CHARS, TRANSCRIPT_DELTA_CHARS, handleVoice, parseAudio, transcriptFrames } from "./voice";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    sent: null as unknown,
    frames: [] as string[],
    headers: {} as Record<string, string>,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.sent = payload;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    flushHeaders() {},
    write(chunk: string) {
      this.frames.push(chunk);
    },
    end() {
      this.ended = true;
    },
  };
  return res;
}

const audioRequest = (file: unknown, query: Record<string, unknown> = {}) =>
  ({ body: {}, file, query, is: () => true, on: () => {} }) as never;

/**
 * The accumulation loop from transcribeAudio in client/src/lib/kemmaCloud.ts,
 * copied so the frames are checked the way the client reads them.
 */
function clientTranscript(frames: string[]): string {
  let text = "";
  for (const chunk of frames) {
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as { type?: string; delta?: string; text?: string; transcript?: string };
      if (typeof event.delta === "string") text += event.delta;
      else if (event.type?.endsWith(".done") && typeof event.text === "string") text = event.text;
      else if (typeof event.transcript === "string" && !event.type) text += event.transcript;
    } catch {
      // ignore keep-alives
    }
  }
  return text.trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  voice.voiceConfigured.mockReturnValue(true);
  voice.speechToText.mockResolvedValue("order forty steel bolts");
  voice.textToSpeech.mockResolvedValue({ audio: Buffer.from("audio-bytes"), contentType: "audio/mpeg" });
});

describe("transcriptFrames", () => {
  it("sends delta fragments and one closing transcript.done", () => {
    const text = "x".repeat(TRANSCRIPT_DELTA_CHARS * 2 + 10);
    const frames = transcriptFrames(text);
    expect(frames).toHaveLength(4);
    expect(frames[0]).toEqual({ delta: "x".repeat(TRANSCRIPT_DELTA_CHARS) });
    expect(frames[1]).toEqual({ delta: "x".repeat(TRANSCRIPT_DELTA_CHARS) });
    expect(frames[2]).toEqual({ delta: "x".repeat(10) });
    expect(frames[3]).toEqual({ type: "transcript.done", text });
  });

  it("is one done frame when the recording was silent", () => {
    expect(transcriptFrames("   ")).toEqual([{ type: "transcript.done", text: "" }]);
  });

  it("reconstructs the same text either way the client reads it", () => {
    const text = "Please order forty steel bolts and deliver them to the Bandung workshop before Friday.";
    const frames = transcriptFrames(text);
    const deltas = frames.filter((f) => "delta" in f).map((f) => f.delta).join("");
    expect(deltas).toBe(text);
    expect(frames[frames.length - 1].text).toBe(text);
  });
});

describe("speech to text", () => {
  it("streams delta frames, the done frame and [DONE]", async () => {
    const res = fakeRes();
    await handleVoice(7, audioRequest({ buffer: Buffer.from("a"), mimetype: "audio/webm", size: 1000 }), res as never);

    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.frames[0]).toBe('data: {"delta":"order forty steel bolts"}\n\n');
    expect(res.frames[1]).toBe('data: {"type":"transcript.done","text":"order forty steel bolts"}\n\n');
    expect(res.frames[2]).toBe("data: [DONE]\n\n");
    expect(res.ended).toBe(true);
    expect(clientTranscript(res.frames)).toBe("order forty steel bolts");
    expect(voice.speechToText).toHaveBeenCalledWith(expect.any(Buffer), "audio/webm");
  });

  it("streams a long transcript as several fragments the client rebuilds", async () => {
    const long = "alpha bravo charlie ".repeat(200).trim();
    voice.speechToText.mockResolvedValueOnce(long);
    const res = fakeRes();
    await handleVoice(7, audioRequest({ buffer: Buffer.from("a"), mimetype: "audio/webm", size: 1000 }), res as never);
    expect(res.frames.length).toBeGreaterThan(3);
    expect(clientTranscript(res.frames)).toBe(long);
  });

  it("asks for audio and rejects a body without one", async () => {
    await expect(handleVoice(7, audioRequest(undefined), fakeRes() as never)).rejects.toThrow("No audio was received.");
    await expect(handleVoice(7, audioRequest({ buffer: Buffer.from("x"), mimetype: "text/plain", size: 1 }), fakeRes() as never)).rejects.toThrow(
      "That is not an audio recording."
    );
    await expect(handleVoice(7, audioRequest({ buffer: Buffer.from(""), mimetype: "audio/webm", size: 0 }), fakeRes() as never)).rejects.toThrow(
      "The recording is empty."
    );
    expect(voice.speechToText).not.toHaveBeenCalled();
  });

  it("enforces the 10 MB audio cap", async () => {
    expect(MAX_AUDIO_BYTES).toBe(10 * 1024 * 1024);
    await expect(
      handleVoice(7, audioRequest({ buffer: Buffer.from("x"), mimetype: "audio/webm", size: MAX_AUDIO_BYTES + 1 }), fakeRes() as never)
    ).rejects.toMatchObject({ status: 413, message: "Audio is limited to 10 MB." });
  });

  it("answers 503 with the agreed message when no key is set", async () => {
    voice.voiceConfigured.mockReturnValue(false);
    await expect(handleVoice(7, audioRequest({ buffer: Buffer.from("a"), mimetype: "audio/webm", size: 10 }), fakeRes() as never)).rejects.toMatchObject(
      { status: 503, message: "Voice is not configured." }
    );
    expect(voice.speechToText).not.toHaveBeenCalled();
  });

  it("hides the upstream detail behind a generic failure", async () => {
    voice.speechToText.mockRejectedValueOnce(new voice.VoiceUpstreamError(429));
    await expect(handleVoice(7, audioRequest({ buffer: Buffer.from("a"), mimetype: "audio/webm", size: 10 }), fakeRes() as never)).rejects.toMatchObject(
      { status: 502, message: "Voice is unavailable right now. Please try again." }
    );
  });

  it("leaves an unexpected fault for the router to answer as a 500", async () => {
    voice.speechToText.mockRejectedValueOnce(new Error("disk exploded"));
    await expect(handleVoice(7, audioRequest({ buffer: Buffer.from("a"), mimetype: "audio/webm", size: 10 }), fakeRes() as never)).rejects.toThrow(
      "disk exploded"
    );
  });

  it("leaves a JSON request for the shared body parser", () => {
    const req = { is: () => false, body: { text: "hi" } };
    let called = false;
    parseAudio(req as never, fakeRes() as never, () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});

describe("text to speech", () => {
  it("returns audio bytes, not JSON", async () => {
    const res = fakeRes();
    const req = { body: { text: "Revenue rose twelve percent." }, query: { mode: "speak" }, is: () => false } as never;
    await handleVoice(7, req, res as never);

    expect(voice.textToSpeech).toHaveBeenCalledWith("Revenue rose twelve percent.");
    expect(res.headers["Content-Type"]).toBe("audio/mpeg");
    expect(res.headers["Content-Length"]).toBe("11");
    expect(res.sent).toEqual(Buffer.from("audio-bytes"));
  });

  it("needs a text body", async () => {
    const req = { body: {}, query: { mode: "speak" }, is: () => false } as never;
    await expect(handleVoice(7, req, fakeRes() as never)).rejects.toThrow("Text is required.");
  });

  it("takes the 4000 characters SpeakButton.tsx can send and refuses beyond that", async () => {
    expect(MAX_SPEAK_CHARS).toBe(4000);
    const atLimit = { body: { text: "x".repeat(MAX_SPEAK_CHARS) }, query: { mode: "speak" }, is: () => false } as never;
    await handleVoice(7, atLimit, fakeRes() as never);
    expect(voice.textToSpeech).toHaveBeenCalledWith("x".repeat(MAX_SPEAK_CHARS));

    const over = { body: { text: "x".repeat(MAX_SPEAK_CHARS + 1) }, query: { mode: "speak" }, is: () => false } as never;
    await expect(handleVoice(7, over, fakeRes() as never)).rejects.toMatchObject({ status: 400 });
    expect(voice.textToSpeech).toHaveBeenCalledTimes(1);
  });

  it("is 503 without a key or a voice", async () => {
    voice.voiceConfigured.mockReturnValue(false);
    const req = { body: { text: "hello" }, query: { mode: "speak" }, is: () => false } as never;
    await expect(handleVoice(7, req, fakeRes() as never)).rejects.toMatchObject({ status: 503, message: "Voice is not configured." });
    expect(voice.textToSpeech).not.toHaveBeenCalled();
  });
});
