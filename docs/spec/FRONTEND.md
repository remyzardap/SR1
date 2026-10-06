# Track F: frontend work packages

Companion to [`END_GOAL.md`](END_GOAL.md) §Track F (the outline) and [`AGENT_OPS.md`](AGENT_OPS.md) (how packages are dispatched).
Each package here is a full spec. F packages target `develop`, change no server code, and ship with no visible
change unless the spec says so. Rules from `README.md` and `HANDOVER.md` apply.

---

## F-01 Typed SSE client: one parser and one reducer for every chat event

**Why:** `client/src/pages/Chat.tsx` (≈ lines 98–115 and 526–596 on `develop`) parses the stream with a small
helper that keeps only the last `data:` line, then handles each event in a 70-line `if/else` chain inside
`sendMessage`, with ad-hoc `JSON.parse` calls that throw on bad data. The backend is about to add events
(`meta`, `thinking`, `segment`, `tool_end`, `approval_request`: PHASE-1 P1-03 and P1-11). Each would add
another branch. F-02 to F-04 need the stream as plain, testable state instead.

**Depends on:** nothing. P1-03 is not merged yet. F-01 decodes its events ahead of time, so they work the day it lands.

**Files**
- create `client/src/lib/sse.ts`, `client/src/lib/sse.test.ts`
- create `client/src/lib/streamReducer.ts`, `client/src/lib/streamReducer.test.ts`
- edit `client/src/pages/Chat.tsx` (the parser and the event loop only; move `AgentStep` and `Source` types out)
- nothing else

**Spec**

1. `sse.ts`, the wire format:
   - `createSseParser()` returns `{ push(chunk: string): RawSseEvent[]; flush(): RawSseEvent[] }`, where
     `RawSseEvent = { event: string; data: string }`. It keeps its own buffer, so the caller just pushes decoded text.
   - Follow the SSE rules: events end at a blank line; accept `\n`, `\r\n` and `\r`; a `data:` line may have no space
     after the colon; **several `data:` lines join with `\n`**; lines starting with `:` are comments; `event` defaults
     to `"message"`; an event with no data lines is dropped. `flush()` emits a final event left without a trailing blank line.
   - `decodeEvent(raw: RawSseEvent): StreamEvent | null` turns a raw event into a typed one. It **never throws**:
     malformed JSON or a wrong shape gives `null` (and a `console.debug`). Unknown event names give `null`.
   - `StreamEvent` is a discriminated union on `type`. Today's events keep their exact current meaning:

     | event | data | decoded |
     |---|---|---|
     | `token` | JSON string, or raw text if not JSON | `{ type: "token", text }` |
     | `agent` | anything | `{ type: "agent" }` |
     | `model` | `{ step?, label? }` | `{ type: "model", label? }` |
     | `tool_start` | `{ tool?, id? }` | `{ type: "tool_start", tool, id? }` (tool defaults to `"tool"`) |
     | `activity` | `ActivityItem` (from `components/ActivityFeed`) | `{ type: "activity", item }` (needs `id`, `label`, `status`, `kind`) |
     | `skill` | `{ id: number, name: string }` | `{ type: "skill", skill }` |
     | `quota_warn` | `{ message? }` | `{ type: "quota_warn", message? }` |
     | `notice` | `{ message? }` | `{ type: "notice", message? }` |
     | `sources` | `Source[]` | `{ type: "sources", sources }` (non-array gives `[]`; drop items without a string `url`) |
     | `usage` | `{ inputTokens?, outputTokens?, totalTokens? }` | `{ type: "usage", usage }` (missing numbers are 0) |
     | `done` | a model string, `{ model? }`, or empty | `{ type: "done", model? }` |
     | `error` | JSON string, or raw text | `{ type: "error", message }` |

     Upcoming events (P1-03, P1-11), decoded now and kept in state only. **F-01 renders none of them.**

     | event | data | decoded |
     |---|---|---|
     | `meta` | `{ protocol: number, runId: string, sessionId? }` | `{ type: "meta", protocol, runId, sessionId? }` |
     | `thinking` | JSON string delta | `{ type: "thinking", text }` |
     | `segment` | `{ kind: "narration" \| "answer" }` | `{ type: "segment", kind }` |
     | `tool_end` | `{ tool?, id?, ok?, durationMs? }` | `{ type: "tool_end", tool, id?, ok?, durationMs? }` |
     | `approval_request` | `{ id, tool, title, preview, args, expiresAt }` | `{ type: "approval_request", approval }` |

2. `streamReducer.ts`, the state (pure functions, no React):
   - `StreamState`: `content` (all streamed text, as today), `segments: { kind; end }[]` (one entry per `segment`
     event, where `end` is `content.length` when it arrived, so F-02 can mark narration), `thinking`, `steps: AgentStep[]`,
     `activity: ActivityItem[]`, `skills`, `sources: Source[] | null` (null = never received), `usage | null`,
     `model?`, `meta?`, `approvals[]`, `currentStep: string | null`, `error: string | null`, `done: boolean`.
   - `initialStreamState()` and `reduceStream(state, event): StreamState`. Never mutate the input. Return the same
     object when nothing changed.
   - Rules that match today's behaviour exactly:
     - `token`: append to `content`.
     - `agent`, `model`: `currentStep = "Working on your request…"`; `model` also sets `model = label` when present.
     - `tool_start`: push step `{ label: "Run <tool>", detail: tool }` and set `currentStep` to that label. Step ids come from a counter in state (`step-1`, `step-2`, …), not `crypto.randomUUID()`, so tests are deterministic.
     - `activity`: upsert by `id` (merge into the existing item). If `status === "running"` and `kind !== "write"`, set `currentStep` to `label` or `"label: detail"`.
     - `skill`: append. `notice` with a message: push a step with that label.
     - `sources`: replace. `usage`: replace. `done`: `done = true`, `model = model ?? state.model`.
     - `error`: `error = message`. The caller still throws it, exactly as today.
     - `quota_warn`: no state change. It's a side effect the caller handles (step 3).
     - New events: `meta` sets `meta`; `thinking` appends (cap at 20 000 characters, keeping the start); `segment` pushes `{ kind, end }`; `tool_end` marks the matching step done (by `id`, else the last step with that tool) by setting `active: false`; `approval_request` appends to `approvals`.
   - Export `AgentStep` and `Source` from here (moved out of `Chat.tsx`).

3. `Chat.tsx`:
   - Delete `parseSseChunk`. In `sendMessage`, keep one `StreamState` in a local variable. For each decoded event:
     `next = reduceStream(state, ev)`, then push only what changed into the existing React setters
     (`setMessages` for content and sources, `setAgentSteps`, `setActivity`, `setUsedSkills`, `setSources`,
     `setUsage`, `setCurrentStep`). Keep `finalModel` coming from `state.model`.
   - Side effects stay in `Chat.tsx`, in one small `switch` after the reducer: `quota_warn` → `toast.warning`;
     `error` → `throw new Error(message)` (the existing `catch` handles it unchanged).
   - Call `flush()` when the reader reports `done`. Today a last event without a trailing blank line is lost.
   - The deep-research path (`/api/fn/research`) uses the same loop. It already does, so keep it that way.
   - Everything else in `sendMessage` (abort controller, offline handling, memory extraction, final `setMessages`)
     stays exactly as it is.

**Tests** (vitest, style of `client/src/lib/attachments.test.ts`):
- `sse.test.ts`: one fixture stream containing every event in both tables; the same stream re-chunked into random
  1 to 7 character pieces (fixed seed, 50 rounds) gives identical events; `\r\n` line endings; two `data:` lines joined
  with `\n`; comment lines ignored; `data:` with no space; final event emitted by `flush()`; `decodeEvent` returns
  `null` (doesn't throw) for unknown names, malformed JSON and wrong shapes; `token` with raw non-JSON text.
- `streamReducer.test.ts`: each rule above, one test each; feeding today's typical sequence (`agent`, `model`,
  `tool_start`, `activity` running then done, `token` × n, `sources`, `usage`, `done`) produces the expected state;
  inputs are never mutated (freeze them); unchanged events return the same object; `thinking` cap; `segment` offsets;
  `tool_end` matching by id and by tool name.

**Acceptance criteria**
- AC1: `npm run check` and `npm test` pass. The new tests cover every row of both tables.
- AC2: No visible change. A normal chat, a chat that uses tools, and a deep-research run look the same as before. The PR
  body lists these three manual checks with what was seen.
- AC3: `Chat.tsx` contains no `JSON.parse` of stream data and no `if (event === ...)` chain. Stream handling lives in the two new modules.
- AC4: Diff limited to the five files listed under Files.

**Size:** M. **Lane:** F. **Builder:** agy.
