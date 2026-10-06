import { describe, expect, it } from "vitest";
import {
  initialStreamState,
  reduceStream,
  type StreamState,
} from "./streamReducer";

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze((obj as Record<string, unknown>)[key]);
  }
  return obj;
}

describe("streamReducer", () => {
  it("initializes to the expected clean state", () => {
    const state = initialStreamState();
    expect(state).toEqual({
      content: "",
      segments: [],
      thinking: "",
      steps: [],
      activity: [],
      skills: [],
      sources: null,
      usage: null,
      approvals: [],
      currentStep: null,
      error: null,
      done: false,
      stepCounter: 0,
    });
  });

  it("handles token by appending to content and leaves unchanged on empty token", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(reduceStream(s0, { type: "token", text: "Hello " }));
    expect(s1.content).toBe("Hello ");

    const s2 = deepFreeze(reduceStream(s1, { type: "token", text: "world!" }));
    expect(s2.content).toBe("Hello world!");

    const s3 = reduceStream(s2, { type: "token", text: "" });
    expect(s3).toBe(s2);
  });

  it("handles agent by setting currentStep and returns same state if unchanged", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(reduceStream(s0, { type: "agent" }));
    expect(s1.currentStep).toBe("Working on your request…");

    const s2 = reduceStream(s1, { type: "agent" });
    expect(s2).toBe(s1);
  });

  it("handles model by setting currentStep and model if present", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(reduceStream(s0, { type: "model", label: "gpt-4o" }));
    expect(s1.currentStep).toBe("Working on your request…");
    expect(s1.model).toBe("gpt-4o");

    const s2 = reduceStream(s1, { type: "model", label: "gpt-4o" });
    expect(s2).toBe(s1);

    const s3 = deepFreeze(reduceStream(s1, { type: "model" }));
    expect(s3.model).toBe("gpt-4o");
    expect(s3).toBe(s1);
  });

  it("handles tool_start with deterministic step ids and currentStep", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(reduceStream(s0, { type: "tool_start", tool: "web_search" }));
    expect(s1.currentStep).toBe("Run web_search");
    expect(s1.steps).toEqual([
      { id: "step-1", label: "Run web_search", detail: "web_search" },
    ]);

    const s2 = deepFreeze(reduceStream(s1, { type: "tool_start", tool: "browse" }));
    expect(s2.currentStep).toBe("Run browse");
    expect(s2.steps).toEqual([
      { id: "step-1", label: "Run web_search", detail: "web_search" },
      { id: "step-2", label: "Run browse", detail: "browse" },
    ]);

    // tool_start with custom id
    const s3 = deepFreeze(reduceStream(s2, { type: "tool_start", tool: "custom_tool", id: "call_abc" }));
    expect(s3.steps[2]).toEqual({ id: "call_abc", label: "Run custom_tool", detail: "custom_tool" });
  });

  it("handles activity by upserting by id and updating currentStep when running", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(
      reduceStream(s0, {
        type: "activity",
        item: { id: "a1", kind: "search", status: "running", label: "Searching", detail: "query terms" },
      })
    );
    expect(s1.activity).toHaveLength(1);
    expect(s1.currentStep).toBe("Searching: query terms");

    // Upsert merge
    const s2 = deepFreeze(
      reduceStream(s1, {
        type: "activity",
        item: { id: "a1", kind: "search", status: "done", label: "Searching" },
      })
    );
    expect(s2.activity).toHaveLength(1);
    expect(s2.activity[0].status).toBe("done");
    // status is done, so currentStep should not be updated by it
    expect(s2.currentStep).toBe("Searching: query terms");

    // Running activity with kind === 'write' does NOT update currentStep
    const s3 = deepFreeze(
      reduceStream(s2, {
        type: "activity",
        item: { id: "a2", kind: "write", status: "running", label: "Writing file" },
      })
    );
    expect(s3.activity).toHaveLength(2);
    expect(s3.currentStep).toBe("Searching: query terms");

    // Running activity without detail
    const s4 = deepFreeze(
      reduceStream(s3, {
        type: "activity",
        item: { id: "a3", kind: "read", status: "running", label: "Reading page" },
      })
    );
    expect(s4.currentStep).toBe("Reading page");
  });

  it("handles skill by appending to skills", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(reduceStream(s0, { type: "skill", skill: { id: 1, name: "Web" } }));
    expect(s1.skills).toEqual([{ id: 1, name: "Web" }]);

    const s2 = deepFreeze(reduceStream(s1, { type: "skill", skill: { id: 2, name: "Doc" } }));
    expect(s2.skills).toEqual([
      { id: 1, name: "Web" },
      { id: 2, name: "Doc" },
    ]);
  });

  it("handles notice by pushing a step with its label", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(reduceStream(s0, { type: "notice", message: "Notice message" }));
    expect(s1.steps).toEqual([{ id: "step-1", label: "Notice message" }]);

    // Notice without message is a no-op
    const s2 = reduceStream(s1, { type: "notice" });
    expect(s2).toBe(s1);
  });

  it("handles sources by replacing sources", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(
      reduceStream(s0, {
        type: "sources",
        sources: [{ title: "Source 1", url: "https://example.com" }],
      })
    );
    expect(s1.sources).toEqual([{ title: "Source 1", url: "https://example.com" }]);

    const s2 = deepFreeze(reduceStream(s1, { type: "sources", sources: [] }));
    expect(s2.sources).toEqual([]);
  });

  it("handles usage by replacing usage", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(
      reduceStream(s0, {
        type: "usage",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      })
    );
    expect(s1.usage).toEqual({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });
  });

  it("handles done by marking done = true and resolving model", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(reduceStream(s0, { type: "model", label: "initial-model" }));

    // done without model keeps existing model
    const s2 = deepFreeze(reduceStream(s1, { type: "done" }));
    expect(s2.done).toBe(true);
    expect(s2.model).toBe("initial-model");

    // done with model overrides model
    const s3 = deepFreeze(reduceStream(s1, { type: "done", model: "final-model" }));
    expect(s3.done).toBe(true);
    expect(s3.model).toBe("final-model");

    // Redundant done returns same state
    const s4 = reduceStream(s3, { type: "done", model: "final-model" });
    expect(s4).toBe(s3);
  });

  it("handles error by setting error message", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(reduceStream(s0, { type: "error", message: "Boom" }));
    expect(s1.error).toBe("Boom");

    const s2 = reduceStream(s1, { type: "error", message: "Boom" });
    expect(s2).toBe(s1);
  });

  it("handles quota_warn as a no-op side effect", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = reduceStream(s0, { type: "quota_warn", message: "Low credits" });
    expect(s1).toBe(s0);
  });

  it("handles meta by setting meta object", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(
      reduceStream(s0, {
        type: "meta",
        protocol: 1,
        runId: "run-42",
        sessionId: "sess-99",
      })
    );
    expect(s1.meta).toEqual({ protocol: 1, runId: "run-42", sessionId: "sess-99" });
  });

  it("handles thinking by appending up to a 20 000 character cap, keeping the start", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(reduceStream(s0, { type: "thinking", text: "Think 1. " }));
    expect(s1.thinking).toBe("Think 1. ");

    // Fill to near 20000
    const nearCapText = "A".repeat(19990 - s1.thinking.length);
    const s2 = deepFreeze(reduceStream(s1, { type: "thinking", text: nearCapText }));
    expect(s2.thinking.length).toBe(19990);

    // Append 20 "B"s -> total would be 20010, should cap at 20000 keeping the start
    const s3 = deepFreeze(reduceStream(s2, { type: "thinking", text: "B".repeat(20) }));
    expect(s3.thinking.length).toBe(20000);
    expect(s3.thinking.endsWith("BBBBBBBBBB")).toBe(true);

    // Any further thinking delta is ignored and returns same object
    const s4 = reduceStream(s3, { type: "thinking", text: "More thoughts" });
    expect(s4).toBe(s3);
  });

  it("handles segment by recording kind and end offset matching content length", () => {
    let state = deepFreeze(initialStreamState());
    state = deepFreeze(reduceStream(state, { type: "token", text: "Part 1" }));
    state = deepFreeze(reduceStream(state, { type: "segment", kind: "narration" }));
    expect(state.segments).toEqual([{ kind: "narration", end: 6 }]);

    state = deepFreeze(reduceStream(state, { type: "token", text: " - Part 2" }));
    state = deepFreeze(reduceStream(state, { type: "segment", kind: "answer" }));
    expect(state.segments).toEqual([
      { kind: "narration", end: 6 },
      { kind: "answer", end: 15 },
    ]);
  });

  it("handles tool_end matching by id and by tool name", () => {
    let state = deepFreeze(initialStreamState());
    // Create steps
    state = deepFreeze(reduceStream(state, { type: "tool_start", tool: "web_search", id: "search_1" }));
    state = deepFreeze(reduceStream(state, { type: "tool_start", tool: "browse" }));
    state = deepFreeze(reduceStream(state, { type: "tool_start", tool: "browse" }));

    // Match by id
    state = deepFreeze(reduceStream(state, { type: "tool_end", id: "search_1" }));
    expect(state.steps[0].active).toBe(false);

    // Match by tool name matches the LAST step with that tool (index 2, not 1)
    state = deepFreeze(reduceStream(state, { type: "tool_end", tool: "browse" }));
    expect(state.steps[1].active).toBeUndefined();
    expect(state.steps[2].active).toBe(false);

    // Redundant tool_end on already inactive step returns same object
    const unchanged = reduceStream(state, { type: "tool_end", id: "search_1" });
    expect(unchanged).toBe(state);

    // tool_end with no matching step returns same object
    const notFound = reduceStream(state, { type: "tool_end", id: "non_existent" });
    expect(notFound).toBe(state);
  });

  it("handles approval_request by appending to approvals", () => {
    const s0 = deepFreeze(initialStreamState());
    const s1 = deepFreeze(
      reduceStream(s0, {
        type: "approval_request",
        approval: {
          id: "appr-1",
          tool: "send_email",
          title: "Send Email",
          preview: "To: user@example.com",
        },
      })
    );
    expect(s1.approvals).toEqual([
      {
        id: "appr-1",
        tool: "send_email",
        title: "Send Email",
        preview: "To: user@example.com",
      },
    ]);
  });

  it("produces expected state for today's typical stream sequence", () => {
    let state = deepFreeze(initialStreamState());

    // Typical sequence: agent, model, tool_start, activity running then done, token × n, sources, usage, done
    state = deepFreeze(reduceStream(state, { type: "agent" }));
    expect(state.currentStep).toBe("Working on your request…");

    state = deepFreeze(reduceStream(state, { type: "model", label: "gpt-4o" }));
    expect(state.model).toBe("gpt-4o");

    state = deepFreeze(reduceStream(state, { type: "tool_start", tool: "web_search" }));
    expect(state.currentStep).toBe("Run web_search");
    expect(state.steps).toEqual([{ id: "step-1", label: "Run web_search", detail: "web_search" }]);

    state = deepFreeze(
      reduceStream(state, {
        type: "activity",
        item: { id: "act-1", kind: "search", status: "running", label: "Searching", detail: "weather" },
      })
    );
    expect(state.currentStep).toBe("Searching: weather");

    state = deepFreeze(
      reduceStream(state, {
        type: "activity",
        item: { id: "act-1", kind: "search", status: "done", label: "Searching" },
      })
    );
    expect(state.activity[0].status).toBe("done");

    state = deepFreeze(reduceStream(state, { type: "token", text: "The " }));
    state = deepFreeze(reduceStream(state, { type: "token", text: "weather " }));
    state = deepFreeze(reduceStream(state, { type: "token", text: "is sunny." }));
    expect(state.content).toBe("The weather is sunny.");

    state = deepFreeze(
      reduceStream(state, {
        type: "sources",
        sources: [{ title: "Weather Forecast", url: "https://weather.test" }],
      })
    );
    expect(state.sources).toEqual([{ title: "Weather Forecast", url: "https://weather.test" }]);

    state = deepFreeze(
      reduceStream(state, {
        type: "usage",
        usage: { inputTokens: 100, outputTokens: 25, totalTokens: 125 },
      })
    );
    expect(state.usage).toEqual({ inputTokens: 100, outputTokens: 25, totalTokens: 125 });

    state = deepFreeze(reduceStream(state, { type: "done" }));
    expect(state.done).toBe(true);
    expect(state.model).toBe("gpt-4o");
    expect(state.error).toBeNull();
  });
});
