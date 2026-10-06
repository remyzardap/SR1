/**
 * Typed SSE parser and event decoder for Sutaeru stream protocols.
 *
 * Implements standard Server-Sent Events line/event buffering and decodes
 * raw stream events into typed discriminated unions.
 */

import type { ActivityItem } from "@/components/ActivityFeed";
import type { Source } from "./streamReducer";

export interface RawSseEvent {
  event: string;
  data: string;
}

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ApprovalRequest {
  id: string;
  tool: string;
  title: string;
  preview?: string;
  args?: unknown;
  expiresAt?: string | number;
}

export type StreamEvent =
  | { type: "token"; text: string }
  | { type: "agent" }
  | { type: "model"; label?: string }
  | { type: "tool_start"; tool: string; id?: string }
  | { type: "activity"; item: ActivityItem }
  | { type: "skill"; skill: { id: number; name: string } }
  | { type: "quota_warn"; message?: string }
  | { type: "notice"; message?: string }
  | { type: "sources"; sources: Source[] }
  | { type: "usage"; usage: StreamUsage }
  | { type: "done"; model?: string }
  | { type: "error"; message: string }
  | { type: "meta"; protocol: number; runId: string; sessionId?: string }
  | { type: "thinking"; text: string }
  | { type: "segment"; kind: "narration" | "answer" }
  | { type: "tool_end"; tool?: string; id?: string; ok?: boolean; durationMs?: number }
  | { type: "approval_request"; approval: ApprovalRequest };

export interface SseParser {
  push(chunk: string): RawSseEvent[];
  flush(): RawSseEvent[];
}

function extractLines(input: string, isFlush: boolean): { lines: string[]; remainder: string } {
  const lines: string[] = [];
  let lineStart = 0;
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];
    if (ch === "\r") {
      if (i + 1 < len) {
        if (input[i + 1] === "\n") {
          lines.push(input.slice(lineStart, i));
          i += 2;
          lineStart = i;
        } else {
          lines.push(input.slice(lineStart, i));
          i += 1;
          lineStart = i;
        }
      } else {
        // '\r' is the very last character of input
        if (isFlush) {
          lines.push(input.slice(lineStart, i));
          i += 1;
          lineStart = i;
        } else {
          // Incomplete: might be followed by '\n' in the next chunk
          break;
        }
      }
    } else if (ch === "\n") {
      lines.push(input.slice(lineStart, i));
      i += 1;
      lineStart = i;
    } else {
      i += 1;
    }
  }

  if (isFlush && lineStart < len) {
    // In flush, any remaining text without a trailing newline is the final line
    lines.push(input.slice(lineStart));
    lineStart = len;
  }

  return { lines, remainder: input.slice(lineStart) };
}

export function createSseParser(): SseParser {
  let buffer = "";
  let currentEvent = "message";
  let dataLines: string[] = [];
  let hasData = false;

  function processLines(lines: string[]): RawSseEvent[] {
    const events: RawSseEvent[] = [];

    for (const line of lines) {
      if (line.startsWith(":")) {
        // Lines starting with : are comments
        continue;
      }

      if (line === "") {
        // Blank line ends the event
        if (hasData) {
          events.push({
            event: currentEvent,
            data: dataLines.join("\n"),
          });
        }
        currentEvent = "message";
        dataLines = [];
        hasData = false;
        continue;
      }

      if (line.startsWith("event:")) {
        const val = line.startsWith("event: ") ? line.slice(7) : line.slice(6);
        currentEvent = val.trim() || "message";
      } else if (line.startsWith("data:")) {
        const val = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
        dataLines.push(val);
        hasData = true;
      }
    }

    return events;
  }

  return {
    push(chunk: string): RawSseEvent[] {
      buffer += chunk;
      const { lines, remainder } = extractLines(buffer, false);
      buffer = remainder;
      return processLines(lines);
    },

    flush(): RawSseEvent[] {
      const { lines } = extractLines(buffer, true);
      buffer = "";
      const events = processLines(lines);
      if (hasData) {
        events.push({
          event: currentEvent,
          data: dataLines.join("\n"),
        });
        currentEvent = "message";
        dataLines = [];
        hasData = false;
      }
      return events;
    },
  };
}

export function decodeEvent(raw: RawSseEvent): StreamEvent | null {
  switch (raw.event) {
    case "token": {
      let text = raw.data;
      try {
        const parsed = JSON.parse(raw.data);
        if (typeof parsed === "string") {
          text = parsed;
        }
      } catch {
        // raw text if not JSON
      }
      return { type: "token", text };
    }

    case "agent": {
      return { type: "agent" };
    }

    case "model": {
      try {
        const parsed = JSON.parse(raw.data);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          console.debug("Malformed model event data: expected object", raw);
          return null;
        }
        if (parsed.label !== undefined && typeof parsed.label !== "string") {
          console.debug("Malformed model event data: label must be string", raw);
          return null;
        }
        return {
          type: "model",
          ...(typeof parsed.label === "string" ? { label: parsed.label } : {}),
        };
      } catch (err) {
        console.debug("Malformed JSON in model event", raw, err);
        return null;
      }
    }

    case "tool_start": {
      try {
        const parsed = JSON.parse(raw.data);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          console.debug("Malformed tool_start event data: expected object", raw);
          return null;
        }
        if (parsed.tool !== undefined && typeof parsed.tool !== "string") {
          console.debug("Malformed tool_start event data: tool must be string", raw);
          return null;
        }
        if (parsed.id !== undefined && typeof parsed.id !== "string") {
          console.debug("Malformed tool_start event data: id must be string", raw);
          return null;
        }
        return {
          type: "tool_start",
          tool: typeof parsed.tool === "string" ? parsed.tool : "tool",
          ...(typeof parsed.id === "string" ? { id: parsed.id } : {}),
        };
      } catch (err) {
        console.debug("Malformed JSON in tool_start event", raw, err);
        return null;
      }
    }

    case "activity": {
      try {
        const parsed = JSON.parse(raw.data);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          typeof parsed.id !== "string" ||
          typeof parsed.label !== "string" ||
          typeof parsed.status !== "string" ||
          typeof parsed.kind !== "string"
        ) {
          console.debug("Malformed activity event data: missing required fields", raw);
          return null;
        }
        return { type: "activity", item: parsed as ActivityItem };
      } catch (err) {
        console.debug("Malformed JSON in activity event", raw, err);
        return null;
      }
    }

    case "skill": {
      try {
        const parsed = JSON.parse(raw.data);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          typeof parsed.id !== "number" ||
          typeof parsed.name !== "string"
        ) {
          console.debug("Malformed skill event data: invalid id or name", raw);
          return null;
        }
        return { type: "skill", skill: { id: parsed.id, name: parsed.name } };
      } catch (err) {
        console.debug("Malformed JSON in skill event", raw, err);
        return null;
      }
    }

    case "quota_warn": {
      try {
        const parsed = JSON.parse(raw.data);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          console.debug("Malformed quota_warn event data", raw);
          return null;
        }
        if (parsed.message !== undefined && typeof parsed.message !== "string") {
          console.debug("Malformed quota_warn event data: message must be string", raw);
          return null;
        }
        return {
          type: "quota_warn",
          ...(typeof parsed.message === "string" ? { message: parsed.message } : {}),
        };
      } catch (err) {
        console.debug("Malformed JSON in quota_warn event", raw, err);
        return null;
      }
    }

    case "notice": {
      try {
        const parsed = JSON.parse(raw.data);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          console.debug("Malformed notice event data", raw);
          return null;
        }
        if (parsed.message !== undefined && typeof parsed.message !== "string") {
          console.debug("Malformed notice event data: message must be string", raw);
          return null;
        }
        return {
          type: "notice",
          ...(typeof parsed.message === "string" ? { message: parsed.message } : {}),
        };
      } catch (err) {
        console.debug("Malformed JSON in notice event", raw, err);
        return null;
      }
    }

    case "sources": {
      try {
        const parsed = JSON.parse(raw.data);
        if (!Array.isArray(parsed)) {
          return { type: "sources", sources: [] };
        }
        const sources: Source[] = [];
        for (const item of parsed) {
          if (item && typeof item === "object" && typeof item.url === "string") {
            sources.push({
              title: typeof item.title === "string" ? item.title : "",
              url: item.url,
            });
          }
        }
        return { type: "sources", sources };
      } catch (err) {
        console.debug("Malformed JSON in sources event", raw, err);
        return null;
      }
    }

    case "usage": {
      try {
        const parsed = JSON.parse(raw.data);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          console.debug("Malformed usage event data", raw);
          return null;
        }
        return {
          type: "usage",
          usage: {
            inputTokens: typeof parsed.inputTokens === "number" ? parsed.inputTokens : 0,
            outputTokens: typeof parsed.outputTokens === "number" ? parsed.outputTokens : 0,
            totalTokens: typeof parsed.totalTokens === "number" ? parsed.totalTokens : 0,
          },
        };
      } catch (err) {
        console.debug("Malformed JSON in usage event", raw, err);
        return null;
      }
    }

    case "done": {
      if (!raw.data || !raw.data.trim()) {
        return { type: "done" };
      }
      try {
        const parsed = JSON.parse(raw.data);
        if (typeof parsed === "string") {
          return { type: "done", model: parsed };
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          if (typeof parsed.model === "string") {
            return { type: "done", model: parsed.model };
          }
          if (parsed.model === undefined) {
            return { type: "done" };
          }
          console.debug("Malformed done event data: invalid model property", raw);
          return null;
        }
        console.debug("Malformed done event data shape", raw);
        return null;
      } catch {
        const trimmed = raw.data.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          console.debug("Malformed JSON in done event", raw);
          return null;
        }
        return { type: "done", model: trimmed };
      }
    }

    case "error": {
      let message = raw.data;
      try {
        const parsed = JSON.parse(raw.data);
        if (typeof parsed === "string") {
          message = parsed;
        }
      } catch {
        // raw text
      }
      return { type: "error", message };
    }

    case "meta": {
      try {
        const parsed = JSON.parse(raw.data);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          typeof parsed.protocol !== "number" ||
          typeof parsed.runId !== "string"
        ) {
          console.debug("Malformed meta event data", raw);
          return null;
        }
        if (parsed.sessionId !== undefined && typeof parsed.sessionId !== "string") {
          console.debug("Malformed meta event data: sessionId must be string", raw);
          return null;
        }
        return {
          type: "meta",
          protocol: parsed.protocol,
          runId: parsed.runId,
          ...(typeof parsed.sessionId === "string" ? { sessionId: parsed.sessionId } : {}),
        };
      } catch (err) {
        console.debug("Malformed JSON in meta event", raw, err);
        return null;
      }
    }

    case "thinking": {
      try {
        const parsed = JSON.parse(raw.data);
        if (typeof parsed !== "string") {
          console.debug("Malformed thinking event data: expected JSON string", raw);
          return null;
        }
        return { type: "thinking", text: parsed };
      } catch (err) {
        console.debug("Malformed JSON in thinking event", raw, err);
        return null;
      }
    }

    case "segment": {
      try {
        const parsed = JSON.parse(raw.data);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          (parsed.kind !== "narration" && parsed.kind !== "answer")
        ) {
          console.debug("Malformed segment event data", raw);
          return null;
        }
        return { type: "segment", kind: parsed.kind };
      } catch (err) {
        console.debug("Malformed JSON in segment event", raw, err);
        return null;
      }
    }

    case "tool_end": {
      try {
        const parsed = JSON.parse(raw.data);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          console.debug("Malformed tool_end event data", raw);
          return null;
        }
        if (parsed.tool !== undefined && typeof parsed.tool !== "string") {
          console.debug("Malformed tool_end event data: tool must be string", raw);
          return null;
        }
        if (parsed.id !== undefined && typeof parsed.id !== "string") {
          console.debug("Malformed tool_end event data: id must be string", raw);
          return null;
        }
        if (parsed.ok !== undefined && typeof parsed.ok !== "boolean") {
          console.debug("Malformed tool_end event data: ok must be boolean", raw);
          return null;
        }
        if (parsed.durationMs !== undefined && typeof parsed.durationMs !== "number") {
          console.debug("Malformed tool_end event data: durationMs must be number", raw);
          return null;
        }
        return {
          type: "tool_end",
          ...(typeof parsed.tool === "string" ? { tool: parsed.tool } : {}),
          ...(typeof parsed.id === "string" ? { id: parsed.id } : {}),
          ...(typeof parsed.ok === "boolean" ? { ok: parsed.ok } : {}),
          ...(typeof parsed.durationMs === "number" ? { durationMs: parsed.durationMs } : {}),
        };
      } catch (err) {
        console.debug("Malformed JSON in tool_end event", raw, err);
        return null;
      }
    }

    case "approval_request": {
      try {
        const parsed = JSON.parse(raw.data);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          typeof parsed.id !== "string" ||
          typeof parsed.tool !== "string" ||
          typeof parsed.title !== "string"
        ) {
          console.debug("Malformed approval_request event data", raw);
          return null;
        }
        return {
          type: "approval_request",
          approval: {
            id: parsed.id,
            tool: parsed.tool,
            title: parsed.title,
            ...(parsed.preview !== undefined ? { preview: parsed.preview } : {}),
            ...(parsed.args !== undefined ? { args: parsed.args } : {}),
            ...(parsed.expiresAt !== undefined ? { expiresAt: parsed.expiresAt } : {}),
          },
        };
      } catch (err) {
        console.debug("Malformed JSON in approval_request event", raw, err);
        return null;
      }
    }

    default: {
      console.debug("Unknown SSE event name", raw.event);
      return null;
    }
  }
}
