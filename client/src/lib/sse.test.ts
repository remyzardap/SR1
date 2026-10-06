import { describe, expect, it } from "vitest";
import { createSseParser, decodeEvent, type StreamEvent } from "./sse";

const ALL_EVENTS_FIXTURE = [
  'event: token\ndata: "Hello, world!"\n\n',
  "event: agent\ndata: {}\n\n",
  'event: model\ndata: {"step":1,"label":"gpt-4o"}\n\n',
  'event: tool_start\ndata: {"tool":"web_search","id":"call_1"}\n\n',
  'event: activity\ndata: {"id":"act_1","kind":"search","status":"running","label":"Searching web"}\n\n',
  'event: skill\ndata: {"id":1,"name":"Research"}\n\n',
  'event: quota_warn\ndata: {"message":"Approaching quota"}\n\n',
  'event: notice\ndata: {"message":"System update"}\n\n',
  'event: sources\ndata: [{"title":"Doc 1","url":"https://example.com"}]\n\n',
  'event: usage\ndata: {"inputTokens":100,"outputTokens":50,"totalTokens":150}\n\n',
  'event: done\ndata: {"model":"gpt-4o"}\n\n',
  'event: error\ndata: "Something failed"\n\n',
  'event: meta\ndata: {"protocol":1,"runId":"run_123","sessionId":"sess_abc"}\n\n',
  'event: thinking\ndata: "Analyzing context"\n\n',
  'event: segment\ndata: {"kind":"narration"}\n\n',
  'event: tool_end\ndata: {"tool":"web_search","id":"call_1","ok":true,"durationMs":250}\n\n',
  'event: approval_request\ndata: {"id":"appr_1","tool":"send_email","title":"Confirm send","preview":"Email preview"}\n\n',
].join("");

function parseFixture(stream: string): StreamEvent[] {
  const parser = createSseParser();
  const rawEvents = [...parser.push(stream), ...parser.flush()];
  return rawEvents.map((r) => decodeEvent(r)).filter((e): e is StreamEvent => e !== null);
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("SSE wire format parser", () => {
  it("decodes one fixture stream containing every event in both tables", () => {
    const events = parseFixture(ALL_EVENTS_FIXTURE);

    expect(events).toHaveLength(17);
    expect(events[0]).toEqual({ type: "token", text: "Hello, world!" });
    expect(events[1]).toEqual({ type: "agent" });
    expect(events[2]).toEqual({ type: "model", label: "gpt-4o" });
    expect(events[3]).toEqual({ type: "tool_start", tool: "web_search", id: "call_1" });
    expect(events[4]).toEqual({
      type: "activity",
      item: { id: "act_1", kind: "search", status: "running", label: "Searching web" },
    });
    expect(events[5]).toEqual({ type: "skill", skill: { id: 1, name: "Research" } });
    expect(events[6]).toEqual({ type: "quota_warn", message: "Approaching quota" });
    expect(events[7]).toEqual({ type: "notice", message: "System update" });
    expect(events[8]).toEqual({
      type: "sources",
      sources: [{ title: "Doc 1", url: "https://example.com" }],
    });
    expect(events[9]).toEqual({
      type: "usage",
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    expect(events[10]).toEqual({ type: "done", model: "gpt-4o" });
    expect(events[11]).toEqual({ type: "error", message: "Something failed" });
    expect(events[12]).toEqual({
      type: "meta",
      protocol: 1,
      runId: "run_123",
      sessionId: "sess_abc",
    });
    expect(events[13]).toEqual({ type: "thinking", text: "Analyzing context" });
    expect(events[14]).toEqual({ type: "segment", kind: "narration" });
    expect(events[15]).toEqual({
      type: "tool_end",
      tool: "web_search",
      id: "call_1",
      ok: true,
      durationMs: 250,
    });
    expect(events[16]).toEqual({
      type: "approval_request",
      approval: {
        id: "appr_1",
        tool: "send_email",
        title: "Confirm send",
        preview: "Email preview",
      },
    });
  });

  it("produces identical events when re-chunked into random 1 to 7 char pieces (fixed seed, 50 rounds)", () => {
    const baseline = parseFixture(ALL_EVENTS_FIXTURE);

    const rng = seededRandom(123456789);
    for (let round = 0; round < 50; round++) {
      const parser = createSseParser();
      const rawEvents: StreamEvent[] = [];
      let cursor = 0;

      while (cursor < ALL_EVENTS_FIXTURE.length) {
        const chunkSize = 1 + Math.floor(rng() * 7);
        const chunk = ALL_EVENTS_FIXTURE.slice(cursor, cursor + chunkSize);
        cursor += chunkSize;

        for (const raw of parser.push(chunk)) {
          const ev = decodeEvent(raw);
          if (ev) rawEvents.push(ev);
        }
      }

      for (const raw of parser.flush()) {
        const ev = decodeEvent(raw);
        if (ev) rawEvents.push(ev);
      }

      expect(rawEvents).toEqual(baseline);
    }
  });

  it("handles \\r\\n and \\r line endings seamlessly", () => {
    const crlfStream = 'event: token\r\ndata: "hello crlf"\r\n\r\n';
    const crStream = 'event: token\rdata: "hello cr"\r\r';

    expect(parseFixture(crlfStream)).toEqual([{ type: "token", text: "hello crlf" }]);
    expect(parseFixture(crStream)).toEqual([{ type: "token", text: "hello cr" }]);
  });

  it("joins several data: lines with \\n", () => {
    const multilineStream = "event: error\ndata: First line\ndata: Second line\ndata: Third line\n\n";
    const events = parseFixture(multilineStream);

    expect(events).toEqual([{ type: "error", message: "First line\nSecond line\nThird line" }]);
  });

  it("ignores comment lines starting with colon", () => {
    const commentStream = ": this is a comment\nevent: agent\n: another comment\ndata: {}\n\n";
    const events = parseFixture(commentStream);

    expect(events).toEqual([{ type: "agent" }]);
  });

  it("parses data: lines with no space after the colon", () => {
    const noSpaceStream = "event: token\ndata:no_space_token\n\n";
    const events = parseFixture(noSpaceStream);

    expect(events).toEqual([{ type: "token", text: "no_space_token" }]);
  });

  it("emits final event on flush() when trailing blank line is missing", () => {
    const parser = createSseParser();
    const immediate = parser.push('event: token\ndata: "buffered"');
    expect(immediate).toEqual([]);

    const flushed = parser.flush();
    expect(flushed).toEqual([{ event: "token", data: '"buffered"' }]);
  });

  it("drops events with no data lines", () => {
    const parser = createSseParser();
    const events = parser.push("event: ping\n\n");
    expect(events).toEqual([]);
    expect(parser.flush()).toEqual([]);
  });

  it("decodes token with raw non-JSON text", () => {
    const event = decodeEvent({ event: "token", data: "raw text without quotes" });
    expect(event).toEqual({ type: "token", text: "raw text without quotes" });
  });

  it("returns null without throwing for unknown names, malformed JSON, and wrong shapes", () => {
    // Unknown event name
    expect(decodeEvent({ event: "non_existent_event", data: "{}" })).toBeNull();

    // Malformed JSON
    expect(decodeEvent({ event: "model", data: "{malformed json" })).toBeNull();
    expect(decodeEvent({ event: "activity", data: "not a json object" })).toBeNull();
    expect(decodeEvent({ event: "skill", data: "{id: 1}" })).toBeNull();
    expect(decodeEvent({ event: "quota_warn", data: "{bad" })).toBeNull();
    expect(decodeEvent({ event: "notice", data: "bad" })).toBeNull();
    expect(decodeEvent({ event: "sources", data: "bad json" })).toBeNull();
    expect(decodeEvent({ event: "usage", data: "bad json" })).toBeNull();
    expect(decodeEvent({ event: "meta", data: "bad json" })).toBeNull();
    expect(decodeEvent({ event: "thinking", data: "bad json" })).toBeNull();
    expect(decodeEvent({ event: "segment", data: "bad json" })).toBeNull();
    expect(decodeEvent({ event: "tool_end", data: "bad json" })).toBeNull();
    expect(decodeEvent({ event: "approval_request", data: "bad json" })).toBeNull();

    // Wrong shapes
    expect(decodeEvent({ event: "model", data: '{"label": 123}' })).toBeNull();
    expect(decodeEvent({ event: "tool_start", data: '{"tool": 123}' })).toBeNull();
    expect(decodeEvent({ event: "activity", data: '{"id": "act"}' })).toBeNull();
    expect(decodeEvent({ event: "skill", data: '{"id": "not-num", "name": "foo"}' })).toBeNull();
    expect(decodeEvent({ event: "meta", data: '{"protocol": "1", "runId": 2}' })).toBeNull();
    expect(decodeEvent({ event: "segment", data: '{"kind": "invalid_kind"}' })).toBeNull();
    expect(decodeEvent({ event: "tool_end", data: '{"ok": "not-a-bool"}' })).toBeNull();
    expect(decodeEvent({ event: "approval_request", data: '{"id": "1", "tool": 123}' })).toBeNull();
  });

  it("handles done event in all valid variations", () => {
    // Empty data
    expect(decodeEvent({ event: "done", data: "" })).toEqual({ type: "done" });
    // JSON string
    expect(decodeEvent({ event: "done", data: '"gpt-4o"' })).toEqual({ type: "done", model: "gpt-4o" });
    // Object with model
    expect(decodeEvent({ event: "done", data: '{"model":"claude-3-5-sonnet"}' })).toEqual({
      type: "done",
      model: "claude-3-5-sonnet",
    });
    // Object without model
    expect(decodeEvent({ event: "done", data: "{}" })).toEqual({ type: "done" });
    // Raw unquoted string
    expect(decodeEvent({ event: "done", data: "gemini-2.0-flash" })).toEqual({
      type: "done",
      model: "gemini-2.0-flash",
    });
  });

  it("handles sources event edge cases", () => {
    // Non-array gives []
    expect(decodeEvent({ event: "sources", data: "{}" })).toEqual({ type: "sources", sources: [] });
    // Drops items without string url
    expect(
      decodeEvent({
        event: "sources",
        data: JSON.stringify([
          { title: "valid", url: "https://example.com" },
          { title: "missing url" },
          { url: 123 },
          null,
        ]),
      })
    ).toEqual({
      type: "sources",
      sources: [{ title: "valid", url: "https://example.com" }],
    });
  });

  it("sources event keeps the stable ids P1-07 sends, even when they skip numbers", () => {
    expect(
      decodeEvent({
        event: "sources",
        data: JSON.stringify([
          { id: 2, title: "Second", url: "https://b.example.com", snippet: "a quote" },
          { id: 5, title: "Fifth", url: "https://e.example.com" },
          { id: 9, title: "Ninth", url: "https://i.example.com" },
        ]),
      })
    ).toEqual({
      type: "sources",
      sources: [
        { id: 2, title: "Second", url: "https://b.example.com", snippet: "a quote" },
        { id: 5, title: "Fifth", url: "https://e.example.com" },
        { id: 9, title: "Ninth", url: "https://i.example.com" },
      ],
    });
  });

  it("sources event still decodes an item that has no id", () => {
    const decoded = decodeEvent({
      event: "sources",
      data: JSON.stringify([
        { title: "No id", url: "https://a.example.com" },
        { id: 4, title: "With id", url: "https://d.example.com" },
      ]),
    });

    expect(decoded).toEqual({
      type: "sources",
      sources: [
        { title: "No id", url: "https://a.example.com" },
        { id: 4, title: "With id", url: "https://d.example.com" },
      ],
    });
    // A missing id must stay missing: numbering falls back to position, so an `id: undefined`
    // key would be indistinguishable from a real id downstream.
    if (decoded?.type !== "sources") throw new Error("expected a sources event");
    expect(Object.keys(decoded.sources[0])).toEqual(["title", "url"]);
  });
});
