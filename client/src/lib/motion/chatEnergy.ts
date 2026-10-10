import { useEffect, useRef, useSyncExternalStore } from "react";
import { estimateTokens, tokenRateToEnergy, type ChatPhase } from "./ramp";

/**
 * One small store for "what is the chat doing right now", read by the chat bar mark (DotRamp)
 * and anything else that wants to react to a live answer. Module level on purpose: the feeders
 * (Chat.tsx, ChatHeader, voice) and the readers live in different trees.
 *
 * Feed it with `useChatEnergyFeed({ streaming, text, error })` from the chat container, or push
 * events directly through `useChatEnergy()`.
 */

export interface ChatEnergySnapshot {
  phase: ChatPhase;
  /** performance.now() when the phase began. */
  since: number;
  /** 0..1 microphone level. */
  level: number;
}

/** Window over which the token rate is measured, in ms. */
export const TOKEN_WINDOW_MS = 1500;

type Listener = () => void;

export interface ChatEnergyStore {
  getSnapshot(): ChatEnergySnapshot;
  subscribe(listener: Listener): () => void;
  setPhase(phase: ChatPhase, now?: number): void;
  /** Count streamed tokens (fractions fine). Moves thinking to streaming. */
  tokens(count: number, now?: number): void;
  setLevel(level: number): void;
  /** Tokens per second over the last TOKEN_WINDOW_MS. */
  rate(now?: number): number;
  /** 0..1 energy from the rate. */
  energy(now?: number): number;
  reset(): void;
}

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createChatEnergyStore(): ChatEnergyStore {
  let snap: ChatEnergySnapshot = { phase: "idle", since: 0, level: 0 };
  const listeners = new Set<Listener>();
  let samples: Array<{ at: number; n: number }> = [];

  const emit = () => listeners.forEach((l) => l());
  const prune = (now: number) => {
    const cut = now - TOKEN_WINDOW_MS;
    if (samples.length && samples[0].at < cut) samples = samples.filter((s) => s.at >= cut);
  };

  const store: ChatEnergyStore = {
    getSnapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPhase(phase, now = nowMs()) {
      if (snap.phase === phase) return;
      if (phase !== "streaming") samples = [];
      snap = { ...snap, phase, since: now, level: phase === "listening" ? snap.level : 0 };
      emit();
    },
    tokens(count, now = nowMs()) {
      if (!(count > 0)) return;
      samples.push({ at: now, n: count });
      prune(now);
      if (snap.phase === "thinking" || snap.phase === "idle" || snap.phase === "done") store.setPhase("streaming", now);
    },
    setLevel(level) {
      const v = Math.max(0, Math.min(1, level));
      if (Math.abs(v - snap.level) < 0.01) return;
      snap = { ...snap, level: v };
      emit();
    },
    rate(now = nowMs()) {
      prune(now);
      let total = 0;
      for (const s of samples) total += s.n;
      return total / (TOKEN_WINDOW_MS / 1000);
    },
    energy(now = nowMs()) {
      return tokenRateToEnergy(store.rate(now));
    },
    reset() {
      samples = [];
      snap = { phase: "idle", since: nowMs(), level: 0 };
      emit();
    },
  };
  return store;
}

/** The app-wide store. */
export const chatEnergy: ChatEnergyStore = createChatEnergyStore();

/** The store, for code that pushes events (voice level, custom phases). */
export function useChatEnergy(): ChatEnergyStore {
  return chatEnergy;
}

/** Re-renders on phase changes only; the ramp itself reads rate and level per frame. */
export function useChatPhase(store: ChatEnergyStore = chatEnergy): ChatPhase {
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().phase, () => "idle" as ChatPhase);
}

export interface ChatEnergyFeed {
  /** A reply is in flight. */
  streaming: boolean;
  /** The reply text so far (the last assistant message). Its growth is the token rate. */
  text?: string;
  /** The run failed. */
  error?: boolean;
  /** A voice recording is open. */
  listening?: boolean;
}

/**
 * Pure transition logic for the feed, kept separate so it can be tested:
 * which phase follows from the previous and the current inputs.
 */
export function nextPhase(prev: ChatEnergyFeed | null, cur: ChatEnergyFeed, current: ChatPhase): ChatPhase | null {
  if (cur.listening) return "listening";
  if (cur.error && !cur.streaming) return "error";
  // A new run starts by thinking; the first tokens move it to streaming (store.tokens).
  if (cur.streaming) return prev?.streaming ? null : "thinking";
  if (prev?.streaming) return "done";
  if (prev?.listening) return "idle";
  // Only the feeder that reported the error clears it, so a second feeder cannot undim it.
  if (prev?.error && !cur.error && current === "error") return "idle";
  return null;
}

/**
 * Feed the store from a chat container. The one line Chat.tsx needs:
 *   useChatEnergyFeed({ streaming: isStreaming, text: messages[messages.length - 1]?.content, error: !!error });
 * ChatHeader already feeds `streaming` alone, so the ramp works without it (thinking pulse,
 * then the settle); the line adds the token-rate energy and the error dim.
 */
export function useChatEnergyFeed(feed: ChatEnergyFeed, store: ChatEnergyStore = chatEnergy): void {
  const prev = useRef<ChatEnergyFeed | null>(null);
  const lastLen = useRef(0);
  const { streaming, text, error, listening } = feed;
  useEffect(() => {
    const cur: ChatEnergyFeed = { streaming, text, error, listening };
    const len = text?.length ?? 0;
    const next = nextPhase(prev.current, cur, store.getSnapshot().phase);
    if (next) store.setPhase(next);
    if (streaming && typeof text === "string") {
      if (!prev.current?.streaming) lastLen.current = len;
      const grew = len - lastLen.current;
      if (grew > 0) store.tokens(estimateTokens(grew));
    }
    lastLen.current = len;
    prev.current = cur;
  }, [streaming, text, error, listening, store]);
}
