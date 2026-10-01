import type { ChatSession, ChatMessage } from "../../drizzle/schema";
import { generatePDF, generateMarkdown, STYLE_DEFINITIONS, type StructuredContent } from "../fileGenerator";

const MINIMAL_STYLE = STYLE_DEFINITIONS.find((s) => s.id === "minimal")!;

export function safeFilename(title: string, id: string): string {
  // HTTP header values are latin1: characters above U+00FF make
  // res.setHeader throw ERR_INVALID_CHAR, so they must not survive here.
  const cleaned = title
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, "")
    .replace(/[^\u0000-\u00ff]/g, "")
    .trim()
    .slice(0, 80);
  const base = cleaned || "untitled";
  return `${base}-${id.slice(0, 8)}`;
}

export function threadToStructuredContent(
  session: Pick<ChatSession, "title" | "id">,
  messages: Pick<ChatMessage, "role" | "content" | "model" | "createdAt">[]
): StructuredContent {
  return {
    title: session.title || "Untitled chat",
    subtitle: `Exported ${new Date().toISOString()}`,
    sections: messages.map((m) => {
      const who = m.role === "user" ? "You" : "Kemma";
      const when = new Date(m.createdAt).toISOString();
      const modelSuffix = m.model ? ` · ${m.model}` : "";
      return {
        heading: `${who} · ${when}${modelSuffix}`,
        body: m.content,
      };
    }),
  };
}

export async function exportThreadMarkdown(
  session: Pick<ChatSession, "title" | "id">,
  messages: Pick<ChatMessage, "role" | "content" | "model" | "createdAt">[]
): Promise<Buffer> {
  return generateMarkdown(threadToStructuredContent(session, messages));
}

export async function exportThreadPdf(
  session: Pick<ChatSession, "title" | "id">,
  messages: Pick<ChatMessage, "role" | "content" | "model" | "createdAt">[]
): Promise<Buffer> {
  return generatePDF(threadToStructuredContent(session, messages), MINIMAL_STYLE);
}
