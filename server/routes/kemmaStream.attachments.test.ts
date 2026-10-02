/**
 * The attachment path of POST /api/kemma/stream: what goes on the wire, what goes
 * into the stored message, and what the client is told about files it could not
 * read. The engine, the quota and the session store are faked; the attachment
 * validators are the real ones (their own behaviour is server/lib/attachments.test.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn() }));
const quota = vi.hoisted(() => ({ checkQuota: vi.fn(), getQuotaSummary: vi.fn(), incrementQuota: vi.fn() }));
const db = vi.hoisted(() => ({
  addChatMessage: vi.fn(async () => "msg-id"),
  getChatSessionSettings: vi.fn(async () => ({})),
  ensureChatSession: vi.fn(async () => "owned" as const),
}));
const google = vi.hoisted(() => ({ getConnectionStatus: vi.fn() }));
// Only the reading of the files is faked: the notices and the context block it
// returns are what the route has to place correctly.
const attachments = vi.hoisted(() => ({ attachmentsToContext: vi.fn() }));

vi.mock("../kemma/engine", () => engine);
vi.mock("../core/quotaCheck", () => quota);
vi.mock("../db", () => db);
vi.mock("../services/google", () => google);
vi.mock("../lib/attachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/attachments")>()),
  attachmentsToContext: attachments.attachmentsToContext,
}));

import { kemmaStreamRoute } from "./kemmaStream";
import { FnError } from "../lib/fnErrors";

function fakeReq(body: unknown, user: unknown = { id: 1, name: "Ruth" }) {
  return { user, body, on: () => {}, readableEnded: true } as never;
}

function fakeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    frames: [] as string[],
    headersSent: false,
    writableEnded: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
    setHeader() {},
    flushHeaders() {
      this.headersSent = true;
    },
    write(chunk: string) {
      this.frames.push(String(chunk));
    },
    on() {},
    end() {
      this.writableEnded = true;
    },
  } as any;
}

function events(frames: string[]): Array<{ event: string; data: unknown }> {
  return frames
    .filter((raw) => !raw.startsWith(":"))
    .map((raw) => {
      const match = /^event: (.+)\ndata: ([\s\S]*)\n\n$/.exec(raw);
      if (!match) throw new Error(`unparseable SSE frame: ${JSON.stringify(raw)}`);
      return { event: match[1], data: JSON.parse(match[2]) };
    });
}

const engineOutput = {
  response: "The photo shows a lighthouse.",
  toolCalls: [],
  isAgentic: false,
  isWarning: false,
  isError: false,
  tokensUsed: { input: 1, output: 1, total: 2 },
  modelsUsed: ["kemma-test"],
  stepsUsed: 1,
  durationMs: 5,
  sources: [],
};

const deviceOne = { source: "device", filename: "photo.png", mediaType: "image/png", dataUrl: "data:image/png;base64,QQ==" };
const deviceTwo = { source: "device", filename: "notes.txt", mediaType: "text/plain", dataUrl: "data:text/plain;base64,aGk=" };

const body = (attachmentsBody: unknown) => ({
  messages: [
    { role: "user", content: "earlier question" },
    { role: "assistant", content: "earlier answer" },
    { role: "user", content: "what is in these?" },
  ],
  sessionId: "sess-77",
  attachments: attachmentsBody,
});

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  quota.checkQuota.mockResolvedValue({ allowed: true, remaining: 9, limit: 10 });
  quota.getQuotaSummary.mockResolvedValue({ tier: "pro" });
  quota.incrementQuota.mockResolvedValue(undefined);
  google.getConnectionStatus.mockResolvedValue({ connected: true, email: "user@example.test" });
  attachments.attachmentsToContext.mockResolvedValue({ text: "", notices: [], names: [] });
  engine.kemmaExecute.mockResolvedValue(engineOutput);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe("a request without attachments", () => {
  it("asks the attachment layer for nothing and stores the message untouched", async () => {
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq(body(undefined)), res);

    expect(attachments.attachmentsToContext).not.toHaveBeenCalled();
    expect(engine.kemmaExecute.mock.calls[0][0].messages[2].content).toBe("what is in these?");
    expect(db.addChatMessage.mock.calls[0][2]).toBe("what is in these?");
  });
});

describe("the wire message", () => {
  it("appends the read context to the last user message only", async () => {
    attachments.attachmentsToContext.mockResolvedValue({
      text: "ATTACHMENTS PROVIDED BY THE USER, use them as sources:\n\nImage: photo.png\nA lighthouse at dusk.",
      notices: [],
      names: ["photo.png"],
    });
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq(body([deviceOne])), res);

    const sent = engine.kemmaExecute.mock.calls[0][0].messages as Array<{ role: string; content: string }>;
    expect(sent[0].content).toBe("earlier question");
    expect(sent[1].content).toBe("earlier answer");
    expect(sent[2].content).toBe("what is in these?\n\nATTACHMENTS PROVIDED BY THE USER, use them as sources:\n\nImage: photo.png\nA lighthouse at dusk.");
  });

  it("leaves the history alone when every file was skipped", async () => {
    attachments.attachmentsToContext.mockResolvedValue({ text: "", notices: ["Skipped photo.png: it could not be read."], names: ["photo.png"] });
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq(body([deviceOne])), res);

    expect(engine.kemmaExecute.mock.calls[0][0].messages[2].content).toBe("what is in these?");
  });
});

describe("the stored message", () => {
  it("keeps the names and none of the extracted text", async () => {
    attachments.attachmentsToContext.mockResolvedValue({
      text: "ATTACHMENTS PROVIDED BY THE USER:\n\nFile: notes.txt\nthe whole document text",
      notices: [],
      names: ["photo.png", "notes.txt"],
    });
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq(body([deviceOne, deviceTwo])), res);

    const stored = db.addChatMessage.mock.calls[0];
    expect(stored[0]).toBe("sess-77");
    expect(stored[1]).toBe(1);
    expect(stored[2]).toBe("what is in these?\n\nAttached files: photo.png, notes.txt");
    expect(stored[3]).toBe("user");
    expect(stored[2]).not.toContain("the whole document text");
    expect(stored[2]).not.toContain("ATTACHMENTS PROVIDED");
    // The block is only on the wire: no stored row carries it.
    for (const call of db.addChatMessage.mock.calls) expect(String(call[2])).not.toContain("ATTACHMENTS PROVIDED BY THE USER");
  });

  it("stores the plain message when nothing was attached", async () => {
    await kemmaStreamRoute(fakeReq(body([])), fakeRes());
    expect(db.addChatMessage.mock.calls[0][2]).toBe("what is in these?");
  });
});

describe("notices", () => {
  it("emits one notice event per skipped file, before the model starts", async () => {
    attachments.attachmentsToContext.mockResolvedValue({
      text: "CTX",
      notices: ["Skipped broken.pdf: Broken.pdf could not be read from Google Drive.", "Skipped big.png: big.png is over the 10 MB limit."],
      names: ["good.txt", "broken.pdf", "big.png"],
    });
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq(body([deviceTwo])), res);

    const frames = events(res.frames);
    expect(frames.map((f) => f.event)).toEqual(["notice", "notice", "token", "usage", "done"]);
    expect(frames[0].data).toEqual({ message: "Skipped broken.pdf: Broken.pdf could not be read from Google Drive." });
    expect(frames[1].data).toEqual({ message: "Skipped big.png: big.png is over the 10 MB limit." });
  });

  it("reads the files after the stream is open, so a slow file keeps the connection alive", async () => {
    let release: ((value: { text: string; notices: string[]; names: string[] }) => void) | null = null;
    attachments.attachmentsToContext.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const res = fakeRes();
    const run = kemmaStreamRoute(fakeReq(body([deviceOne])), res);

    await new Promise((r) => setImmediate(r));
    expect(res.headersSent).toBe(true);
    expect(engine.kemmaExecute).not.toHaveBeenCalled();

    release!({ text: "CTX", notices: [], names: ["photo.png"] });
    await run;
    expect(engine.kemmaExecute).toHaveBeenCalledTimes(1);
  });
});

describe("validation before the stream opens", () => {
  it("answers 400 for more than five files, and never opens the stream", async () => {
    const six = Array.from({ length: 6 }, () => deviceOne);
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq(body(six)), res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "Up to 5 files can be attached to one request." });
    expect(res.headersSent).toBe(false);
    expect(res.frames).toEqual([]);
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
    expect(db.addChatMessage).not.toHaveBeenCalled();
  });

  it("answers 400 for a type that is not allowed", async () => {
    const res = fakeRes();
    const bad = { source: "device", filename: "tool.exe", mediaType: "application/x-msdownload", dataUrl: "data:application/x-msdownload;base64,QQ==" };
    await kemmaStreamRoute(fakeReq(body([bad])), res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "That file type cannot be attached: tool.exe." });
    expect(attachments.attachmentsToContext).not.toHaveBeenCalled();
  });

  it("answers 400 for a file over the size limit", async () => {
    const huge = { source: "device", filename: "huge.txt", mediaType: "text/plain", dataUrl: "data:text/plain;base64," + "A".repeat(14 * 1024 * 1024) };
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq(body([huge])), res);

    expect(res.statusCode).toBe(413);
    expect(res.jsonBody).toEqual({ error: "huge.txt is over the 10 MB limit." });
  });

  it("answers 409 when a Drive file is attached without a Google connection", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: false, email: null });
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq(body([{ source: "drive", fileId: "drive-1", filename: "Doc" }])), res);

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toEqual({ error: "Connect Google on the Connections page first." });
    expect(google.getConnectionStatus).toHaveBeenCalledWith(1);
    expect(attachments.attachmentsToContext).not.toHaveBeenCalled();
  });

  it("asks only about the session user's own connection", async () => {
    google.getConnectionStatus.mockRejectedValue(new FnError(409, "nope"));
    const res = fakeReq(body([{ source: "drive", fileId: "drive-1" }]), { id: 55, name: "Nia" });
    await kemmaStreamRoute(res, fakeRes());
    expect(google.getConnectionStatus).toHaveBeenCalledWith(55);
  });

  it("keeps working when the read of a file throws unexpectedly", async () => {
    attachments.attachmentsToContext.mockRejectedValue(new Error("unexpected"));
    const res = fakeRes();
    await kemmaStreamRoute(fakeReq(body([deviceOne])), res);

    const frames = events(res.frames);
    expect(frames.map((f) => f.event)).toContain("error");
    expect(frames[frames.length - 1].data).toBe("unexpected");
  });
});
