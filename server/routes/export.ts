import type { Express, Request, Response } from "express";
import { z } from "zod";
import archiver from "archiver";
import { sdk } from "../_core/sdk";
import { getChatSessionForUser, getChatSessionMessages, listChatSessions, getFilesByUser } from "../db";
import { getStorageAdapter } from "../storageAdapter";
import { exportThreadMarkdown, exportThreadPdf, safeFilename } from "../services/threadExport";

async function requireSession(req: Request, res: Response, next: (err?: any) => void) {
  try {
    (req as any).user = await sdk.authenticateRequest(req);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

const threadParamsSchema = z.object({
  sessionId: z.string().uuid(),
});
const threadQuerySchema = z.object({
  format: z.enum(["md", "pdf"]),
});

export function registerExportRoutes(app: Express) {
  app.get("/api/export/thread/:sessionId", requireSession, async (req, res) => {
    const user = (req as any).user;

    const paramsResult = threadParamsSchema.safeParse(req.params);
    const queryResult = threadQuerySchema.safeParse(req.query);
    if (!paramsResult.success || !queryResult.success) {
      return res.status(400).json({ error: "Invalid sessionId or format" });
    }
    const { sessionId } = paramsResult.data;
    const { format } = queryResult.data;

    const session = await getChatSessionForUser(sessionId, user.id);
    if (!session) {
      return res.status(404).json({ error: "Not found" });
    }

    const messages = await getChatSessionMessages(sessionId);
    const name = safeFilename(session.title || "chat", session.id);

    try {
      if (format === "pdf") {
        const buffer = await exportThreadPdf(session, messages);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${name}.pdf"`);
        return res.send(buffer);
      }
      const buffer = await exportThreadMarkdown(session, messages);
      res.setHeader("Content-Type", "text/markdown");
      res.setHeader("Content-Disposition", `attachment; filename="${name}.md"`);
      return res.send(buffer);
    } catch (err) {
      console.error("[export/thread] error:", err);
      return res.status(500).json({ error: "Export failed" });
    }
  });

  app.get("/api/export/all", requireSession, async (req, res) => {
    const user = (req as any).user;
    const adapter = getStorageAdapter();

    const [sessions, files] = await Promise.all([
      listChatSessions(user.id),
      getFilesByUser(user.id),
    ]);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="sutaeru-export-${user.id}.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("[export/all] archive error:", err);
      res.destroy();
    });
    archive.pipe(res);

    const usedNames = new Set<string>();
    function uniqueName(base: string, id: string | number): string {
      if (!usedNames.has(base)) {
        usedNames.add(base);
        return base;
      }
      const withId = `${base}-${id}`;
      usedNames.add(withId);
      return withId;
    }

    const manifest: {
      sessions: Array<{ id: string; title: string | null; file: string }>;
      files: Array<{ id: number; name: string; file: string }>;
      skipped: Array<{ id: number; name: string; reason: string; fileUrl: string }>;
    } = { sessions: [], files: [], skipped: [] };

    for (const session of sessions) {
      const messages = await getChatSessionMessages(session.id);
      const buffer = await exportThreadMarkdown(session, messages);
      const base = safeFilename(session.title || "chat", session.id);
      const filename = uniqueName(base, session.id) + ".md";
      archive.append(buffer, { name: `chats/${filename}` });
      manifest.sessions.push({ id: session.id, title: session.title, file: `chats/${filename}` });
    }

    for (const file of files) {
      if (file.trashed) continue;
      try {
        const bytes = await adapter.get(file.fileKey);
        const base = file.name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, "").trim() || `file-${file.id}`;
        const filename = uniqueName(base, file.id);
        archive.append(bytes, { name: `files/${filename}` });
        manifest.files.push({ id: file.id, name: file.name, file: `files/${filename}` });
      } catch (err) {
        manifest.skipped.push({
          id: file.id,
          name: file.name,
          reason: "could not read file bytes (may be externally stored)",
          fileUrl: file.fileUrl,
        });
      }
    }

    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    await archive.finalize();
  });
}
