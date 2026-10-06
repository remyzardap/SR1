import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readChatStream } from "./llmStream";

const FIXTURES_DIR = path.resolve(__dirname, "__fixtures__/sse");

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
}

function stringToResponse(text: string): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(text));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function chunkedResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(enc.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function splitIntoChunks(text: string, getChunkSize: () => number): string[] {
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  const chunks: string[] = [];
  const dec = new TextDecoder();
  let offset = 0;
  while (offset < bytes.length) {
    const size = Math.min(bytes.length - offset, getChunkSize());
    chunks.push(dec.decode(bytes.subarray(offset, offset + size)));
    offset += size;
  }
  return chunks;
}

describe("llmStream / readChatStream", () => {
  it("parses Qwen tool-call fixture with argument fragments (AC1)", async () => {
    const fixture = loadFixture("qwen-tool-call.txt");
    const res = stringToResponse(fixture);
    const textDeltas: string[] = [];
    const reasoningDeltas: string[] = [];

    const result = await readChatStream(res, {
      onText: (t) => textDeltas.push(t),
      onReasoning: (r) => reasoningDeltas.push(r),
    });

    expect(result.content).toBeNull();
    expect(textDeltas).toEqual([]);
    expect(reasoningDeltas).toEqual([]);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.usage).toEqual({
      input: 35,
      output: 22,
      total: 57,
      cachedInput: 0,
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toEqual({
      id: "call_qwen_123",
      type: "function",
      function: {
        name: "web_search",
        arguments: '{"query":"nickel policy 2026"}',
      },
    });
  });

  it("parses Gemini OpenAI-compat stream fixture with thought signature (AC1)", async () => {
    const fixture = loadFixture("gemini-thought-signature.txt");
    const res = stringToResponse(fixture);

    const result = await readChatStream(res);

    expect(result.content).toBeNull();
    expect(result.finishReason).toBe("tool_calls");
    expect(result.usage).toEqual({
      input: 40,
      output: 15,
      total: 55,
      cachedInput: 0,
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toEqual({
      id: "call_gemini_456",
      type: "function",
      function: {
        name: "browse",
        arguments: '{"url":"https://example.com/doc"}',
      },
      extra_content: {
        google: {
          thought_signature: "gemini_thought_sig_xyz",
        },
      },
    });
  });

  it("parses Perplexity text stream fixture (AC1)", async () => {
    const fixture = loadFixture("perplexity-text.txt");
    const textDeltas: string[] = [];
    const res = stringToResponse(fixture);

    const result = await readChatStream(res, {
      onText: (t) => textDeltas.push(t),
    });

    expect(result.content).toBe("According to market analysts, nickel demand is steady.");
    expect(textDeltas).toEqual(["According", " to market analysts, ", "nickel demand is steady."]);
    expect(result.toolCalls).toBeUndefined();
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({
      input: 18,
      output: 12,
      total: 30,
      cachedInput: 0,
    });
  });

  it("parses Qwen reasoning deltas into onReasoning and keeps content clean (AC1)", async () => {
    const fixture = loadFixture("reasoning-qwen.txt");
    const textDeltas: string[] = [];
    const reasoningDeltas: string[] = [];
    const res = stringToResponse(fixture);

    const result = await readChatStream(res, {
      onText: (t) => textDeltas.push(t),
      onReasoning: (r) => reasoningDeltas.push(r),
    });

    expect(reasoningDeltas).toEqual([
      "Let's analyze the input question.",
      " The user wants to know about nickel.",
    ]);
    expect(textDeltas).toEqual(["Nickel is a transition metal."]);
    expect(result.content).toBe("Nickel is a transition metal.");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({
      input: 10,
      output: 25,
      total: 35,
      cachedInput: 0,
    });
  });

  it("handles OpenRouter-style delta.reasoning", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"reasoning":"Thinking step 1."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");
    const reasoning: string[] = [];
    const text: string[] = [];

    const result = await readChatStream(stringToResponse(sse), {
      onText: (t) => text.push(t),
      onReasoning: (r) => reasoning.push(r),
    });

    expect(reasoning).toEqual(["Thinking step 1."]);
    expect(text).toEqual(["Answer"]);
    expect(result.content).toBe("Answer");
  });

  it("fuzz: produces identical result when split into 1-byte chunks and random 1-7 byte pieces", async () => {
    const fixture = loadFixture("qwen-tool-call.txt");
    const baseline = await readChatStream(stringToResponse(fixture));

    // 1-byte chunks
    const singleByteChunks = splitIntoChunks(fixture, () => 1);
    const singleByteResult = await readChatStream(chunkedResponse(singleByteChunks));
    expect(singleByteResult).toEqual(baseline);

    // Random 1-7 byte pieces across multiple seeds
    let seed = 42;
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let run = 0; run < 5; run++) {
      const randomChunks = splitIntoChunks(fixture, () => Math.floor(pseudoRandom() * 7) + 1);
      const randomResult = await readChatStream(chunkedResponse(randomChunks));
      expect(randomResult).toEqual(baseline);
    }
  });

  it("stops immediately on [DONE] and ignores trailing data", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"First"}}]}\n\n',
      "data: [DONE]\n\n",
      'data: {"choices":[{"delta":{"content":" Trailing"}}]}\n\n',
    ].join("");
    const text: string[] = [];

    const result = await readChatStream(stringToResponse(sse), {
      onText: (t) => text.push(t),
    });

    expect(text).toEqual(["First"]);
    expect(result.content).toBe("First");
  });

  it("handles multiline data: fields within a single event", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":',
      'data: "Split over data lines"}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("\n");
    const text: string[] = [];

    const result = await readChatStream(stringToResponse(sse), {
      onText: (t) => text.push(t),
    });

    expect(text).toEqual(["Split over data lines"]);
    expect(result.content).toBe("Split over data lines");
  });

  it("ignores SSE comments (lines starting with :)", async () => {
    const sse = [
      ": ping comment\n\n",
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      ": another comment\n",
      "data: [DONE]\n\n",
    ].join("");
    const text: string[] = [];

    const result = await readChatStream(stringToResponse(sse), {
      onText: (t) => text.push(t),
    });

    expect(text).toEqual(["Hello"]);
    expect(result.content).toBe("Hello");
  });

  it("falls back to parsing a plain JSON response body when stream=true was ignored", async () => {
    const plainJson = JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Plain JSON completion fallback.",
            tool_calls: [
              {
                id: "call_json_1",
                type: "function",
                function: { name: "safe_files", arguments: '{"action":"list"}' },
              },
            ],
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 8,
        total_tokens: 20,
      },
    });

    const text: string[] = [];
    const res = new Response(plainJson, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const result = await readChatStream(res, {
      onText: (t) => text.push(t),
    });

    expect(text).toEqual(["Plain JSON completion fallback."]);
    expect(result.content).toBe("Plain JSON completion fallback.");
    expect(result.finishReason).toBe("stop");
    expect(result.usage).toEqual({
      input: 12,
      output: 8,
      total: 20,
      cachedInput: 0,
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].id).toBe("call_json_1");
  });

  it("accumulates tool calls by position when index is missing", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"tc_pos_0","type":"function","function":{"name":"tool_a","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"tc_pos_1","type":"function","function":{"name":"tool_b","arguments":"{}"}}]}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const result = await readChatStream(stringToResponse(sse));
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls![0].id).toBe("tc_pos_0");
    expect(result.toolCalls![1].id).toBe("tc_pos_1");
  });

  it("honors abort signal before and during stream reading", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Pre-aborted"));

    await expect(
      readChatStream(stringToResponse("data: [DONE]\n\n"), { signal: controller.signal })
    ).rejects.toThrow("Pre-aborted");

    const liveController = new AbortController();
    const enc = new TextEncoder();
    let streamCtrl!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        streamCtrl = c;
      },
    });
    const res = new Response(stream, { headers: { "Content-Type": "text/event-stream" } });

    const promise = readChatStream(res, {
      signal: liveController.signal,
      onText: () => {
        liveController.abort(new Error("Mid-stream abort"));
      },
    });

    streamCtrl.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"chunk" }}]}\n\n'));

    await expect(promise).rejects.toThrow("Mid-stream abort");
  });
});
