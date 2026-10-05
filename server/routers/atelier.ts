/**
 * Atelier — AI Report Builder
 *
 * Interview and generation stream over SSE:
 *   POST /api/atelier/interview  — S1 interviews user, emits [READY_TO_GENERATE] when confident
 *   POST /api/atelier/generate   — Builds structured report JSON from conversation context
 *
 * Upload parsing handled separately via POST /api/atelier/parse (multipart),
 * file downloads via POST /api/atelier/export (pdf, docx, xlsx, md).
 */

import type { Express } from "express";
import { s1Blend } from "./s1Router";
import multer from "multer";
import {
  MAX_REPORT_BYTES,
  exportAtelierReport,
  exportRequestSchema,
  reportByteSize,
} from "../lib/atelierExport";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sse(res: any, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Interview system prompt ──────────────────────────────────────────────────

function interviewPrompt(reportType: string, userCount: number, ctx: string): string {
  return `You are Sutaeru, Sutaeru's senior report consultant. Your job is to interview the user to gather everything needed to build a professional ${reportType}.

${ctx ? `User context:\n${ctx}\n\n` : ""}RULES:
- Ask ONE focused question per message — never multiple
- Be concise and conversational — like a sharp consultant
- Start broad (purpose, audience) then drill into specifics (data, sections, tone)
- You need at least 8 exchanges before considering generation
- Exchanges so far: ${userCount}
- When you have enough info (8-12 exchanges covering: purpose, audience, key message, data/metrics, company context, tone, specific sections, any sources), naturally conclude and add [READY_TO_GENERATE] on its own line at the very end
- Example closing: "Perfect — I have everything I need to build this for you. Give me a moment." then [READY_TO_GENERATE]

Topics to cover (adapt order based on conversation):
1. Purpose and intended audience
2. Core message or objective  
3. Time period / scope / geography
4. Key data, metrics, or findings to include
5. Company, project, or entity name and background
6. Desired tone (formal, conversational, technical)
7. Specific sections or chapters they want
8. Any existing sources, data, or documents to reference
9. Branding or style preferences
10. Deadline or urgency`;
}

// ─── Generation system prompt ─────────────────────────────────────────────────

function generationPrompt(reportType: string, theme: string, mode: "rewrite" | "reformat"): string {
  return `You are Sutaeru, a professional report architect. Based on the conversation or uploaded content provided, generate a complete structured report as a JSON object.

${mode === "reformat" ? "IMPORTANT: Keep the original content and meaning intact — only improve structure, formatting, and organization. Do not rewrite or add new content." : "Generate thorough, professional content based on the information provided."}

Return ONLY a valid JSON object — no markdown fences, no explanation, no preamble. Just the raw JSON.

Schema:
{
  "title": "string",
  "subtitle": "string or null",
  "theme": "${theme}",
  "author": "string or null",
  "date": "string",
  "sections": [
    { "id": "cover", "type": "cover", "title": "string", "content": "string — prepared by / date / company line" },
    { "id": "summary", "type": "summary", "title": "Executive Summary", "content": "string — 3-4 paragraphs" },
    { "id": "s1", "type": "section", "title": "string", "content": "string — full section body with paragraphs" },
    { "id": "t1", "type": "table", "title": "string", "data": { "headers": ["string"], "rows": [["string"]] } },
    { "id": "c1", "type": "chart", "title": "string", "data": { "chartType": "bar|line|pie", "labels": ["string"], "values": [0], "color": "#hex" } },
    { "id": "img1", "type": "image", "title": "string", "content": "string — description of what image should show" }
  ]
}

Report type: ${reportType}
Theme: ${theme}
Requirements:
- Minimum 6 sections, ideally 8-12
- Always start with cover then executive summary
- Include at least one table and one chart where relevant
- Use data and specifics from the conversation — no generic filler
- Make it boardroom-ready`;
}

// ─── Streaming helper ─────────────────────────────────────────────────────────

async function streamCompletion(
  res: any,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  agentHint: string,
  maxTokens: number
) {
  const plan = await s1Blend(agentHint, [{ role: "system", content: systemPrompt }, ...messages], {
    draftMaxTokens: Math.min(maxTokens, 3000),
  });
  const { config } = plan;

  let bearer = config.apiKey;
  if (config.vertexProject) {
    const { GoogleAuth } = await import("google-auth-library");
    const token = await (await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient()).getAccessToken();
    bearer = token.token ?? "";
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify({
      model: config.model,
      messages: plan.messages,
      stream: true,
      max_tokens: maxTokens,
      temperature: maxTokens > 2000 ? 0.7 : 0.85,
    }),
  });

  if (!response.ok || !response.body) throw new Error(`LLM error ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw) as { choices?: Array<{ delta?: { content?: string } }> };
        const token = parsed.choices?.[0]?.delta?.content ?? "";
        if (token) { full += token; sse(res, "token", token); }
      } catch { /* skip */ }
    }
  }
  return full;
}

// ─── Register routes ──────────────────────────────────────────────────────────

export function registerAtelierRoutes(app: Express) {

  // ── Interview endpoint ──────────────────────────────────────────────────────
  app.post("/api/atelier/interview", async (req: any, res: any) => {
    const { messages = [], reportType = "Business Report", identityContext = "" } = req.body;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    try {
      const userCount = (messages as any[]).filter((m: any) => m.role === "user").length;
      const sysPrompt = interviewPrompt(reportType, userCount, identityContext);
      const full = await streamCompletion(res, messages, sysPrompt, "write a professional interview response", 450);

      if (full.includes("[READY_TO_GENERATE]")) sse(res, "ready", true);
      sse(res, "done", { userCount });
    } catch (err) {
      sse(res, "error", (err as Error).message);
    }
    res.end();
  });

  // ── Generate endpoint ───────────────────────────────────────────────────────
  app.post("/api/atelier/generate", async (req: any, res: any) => {
    const {
      messages = [],
      reportType = "Business Report",
      theme = "corporate",
      mode = "rewrite",
      uploadedContent = "",
    } = req.body;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    try {
      const sysPrompt = generationPrompt(reportType, theme, mode);

      // If upload mode, inject the file content as a user message
      const finalMessages = uploadedContent
        ? [...messages, { role: "user", content: `Here is the uploaded document content:\n\n${uploadedContent}\n\nPlease ${mode === "reformat" ? "reformat and restructure" : "rewrite and enhance"} this into a professional ${reportType}.` }]
        : messages;

      // Long-form generation
      const full = await streamCompletion(res, finalMessages, sysPrompt, "generate structured long document JSON", 8000);

      // Try to parse and emit the structured report
      try {
        const cleaned = full.replace(/```json|```/g, "").trim();
        const report = JSON.parse(cleaned);
        sse(res, "report", report);
      } catch {
        sse(res, "error", "Failed to parse report structure — please try again");
      }

      sse(res, "done", {});
    } catch (err) {
      sse(res, "error", (err as Error).message);
    }
    res.end();
  });

  // ── Export endpoint ──────────────────────────────────────────────────────────
  app.post("/api/atelier/export", async (req: any, res: any) => {
    const { report } = req.body as { report?: unknown };
    if (reportByteSize(report) > MAX_REPORT_BYTES) {
      return res.status(413).json({ error: "Report too large" });
    }

    const parsed = exportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid export request" });
    }

    try {
      const { report: validReport, format } = parsed.data;
      const { file, filename } = await exportAtelierReport(
        validReport,
        format,
        parsed.data.theme ?? validReport.theme
      );

      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-Filename", filename);
      return res.send(file.buffer);
    } catch (err) {
      console.error("[atelier/export] error:", err);
      return res.status(500).json({ error: "Export failed" });
    }
  });

  // ── File parse endpoint ─────────────────────────────────────────────────────
  app.post("/api/atelier/parse", upload.single("file"), async (req: any, res: any) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const mime = file.mimetype;
      let text = "";

      // Plain text / markdown
      if (mime.includes("text") || file.originalname.endsWith(".md") || file.originalname.endsWith(".txt")) {
        text = file.buffer.toString("utf-8");
      }
      // PDF — extract text via basic buffer read (no puppeteer needed for text PDFs)
      else if (mime === "application/pdf") {
        // Basic PDF text extraction — works for text-based PDFs
        const raw = file.buffer.toString("latin1");
        const matches = raw.match(/\(([^)]{10,})\)/g) ?? [];
        text = matches.map((m: string) => m.slice(1, -1)).join(" ").replace(/\\n/g, "\n").replace(/\\\(/g, "(").replace(/\\\)/g, ")");
        if (text.length < 100) text = "PDF content could not be extracted automatically. Please describe the document content in the chat.";
      }
      // DOCX — extract raw text from XML
      else if (mime.includes("wordprocessingml") || file.originalname.endsWith(".docx")) {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file.buffer);
        const xmlFile = zip.file("word/document.xml");
        if (xmlFile) {
          const xml = await xmlFile.async("string");
          text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        }
      }
      // CSV / Excel — convert to readable text
      else if (mime.includes("csv") || mime.includes("spreadsheet") || file.originalname.endsWith(".csv")) {
        text = file.buffer.toString("utf-8");
      }

      res.json({
        filename: file.originalname,
        size: file.size,
        content: text.slice(0, 50000), // cap at 50k chars
        preview: text.slice(0, 500),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
