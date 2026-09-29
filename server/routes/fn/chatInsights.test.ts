import { describe, it, expect, vi, beforeEach } from "vitest";

const llm = vi.hoisted(() => ({
  stream: vi.fn(),
  LlmUnavailableError: class LlmUnavailableError extends Error {},
}));

vi.mock("../../lib/fnLlm", () => ({ stream: llm.stream, LlmUnavailableError: llm.LlmUnavailableError }));

import {
  MAX_INSIGHT_CONVERSATION_CHARS,
  MIN_INSIGHT_CONVERSATION_CHARS,
  handleChatInsights,
} from "./chatInsights";

function fakeRes() {
  const res = {
    frames: [] as string[],
    headers: {} as Record<string, string>,
    ended: false,
    writableEnded: false,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    flushHeaders() {},
    write(chunk: string) {
      this.frames.push(chunk);
    },
    end() {
      this.ended = true;
      this.writableEnded = true;
    },
    on() {},
  };
  return res;
}

const request = (body: unknown) => ({ body, on: () => {} } as never);

/** The event and data extraction ChatInsightsDialog.tsx performs per block. */
function parseClientStyle(frames: string[]): Array<{ event?: string; data: string }> {
  return frames
    .join("")
    .split("\n\n")
    .filter(Boolean)
    .map((block) => ({
      event: block.match(/^event: (.*)$/m)?.[1],
      data: block.match(/^data: (.*)$/m)?.[1] ?? "",
    }))
    .filter((frame) => frame.data);
}

beforeEach(() => {
  vi.clearAllMocks();
  llm.stream.mockImplementation(async (_messages: unknown, _options: unknown, onToken: (t: string) => void) => {
    onToken("## Decisions\n");
    onToken("- Ship on Tuesday.");
    return { text: "## Decisions\n- Ship on Tuesday.", model: "chat-model", provider: "qwen" };
  });
});

describe("chat-insights request contract", () => {
  for (const focus of ["decisions", "gaps", "brief", "followups"] as const) {
    it(`accepts the ${focus} focus`, async () => {
      const body: Record<string, unknown> = { conversation: "a".repeat(60), focus };
      if (focus === "brief") body.audience = "Board of directors";
      await handleChatInsights(7, request(body), fakeRes() as never);
      expect(llm.stream).toHaveBeenCalledTimes(1);
    });
  }

  it("refuses a conversation shorter than the dialog allows", async () => {
    await expect(handleChatInsights(7, request({ conversation: "too short", focus: "gaps" }), fakeRes() as never)).rejects.toThrow(
      "Conversation is too short."
    );
    expect(llm.stream).not.toHaveBeenCalled();
    expect(MIN_INSIGHT_CONVERSATION_CHARS).toBe(20);
  });

  it("refuses a conversation over 200000 characters", async () => {
    await expect(
      handleChatInsights(7, request({ conversation: "x".repeat(MAX_INSIGHT_CONVERSATION_CHARS + 1), focus: "gaps" }), fakeRes() as never)
    ).rejects.toThrow("Conversation is too long (max 200000).");
  });

  it("requires an audience for the brief focus only", async () => {
    await expect(handleChatInsights(7, request({ conversation: "a".repeat(40), focus: "brief" }), fakeRes() as never)).rejects.toMatchObject({
      status: 400,
      message: "Describe who the brief is for.",
    });
    await expect(handleChatInsights(7, request({ conversation: "a".repeat(40), focus: "decisions" }), fakeRes() as never)).resolves.toBeUndefined();
  });

  it("rejects an unknown focus value", async () => {
    await expect(handleChatInsights(7, request({ conversation: "a".repeat(40), focus: "summary" }), fakeRes() as never)).rejects.toThrow(
      "Focus is not valid."
    );
  });

  it("caps the audience field", async () => {
    await expect(
      handleChatInsights(7, request({ conversation: "a".repeat(40), focus: "brief", audience: "y".repeat(301) }), fakeRes() as never)
    ).rejects.toThrow("Audience is too large (max 300).");
  });
});

describe("chat-insights stream", () => {
  it("emits token frames as JSON strings and reads back as the dialog reads them", async () => {
    const res = fakeRes();
    await handleChatInsights(7, request({ conversation: "we decided to ship on Tuesday after the audit", focus: "decisions" }), res as never);

    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    const frames = parseClientStyle(res.frames);
    expect(frames[0].event).toBe("token");
    const text = frames
      .filter((f) => f.event === "token")
      .map((f) => JSON.parse(f.data) as string)
      .join("");
    expect(text).toBe("## Decisions\n- Ship on Tuesday.");
    expect(frames.some((f) => f.event === "done")).toBe(true);
  });

  it("sends the focus instruction and the conversation to the model", async () => {
    await handleChatInsights(7, request({ conversation: "quarterly numbers were flat", focus: "brief", audience: "Investors" }), fakeRes() as never);
    const [messages, options] = llm.stream.mock.calls[0] as unknown as [Array<{ role: string; content: string }>, { purpose: string }];
    expect(messages[0].content).toContain("executive brief");
    expect(messages[1].content).toContain("Audience: Investors");
    expect(messages[1].content).toContain("quarterly numbers were flat");
    expect(options.purpose).toBe("chat_insights");
  });

  it("reports a model failure as an error frame with { message, retryable }", async () => {
    llm.stream.mockRejectedValueOnce(new Error("upstream went away"));
    const res = fakeRes();
    await handleChatInsights(7, request({ conversation: "a".repeat(40), focus: "gaps" }), res as never);

    const frames = parseClientStyle(res.frames);
    const error = frames.find((f) => f.event === "error");
    expect(error).toBeDefined();
    expect(JSON.parse(error!.data)).toEqual({
      message: "This analysis could not be completed. Please try again.",
      retryable: true,
    });
  });

  it("marks a missing model as not retryable", async () => {
    llm.stream.mockRejectedValueOnce(new llm.LlmUnavailableError());
    const res = fakeRes();
    await handleChatInsights(7, request({ conversation: "a".repeat(40), focus: "gaps" }), res as never);
    const error = parseClientStyle(res.frames).find((f) => f.event === "error");
    expect(JSON.parse(error!.data)).toEqual({ message: "Chat insights are not configured yet.", retryable: false });
  });

  it("drops tokens that arrive after the dialog is closed", async () => {
    const res = fakeRes();
    let close: (() => void) | undefined;
    const req = { body: { conversation: "a".repeat(40), focus: "decisions" }, on: (_name: string, cb: () => void) => (close = cb) } as never;
    llm.stream.mockImplementation(async (_messages: unknown, _options: unknown, onToken: (t: string) => void) => {
      onToken("kept ");
      close?.();
      onToken("dropped");
      return { text: "kept dropped", model: "chat-model", provider: "qwen" };
    });

    await handleChatInsights(7, req, res as never);
    const text = parseClientStyle(res.frames)
      .filter((f) => f.event === "token")
      .map((f) => JSON.parse(f.data) as string)
      .join("");
    expect(text).toBe("kept ");
  });
});
