import { getAuthToken } from "./authSession";
import { isDesignPreview } from "./designPreview";

const GUEST_MSG = "You're browsing as a guest — sign in to use this feature.";

// Kemma functions run on our own server (server/routes/fn), same origin as the app.
const FUNCTIONS_BASE = `${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/fn`;

export class CloudFunctionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<never> {
  let message = `Request failed (${res.status}).`;
  try {
    const body = await res.json();
    if (typeof body?.error === "string" && body.error) message = body.error;
  } catch {
    // keep the status-based message
  }
  throw new CloudFunctionError(message, res.status);
}

/** POST a JSON action to one of the Kemma Cloud functions with the SR1 session token. */
export async function callFunction<T = unknown>(name: string, body: unknown): Promise<T> {
  if (isDesignPreview()) throw new CloudFunctionError(GUEST_MSG, 401);
  const token = getAuthToken();
  if (!token) throw new CloudFunctionError("Sign in to continue.", 401);
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as T;
}

export interface SseHandlers {
  onToken?: (text: string) => void;
  onDone?: (data: unknown) => void;
  onError?: (message: string, retryable: boolean) => void;
}

/** POST to a streaming (SSE) Cloud function and dispatch token/done/error events. */
export async function streamFunction(name: string, body: unknown, handlers: SseHandlers, signal?: AbortSignal): Promise<void> {
  if (isDesignPreview()) throw new CloudFunctionError(GUEST_MSG, 401);
  const token = getAuthToken();
  if (!token) throw new CloudFunctionError("Sign in to continue.", 401);
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) await parseError(res);

  if (!res.body) throw new CloudFunctionError("Empty response from server.", 502);
  if (!res.body) throw new CloudFunctionError("Empty response from server.", 502);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const eventLine = chunk.split("\n").find((l) => l.startsWith("event:"));
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (!data) continue;
      let parsed: unknown = data;
      try { parsed = JSON.parse(data); } catch { /* plain string */ }
      const event = eventLine?.slice(6).trim();
      if (event === "token") handlers.onToken?.(typeof parsed === "string" ? parsed : String(parsed));
      else if (event === "done") handlers.onDone?.(parsed);
      else if (event === "error") {
        const err = parsed as { message?: string; retryable?: boolean } | string;
        handlers.onError?.(typeof err === "string" ? err : err.message || "The request failed.", typeof err === "object" && !!err.retryable);
      }
    }
  }
}

/** Transcribe an audio blob via the voice function; returns the transcript text. */
export async function transcribeAudio(blob: Blob, signal?: AbortSignal): Promise<string> {
  if (isDesignPreview()) throw new CloudFunctionError(GUEST_MSG, 401);
  const token = getAuthToken();
  if (!token) throw new CloudFunctionError("Sign in to continue.", 401);
  const type = blob.type.startsWith("video/") ? blob.type.replace("video/", "audio/") : blob.type || "audio/webm";
  const form = new FormData();
  form.set("file", new File([blob], "recording.webm", { type }));
  const res = await fetch(`${FUNCTIONS_BASE}/voice`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal,
  });
  if (!res.ok || !res.body) await parseError(res);

  // The server streams SSE transcript events; accumulate text fragments.
  if (!res.body) throw new CloudFunctionError("Empty response from server.", 502);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        const event = JSON.parse(data) as { type?: string; delta?: string; text?: string; transcript?: string };
        if (typeof event.delta === "string") text += event.delta;
        else if (event.type?.endsWith(".done") && typeof (event as { text?: string }).text === "string") text = (event as { text: string }).text;
        else if (typeof event.transcript === "string" && !event.type) text += event.transcript;
      } catch {
        // ignore keep-alives
      }
    }
  }
  return text.trim();
}

/** Read text aloud via the voice function; returns a playable object URL. */
export async function speakText(text: string, signal?: AbortSignal): Promise<string> {
  if (isDesignPreview()) throw new CloudFunctionError(GUEST_MSG, 401);
  const token = getAuthToken();
  if (!token) throw new CloudFunctionError("Sign in to continue.", 401);
  const res = await fetch(`${FUNCTIONS_BASE}/voice?mode=speak`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) await parseError(res);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
