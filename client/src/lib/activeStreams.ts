/**
 * The streams this tab has open, so the UI can tell an interrupted answer apart
 * from a finished one - and so a service-worker update is never applied while an
 * answer is still arriving.
 *
 * The count has to live on the page: `navigator.serviceWorker` messages are
 * delivered to the *controlling* worker, while `skipWaiting()` runs in the
 * *waiting* one, so a counter kept inside sw.js could never gate itself.
 */

export type StreamHandle = {
  /** Opaque id, handy in tests and devtools. */
  readonly id: string;
  /** Closes this stream. Repeated calls are ignored, so a `finally` block and an
   *  explicit stop can both fire without stealing another stream's slot. */
  readonly end: () => void;
};

type Listener = (count: number) => void;

const streams = new Set<string>();
const listeners = new Set<Listener>();
let sequence = 0;

function notifyListeners(): void {
  const count = streams.size;
  for (const listener of listeners) listener(count);
}

/** Opens a stream and returns the only handle that can close it. */
export function beginStream(label = "stream"): StreamHandle {
  sequence += 1;
  const id = `${label}-${sequence}`;
  let closed = false;
  streams.add(id);
  notifyListeners();
  return {
    id,
    end: () => {
      if (closed) return;
      closed = true;
      streams.delete(id);
      notifyListeners();
    },
  };
}

export function getActiveStreamCount(): number {
  return streams.size;
}

/** True while at least one answer is still arriving. */
export function isStreaming(): boolean {
  return streams.size > 0;
}

export function subscribeActiveStreams(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drops every open stream. Tests only - production code closes what it opened. */
export function resetActiveStreams(): void {
  streams.clear();
  notifyListeners();
}
