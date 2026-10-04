import { describe, it, expect, vi, beforeEach } from "vitest";

const engine = vi.hoisted(() => ({ kemmaExecute: vi.fn() }));
const llm = vi.hoisted(() => ({ complete: vi.fn() }));
const sources = vi.hoisted(() => ({ ingestSources: vi.fn() }));
const kinds = vi.hoisted(() => ({ qualityChecks: vi.fn() }));

vi.mock("../kemma/engine", () => engine);
vi.mock("./fnLlm", () => llm);
vi.mock("./documentSources", () => sources);
// The real prompt builders, parsers and citation code run; only the length/structure check is scripted.
vi.mock("./documentKinds", async () => ({
  ...(await vi.importActual<typeof import("./documentKinds")>("./documentKinds")),
  qualityChecks: kinds.qualityChecks,
}));

import {
  CALL_CAPS,
  ProgressTracker,
  STAGE_WEIGHTS,
  extractNotes,
  fitSections,
  parseGenerateRequest,
  runDocumentPipeline,
  type GenerateRequest,
} from "./documentPipeline";

const outlineJson = (n: number) =>
  JSON.stringify({
    title: "Solar in Cities",
    subtitle: "A brief",
    sections: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, title: i === n - 1 ? "Conclusion" : `Part ${i + 1}`, purpose: "p", researchQuestions: ["q"], targetWords: 300, type: i === n - 1 ? "conclusion" : "section" })),
  });

function request(kind: GenerateRequest["kind"], brief = "Explain solar adoption in cities"): GenerateRequest {
  return { brief, kind, theme: "corporate", style: kind === "medium" ? "ieee" : "apa", sources: {} };
}

interface Frame { event: string; data: any }

function setupModels(opts: { sections?: number; notesJson?: string } = {}) {
  const n = opts.sections ?? 3;
  llm.complete.mockImplementation(async (messages: Array<{ content: string }>, o: { purpose: string }) => {
    const text = o.purpose === "documents:plan" ? outlineJson(n) : o.purpose === "documents:polish" ? JSON.stringify({ summary: "Short summary.", abstract: "An abstract." }) : `Body text for ${messages[1].content}.`;
    return { text, model: "m", provider: "x", inputTokens: 10, outputTokens: 20 };
  });
  engine.kemmaExecute.mockImplementation(async () => ({
    response: opts.notesJson ?? JSON.stringify({ notes: [{ claim: "Solar grew.", sourceTitle: "IEA Report", url: "https://iea.example/report", quote: "grew" }, { claim: "Invented.", sourceTitle: "Made Up", url: "https://fake.example/x" }] }),
    toolCalls: [], isAgentic: true, tokensUsed: { input: 5, output: 5, total: 10 }, modelsUsed: ["m"], stepsUsed: 2, durationMs: 5,
    sources: [{ id: 1, url: "https://iea.example/report", title: "IEA Report" }],
  }));
  sources.ingestSources.mockResolvedValue({ context: "", used: [], notices: [] });
  kinds.qualityChecks.mockReturnValue({ ok: true, problems: [], words: 1200, pages: 3 });
}

async function run(req: GenerateRequest, extra: { signal?: AbortSignal; callCap?: number; timeCapMs?: number } = {}) {
  const frames: Frame[] = [];
  const result = await runDocumentPipeline({
    userId: 7, tier: "pro", request: req, emit: (event, data) => frames.push({ event, data }),
    signal: extra.signal ?? new AbortController().signal, callCap: extra.callCap, timeCapMs: extra.timeCapMs,
  });
  return { frames, result };
}

const names = (frames: Frame[]) => frames.map((f) => f.event);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("happy paths", () => {
  it("short: stages, outline, sections, report, done; no research for a plain brief", async () => {
    setupModels({ sections: 3 });
    const { frames, result } = await run(request("short"));
    expect(result.status).toBe("done");
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
    const order = names(frames).filter((e) => ["outline", "section", "report", "done"].includes(e));
    expect(order).toEqual(["outline", "section", "section", "section", "report", "done"]);
    const stageIds = frames.filter((f) => f.event === "stage").map((f) => f.data.id);
    expect(stageIds).toEqual(["reading", "planning", "writing", "checking", "assembling"]);
    const report = frames.find((f) => f.event === "report")!.data;
    expect(report.sections.map((s: any) => s.type)).toEqual(["cover", "summary", "section", "section", "section"]);
    expect(frames.some((f) => f.event === "section" && f.data.content.includes("Body text"))).toBe(true);
    const done = frames.find((f) => f.event === "done")!.data;
    expect(done).toMatchObject({ pages: 3, words: 1200 });
    expect(llm.complete.mock.calls.length).toBeLessThanOrEqual(CALL_CAPS.short);
  });

  it("short: one light research pass when the brief asks for facts", async () => {
    setupModels({ sections: 3 });
    const { result } = await run(request("short", "Latest solar panel prices in 2025"));
    expect(result.status).toBe("done");
    expect(engine.kemmaExecute).toHaveBeenCalledTimes(1);
    expect(engine.kemmaExecute.mock.calls[0][0].allowedTools).toEqual(["web_search", "browse"]);
  });

  it("medium: research per section in batches of at most 3, references section built from notes", async () => {
    setupModels({ sections: 5 });
    let active = 0;
    let peak = 0;
    const impl = engine.kemmaExecute.getMockImplementation()!;
    engine.kemmaExecute.mockImplementation(async (input: unknown) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return impl(input);
    });
    const { frames, result } = await run(request("medium"));
    expect(result.status).toBe("done");
    expect(engine.kemmaExecute).toHaveBeenCalledTimes(5);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
    const report = frames.find((f) => f.event === "report")!.data;
    const refs = report.sections.find((s: any) => s.type === "references");
    expect(refs.content).toContain("IEA Report");
    expect(refs.content).toContain("https://iea.example/report");
    expect(refs.style).toBe("ieee");
    // the note with a url the tools never returned is dropped
    expect(refs.content).not.toContain("Made Up");
    expect(frames.filter((f) => f.event === "source")).toHaveLength(1);
    const order = names(frames).filter((e) => ["stage", "outline", "section", "report", "done"].includes(e));
    expect(order.indexOf("outline")).toBeLessThan(order.indexOf("section"));
    expect(order[order.length - 1]).toBe("done");
    expect(order[order.length - 2]).toBe("report");
  });

  it("academic: abstract block instead of summary, references present", async () => {
    setupModels({ sections: 7 });
    const { frames, result } = await run(request("academic"));
    expect(result.status).toBe("done");
    const report = frames.find((f) => f.event === "report")!.data;
    const types = report.sections.map((s: any) => s.type);
    expect(types[0]).toBe("cover");
    expect(types[1]).toBe("abstract");
    expect(types).not.toContain("summary");
    expect(types[types.length - 1]).toBe("references");
    expect(report.sections[1].content).toBe("An abstract.");
  });
});

describe("progress", () => {
  it("never decreases, stays within 0..1 and ends at 1", async () => {
    setupModels({ sections: 5 });
    const { frames } = await run(request("medium"));
    const values = frames.filter((f) => f.event === "progress").map((f) => f.data.progress as number);
    expect(values.length).toBeGreaterThan(3);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(values[values.length - 1]).toBe(1);
  });

  it("weights match the brief and the eta is null until there is data", () => {
    expect(STAGE_WEIGHTS.medium).toMatchObject({ planning: 0.05, researching: 0.35, writing: 0.45, checking: 0.05, assembling: 0.1 });
    let t = 0;
    const seen: Array<{ progress: number; etaSeconds: number | null }> = [];
    const tracker = new ProgressTracker("medium", (p) => seen.push(p), () => t);
    tracker.set("planning", 1);
    expect(seen[0].etaSeconds).toBeNull();
    t = 20_000;
    tracker.set("researching", 1);
    expect(seen[1].progress).toBe(0.4);
    expect(seen[1].etaSeconds).toBe(30);
    tracker.set("planning", 1); // going backwards is ignored
    expect(seen).toHaveLength(2);
  });
});

describe("abort and caps", () => {
  it("abort stops further model calls and sends nothing more", async () => {
    setupModels({ sections: 5 });
    const controller = new AbortController();
    let writes = 0;
    llm.complete.mockImplementation(async (messages: Array<{ content: string }>, o: { purpose: string }) => {
      if (o.purpose === "documents:plan") return { text: outlineJson(5), model: "m", provider: "x", inputTokens: 1, outputTokens: 1 };
      writes++;
      if (writes === 2) controller.abort();
      return { text: "body", model: "m", provider: "x", inputTokens: 1, outputTokens: 1 };
    });
    const { frames, result } = await run(request("short"), { signal: controller.signal });
    expect(result.status).toBe("aborted");
    const callsAtAbort = llm.complete.mock.calls.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(llm.complete.mock.calls.length).toBe(callsAtAbort);
    expect(names(frames)).not.toContain("report");
    expect(names(frames)).not.toContain("done");
    expect(names(frames)).not.toContain("error");
  });

  it("an already aborted signal makes no calls", async () => {
    setupModels();
    const c = new AbortController();
    c.abort();
    const { result } = await run(request("medium"), { signal: c.signal });
    expect(result.status).toBe("aborted");
    expect(llm.complete).not.toHaveBeenCalled();
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
  });

  it("a hanging engine call is abandoned on abort", async () => {
    setupModels({ sections: 5 });
    engine.kemmaExecute.mockImplementation(() => new Promise(() => {}));
    const c = new AbortController();
    setTimeout(() => c.abort(), 20);
    const { result } = await run(request("medium"), { signal: c.signal });
    expect(result.status).toBe("aborted");
  });

  it("hitting the call cap (a retried write used the spare call) gives a partial report and a user-safe error", async () => {
    setupModels({ sections: 3 });
    const real = llm.complete.getMockImplementation()!;
    let writeAttempts = 0;
    llm.complete.mockImplementation(async (m: Array<{ content: string }>, o: { purpose: string }) => {
      if (o.purpose === "documents:section" && [1, 3].includes(++writeAttempts)) throw new Error("provider hiccup");
      return real(m, o);
    });
    // cap 4: plan (1), outline trimmed to 2 sections, write 1 fails and is retried (2, 3), write 2 fails (4) and its retry has no call left
    const { frames, result } = await run(request("short"), { callCap: 4 });
    expect(result.status).toBe("partial");
    expect(names(frames).slice(-2)).toEqual(["report", "error"]);
    const report = frames.find((f) => f.event === "report")!.data;
    expect(report.sections.filter((s: any) => s.type === "section")).toHaveLength(1);
    expect(frames.find((f) => f.event === "error")!.data.message).toMatch(/limit/i);
    expect(llm.complete.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("hitting the wall-time cap gives a partial report", async () => {
    setupModels({ sections: 4 });
    llm.complete.mockImplementation(async (messages: Array<{ content: string }>, o: { signal?: AbortSignal; purpose: string }) => {
      if (o.purpose === "documents:plan") return { text: outlineJson(4), model: "m", provider: "x", inputTokens: 1, outputTokens: 1 };
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 30);
        o.signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); });
      });
      return { text: "body", model: "m", provider: "x", inputTokens: 1, outputTokens: 1 };
    });
    const { frames, result } = await run(request("short"), { timeCapMs: 80 });
    expect(result.status).toBe("partial");
    expect(frames.find((f) => f.event === "error")!.data.message).toMatch(/time limit/i);
    expect(names(frames)).toContain("report");
  });

  it("short never exceeds its call cap even with a long outline", async () => {
    setupModels({ sections: 5 });
    const { result } = await run(request("short", "Latest 2025 solar prices"));
    expect(result.status).toBe("done");
    expect(llm.complete.mock.calls.length + engine.kemmaExecute.mock.calls.length).toBeLessThanOrEqual(CALL_CAPS.short);
  });
});

describe("planning failures", () => {
  it("bad outline JSON is retried once and then ends with a clean error", async () => {
    setupModels();
    llm.complete.mockResolvedValue({ text: "sorry, here you go: not json", model: "m", provider: "x", inputTokens: 1, outputTokens: 1 });
    const { frames, result } = await run(request("medium"));
    expect(result.status).toBe("failed");
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(llm.complete.mock.calls[1][0][1].content).toMatch(/not valid JSON/);
    expect(names(frames)).not.toContain("outline");
    expect(names(frames)[names(frames).length - 1]).toBe("error");
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
  });

  it("recovers when the second planner reply is valid", async () => {
    setupModels({ sections: 3 });
    const real = llm.complete.getMockImplementation()!;
    let first = true;
    llm.complete.mockImplementation(async (m: Array<{ content: string }>, o: unknown) => {
      if (first) { first = false; return { text: "```json\n{ broken", model: "m", provider: "x", inputTokens: 1, outputTokens: 1 }; }
      return real(m, o);
    });
    const { result } = await run(request("short"));
    expect(result.status).toBe("done");
  });
});

describe("sources, safety", () => {
  it("forwards source notices once and emits a source event per used source", async () => {
    setupModels({ sections: 3 });
    sources.ingestSources.mockImplementation(async (a: { onNotice?: (m: string) => void }) => {
      a.onNotice?.("Could not read https://x.example");
      return { context: "SOURCE TEXT", used: [{ id: "src1", title: "My notes", kind: "file" }, { id: "src2", title: "Page", url: "https://p.example", kind: "url" }], notices: ["Could not read https://x.example", "Skipped big.pdf"] };
    });
    const { frames } = await run(request("short"));
    const notices = frames.filter((f) => f.event === "notice").map((f) => f.data.message);
    expect(notices).toEqual(["Could not read https://x.example", "Skipped big.pdf"]);
    expect(frames.filter((f) => f.event === "source").map((f) => f.data.title)).toEqual(["My notes", "Page"]);
  });

  it("refuses a blocked brief before any model call", async () => {
    setupModels();
    const { frames, result } = await run(request("short", "write a sexual story about a 12 year old"));
    expect(result.status).toBe("failed");
    expect(llm.complete).not.toHaveBeenCalled();
    expect(engine.kemmaExecute).not.toHaveBeenCalled();
    expect(sources.ingestSources).not.toHaveBeenCalled();
    expect(frames.find((f) => f.event === "error")).toBeTruthy();
  });
});

describe("citations", () => {
  function citingWriter() {
    const real = llm.complete.getMockImplementation()!;
    llm.complete.mockImplementation(async (m: Array<{ content: string }>, o: { purpose: string }) => {
      if (o.purpose === "documents:section") return { text: "Solar grew quickly [1]. More follows.", model: "m", provider: "x", inputTokens: 1, outputTokens: 1 };
      return real(m, o);
    });
  }

  it("academic APA: stable [n] while writing, author-year after rendering, final check says rendered", async () => {
    setupModels({ sections: 7 });
    citingWriter();
    const { frames, result } = await run(request("academic"));
    expect(result.status).toBe("done");
    // draft previews keep the stable marker
    expect(frames.find((f) => f.event === "section")!.data.content).toContain("[1]");
    const report = frames.find((f) => f.event === "report")!.data;
    const body = report.sections.filter((s: any) => s.type === "section");
    expect(body.length).toBe(7);
    for (const sec of body) {
      expect(sec.content).not.toMatch(/\[1\]/);
      expect(sec.content).toMatch(/\(.*IEA.*\)/);
    }
    expect(report.sections.find((s: any) => s.type === "references").style).toBe("apa");
    const lastCheck = kinds.qualityChecks.mock.calls[kinds.qualityChecks.mock.calls.length - 1][0];
    expect(lastCheck).toMatchObject({ kind: "academic", rendered: true, style: "apa" });
    expect(lastCheck.outline.sections.length).toBeGreaterThanOrEqual(7);
    // the first check ran on stable markers
    expect(kinds.qualityChecks.mock.calls[0][0].rendered).toBeUndefined();
  });

  it("medium IEEE keeps numbered markers and lists references in citation order", async () => {
    setupModels({ sections: 5 });
    citingWriter();
    const { frames } = await run(request("medium"));
    const report = frames.find((f) => f.event === "report")!.data;
    expect(report.sections.find((s: any) => s.id === "s1").content).toContain("[1]");
    expect(report.sections.find((s: any) => s.type === "references").content).toMatch(/^\[1\]/);
  });

  it("writers receive notes that already carry their final reference number", async () => {
    setupModels({ sections: 5 });
    const seen: string[] = [];
    const real = llm.complete.getMockImplementation()!;
    llm.complete.mockImplementation(async (m: Array<{ content: string }>, o: { purpose: string }) => {
      if (o.purpose === "documents:section") seen.push(m.map((x) => x.content).join("\n"));
      return real(m, o);
    });
    await run(request("medium"));
    expect(seen.length).toBe(5);
    expect(seen.every((t) => /\[1\]/.test(t) && t.includes("Solar grew."))).toBe(true);
  });
});

describe("planner refusal", () => {
  it("an unsafe-brief refusal from the planner ends the run without another model call", async () => {
    setupModels();
    llm.complete.mockResolvedValue({ text: '{"refused": true}', model: "m", provider: "x", inputTokens: 1, outputTokens: 1 });
    const { frames, result } = await run(request("medium"));
    expect(result.status).toBe("failed");
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(frames[frames.length - 1]).toMatchObject({ event: "error", data: { message: "I can't help with that." } });
  });
});

describe("quality repair", () => {
  it("repairs only the failing section, once", async () => {
    setupModels({ sections: 5 });
    kinds.qualityChecks
      .mockReturnValueOnce({ ok: false, problems: ['Section "Part 2" is too thin.'], words: 500, pages: 1 })
      .mockReturnValue({ ok: true, problems: [], words: 900, pages: 2 });
    const { frames } = await run(request("medium"));
    const sections = frames.filter((f) => f.event === "section" && f.data.id === "s2");
    expect(sections).toHaveLength(2);
    expect(frames.filter((f) => f.event === "section" && f.data.id === "s1")).toHaveLength(1);
    expect(frames.filter((f) => f.event === "section" && f.data.id === "s3")).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("parseGenerateRequest validates the body", () => {
    expect(() => parseGenerateRequest({ kind: "short" })).toThrow(/Describe/);
    expect(() => parseGenerateRequest({ brief: "x", kind: "epic" })).toThrow(/short, medium or academic/);
    expect(() => parseGenerateRequest({ brief: "x".repeat(8001), kind: "short" })).toThrow(/too long/);
    expect(() => parseGenerateRequest({ brief: "x", kind: "short", sources: { urls: Array(9).fill("https://a.example") } })).toThrow(/Up to 8/);
    expect(() => parseGenerateRequest({ brief: "x", kind: "short", sources: { html: [{}, {}, {}, {}] } })).toThrow(/Up to 3/);
    const ok = parseGenerateRequest({ brief: " hi ", kind: "academic", style: "ieee", theme: "bad theme!", sources: { urls: ["https://a.example"] } });
    expect(ok).toMatchObject({ brief: "hi", kind: "academic", style: "ieee", theme: "corporate" });
    expect(parseGenerateRequest({ brief: "x", kind: "medium" }).style).toBe("ieee");
    expect(parseGenerateRequest({ brief: "x", kind: "academic" }).style).toBe("apa");
  });

  it("fitSections keeps the opening and the closing sections", () => {
    const s = ["a", "b", "c", "d", "e"].map((id) => ({ id, title: id, purpose: "", researchQuestions: [], targetWords: 1, type: "section" }));
    expect(fitSections(s, 3).map((x) => x.id)).toEqual(["a", "b", "e"]);
    expect(fitSections(s, 1).map((x) => x.id)).toEqual(["a"]);
    expect(fitSections(s, 9)).toHaveLength(5);
  });

  it("extractNotes keeps only notes the tools or the person can vouch for", () => {
    const output: any = {
      response: JSON.stringify({ notes: [
        { claim: "a", sourceTitle: "Tool Page", url: "https://t.example/a" },
        { claim: "b", sourceTitle: "Mine", url: "https://invented.example" },
        { claim: "c", sourceTitle: "Ghost", url: "https://ghost.example" },
        { claim: "d", sourceTitle: "Tool Page" },
      ] }),
      sources: [{ id: 1, url: "https://t.example/a/", title: "Tool Page" }],
    };
    const notes = extractNotes(output, ["mine"], new Set());
    expect(notes.map((n) => n.claim)).toEqual(["a", "b", "d"]);
    expect(notes[0].url).toBe("https://t.example/a");
    expect(notes[1].url).toBeUndefined();
  });
});
