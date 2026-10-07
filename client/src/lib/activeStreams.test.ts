import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginStream,
  getActiveStreamCount,
  isStreaming,
  resetActiveStreams,
  subscribeActiveStreams,
  type StreamHandle,
} from "./activeStreams";

/**
 * The stream counter has two jobs: the Refresh button must stay disabled while an
 * answer is arriving, and every code path out of a send (normal end, Stop, throw,
 * early return) must release it exactly once. An unbalanced release would let an
 * update take effect mid-stream, or leave Refresh dead forever.
 */
describe("active stream counting", () => {
  beforeEach(() => {
    resetActiveStreams();
  });

  it("counts a stream from open to close", () => {
    expect(isStreaming()).toBe(false);

    const stream = beginStream("answer");
    expect(getActiveStreamCount()).toBe(1);
    expect(isStreaming()).toBe(true);

    stream.end();
    expect(getActiveStreamCount()).toBe(0);
    expect(isStreaming()).toBe(false);
  });

  it("ignores a second end() so a finally block cannot steal another stream's slot", () => {
    const first = beginStream("answer");
    const second = beginStream("answer");

    first.end();
    first.end(); // the `finally` of a send that already ended elsewhere

    expect(getActiveStreamCount()).toBe(1);
    expect(isStreaming()).toBe(true);

    second.end();
    expect(getActiveStreamCount()).toBe(0);
  });

  it("pairs concurrent streams so only the last close reaches zero", () => {
    const streams = [beginStream(), beginStream(), beginStream()];
    expect(getActiveStreamCount()).toBe(3);

    streams[1].end();
    expect(getActiveStreamCount()).toBe(2);

    for (const stream of streams) stream.end();
    expect(getActiveStreamCount()).toBe(0);
  });

  it("never drops below zero when a send fails before it ever streamed", () => {
    const stream = beginStream();
    stream.end();
    stream.end();
    expect(getActiveStreamCount()).toBe(0);
  });

  it("hands each handle its own slot", () => {
    const first = beginStream();
    const second = beginStream();
    second.end();
    expect(getActiveStreamCount()).toBe(1);
    first.end();
    expect(getActiveStreamCount()).toBe(0);
  });
});

describe("active stream subscribers", () => {
  beforeEach(() => {
    resetActiveStreams();
  });

  it("reports every change in the count", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeActiveStreams((count) => seen.push(count));

    const stream = beginStream();
    stream.end();
    unsubscribe();

    expect(seen).toEqual([1, 0]);
  });

  it("stays silent when a handle is ended twice", () => {
    const seen: number[] = [];
    const unsubscribe = subscribeActiveStreams((count) => seen.push(count));

    const stream = beginStream("answer");
    stream.end();
    stream.end(); // the `finally` of a send that Stop had already released

    unsubscribe();
    // A second end() must not emit a redundant render: the guard in `end()` is
    // what stops Refresh flickering back on during the next answer.
    expect(seen).toEqual([1, 0]);
  });

  it("stops notifying once unsubscribed", () => {
    const listener = vi.fn();
    subscribeActiveStreams(listener)();
    beginStream();
    expect(listener).not.toHaveBeenCalled();
  });

  it("lets several listeners watch the same counter (Refresh + the banner)", () => {
    const banner = vi.fn();
    const refresh = vi.fn();
    const offBanner = subscribeActiveStreams(banner);
    subscribeActiveStreams(refresh);

    const stream = beginStream();
    expect(banner).toHaveBeenCalledWith(1);
    expect(refresh).toHaveBeenCalledWith(1);

    stream.end();
    offBanner();
    beginStream();
    // The banner saw the open and the close, then nothing after unsubscribing.
    expect(banner).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});

describe("releasing a stream from every exit path", () => {
  beforeEach(() => {
    resetActiveStreams();
  });

  it("survives the Stop-then-finally sequence Chat.tsx runs", () => {
    const stream = beginStream("answer");
    let ref: StreamHandle | null = stream;

    // stopRun() releases the guard the moment the user presses Stop...
    ref?.end();
    expect(getActiveStreamCount()).toBe(0);

    // ...and the aborted send's `finally` ends the same handle afterwards.
    stream.end();
    if (ref === stream) ref = null;

    expect(getActiveStreamCount()).toBe(0);
    expect(ref).toBeNull();
  });

  it("keeps an aborted send's cleanup from releasing a newer stream", () => {
    const previous = beginStream("answer");
    const current = beginStream("answer");

    // The previous send unwinds only after the next one has already started.
    previous.end();
    expect(getActiveStreamCount()).toBe(1);
    expect(isStreaming()).toBe(true);

    current.end();
    expect(getActiveStreamCount()).toBe(0);
  });

  it("releases a code-mode run even though no fetch is streaming", () => {
    const run = beginStream("code-run");
    expect(isStreaming()).toBe(true);
    run.end();
    expect(isStreaming()).toBe(false);
  });

  it("gives every handle its own id", () => {
    expect(beginStream("answer").id).not.toBe(beginStream("answer").id);
  });
});
