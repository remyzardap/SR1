import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contract tests for the "do not strand a pending service-worker update" guard.
 *
 * The counting logic itself is covered by `activeStreams.test.ts`. What is covered
 * here is the *wiring*, because that is where the shipped bug lived: `Chat.tsx`
 * opened the counter before the plan-card shortcut that returns without streaming,
 * so every "make me a plan" message leaked a count and the update toast's Refresh
 * stopped working for the rest of the session. Neither file can be rendered in this
 * repo (no jsdom or testing-library), so the assertions read the shipped sources and
 * pin the order and the release sites. Editing Chat.tsx or useServiceWorker.ts to
 * break either property fails here.
 */

const CHAT = readFileSync(new URL("../pages/Chat.tsx", import.meta.url), "utf8");
const USE_SW = readFileSync(new URL("../hooks/useServiceWorker.ts", import.meta.url), "utf8");
const SW = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

/** Source of the `{ ... }` block that starts at `openBraceIndex`. */
function blockBody(source: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openBraceIndex + 1, i);
    }
  }
  throw new Error("unbalanced braces");
}

/** Body of the first function/arrow block whose header contains `needle`. */
function bodyOf(source: string, needle: string): string {
  const at = source.indexOf(needle);
  expect(at, `expected to find ${needle} in the source`).toBeGreaterThan(-1);
  return blockBody(source, source.indexOf("{", at));
}

describe("Chat.tsx stream handle wiring", () => {
  it("counts streams through the shared registry, not ad-hoc window events", () => {
    expect(CHAT).toContain('import { beginStream, type StreamHandle } from "@/lib/activeStreams";');
    // The bridge this replaced must not come back: it let the page and the worker
    // disagree about who was counting.
    expect(CHAT).not.toMatch(/notifyStream/);
    expect(CHAT).not.toMatch(/sutaeru:stream-/);
    expect(USE_SW).not.toMatch(/notifyStream|sutaeru:stream-/);
  });

  it("opens the answer stream only after the plan-card shortcut has returned", () => {
    const planBranch = CHAT.indexOf("if (PLAN_REQUEST.test(messageText)");
    const openStream = CHAT.indexOf('beginStream("answer")');
    expect(planBranch).toBeGreaterThan(-1);
    expect(openStream).toBeGreaterThan(-1);
    expect(CHAT.slice(planBranch, openStream)).toContain("return;");
    // The leak was exactly this: anything that increments before the shortcut can
    // never be released, because the shortcut's `return` skips the `finally`.
    expect(CHAT.slice(planBranch, openStream)).not.toContain("beginStream(");
  });

  it("releases the handle on every exit of handleSend", () => {
    // `handleSend` has exactly two unwind paths - the code-run branch and the answer
    // stream - and both have to hand the stream back. A `finally` that forgot to
    // release is what made the pending update unusable forever.
    const sendFinallys = [...CHAT.matchAll(/\} finally \{/g)].filter(
      (match) => match.index < CHAT.indexOf("const stopRun")
    );
    expect(sendFinallys).toHaveLength(2);
    for (const match of sendFinallys) {
      const body = blockBody(CHAT, CHAT.indexOf("{", match.index));
      expect(body).toMatch(/stream\.end\(\)/);
    }
    const answerFinally = blockBody(CHAT, CHAT.indexOf("{", sendFinallys[1].index));
    // Clearing the ref only when it still points at this stream keeps a second run
    // from wiping the first one's handle.
    expect(answerFinally).toContain("if (streamRef.current === stream) streamRef.current = null;");
    expect(CHAT).toContain("const streamRef = useRef<StreamHandle | null>(null);");
  });

  it("releases the handle when the user presses Stop", () => {
    expect(bodyOf(CHAT, "const stopRun =")).toContain("streamRef.current?.end()");
  });

  it("pairs every beginStream call site with a release in the same scope", () => {
    const opened = CHAT.match(/beginStream\("/g) ?? [];
    expect(opened).toHaveLength(2); // the code-run branch and the answer stream
    expect(CHAT.match(/stream\.end\(\)/g) ?? []).toHaveLength(2);
    expect(CHAT).toContain("streamRef.current?.end()");
  });
});

describe("useServiceWorker.ts update gate", () => {
  it("defers Refresh while a stream is counted instead of skipping waiting", () => {
    const onClick = bodyOf(USE_SW, "onClick: () => {");
    expect(onClick).toContain("if (pending > 0)");
    expect(onClick.indexOf("applyUpdate();")).toBeGreaterThan(-1);
    // The guard has to come first: the shipped version applied the update and cut a
    // live stream mid-flight.
    expect(onClick.indexOf("if (pending > 0)")).toBeLessThan(onClick.indexOf("applyUpdate();"));
    expect(USE_SW).toContain("const pending = getActiveStreamCount();");
    expect(USE_SW).toContain("subscribeActiveStreams(renderToast)");
  });

  it("titles the toast with the wording the task asks for", () => {
    // The spec phrase is the thing a reviewer reads on screen, so it lives in the
    // title rather than being paraphrased across title and description.
    const render = bodyOf(USE_SW, "const renderToast = () => {");
    expect(render).toContain('toast("Update ready, tap to refresh"');
    // While a stream holds the update, the description is what tells the user why
    // tapping does not reload yet.
    expect(render).toContain("to finish before applying the update.");
    expect(render).toContain("if (pending > 0)");
  });

  it("posts exactly the message the worker listens for", () => {
    const posted = USE_SW.match(/postMessage\(\{ type: "([^"]+)" \}\)/g) ?? [];
    expect(posted).toHaveLength(1);
    const type = /"([^"]+)"/.exec(posted[0])?.[1] ?? "";
    expect(SW).toContain(`data.type === '${type}'`);
    // Nothing on the worker side may keep its own stream count or answer a poll:
    // `skipWaiting()` may only ever run as the reply to the page's one message.
    expect(SW).not.toMatch(/check-update/);
    expect(SW.match(/data\.type ===/g)).toHaveLength(1);
    expect(SW.match(/self\.skipWaiting\(\)/g)).toHaveLength(1);
    expect(SW).toContain("event.waitUntil(self.skipWaiting())");
  });

  it("still asks the browser to re-check for an update in this tab", () => {
    expect(USE_SW).toContain("await registration.update()");
  });

  it("reloads only once the waiting worker has actually activated", () => {
    const apply = bodyOf(USE_SW, "const applyUpdate = () => {");
    expect(apply).toContain('worker.postMessage({ type: "skip-waiting" })');
    expect(apply).toContain('if (worker.state === "activated") window.location.reload()');
  });
});
