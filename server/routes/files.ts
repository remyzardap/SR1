/**
 * File serving and upload routes.
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import { sdk } from "../_core/sdk";
import { getStorageAdapter, ensureLocalStorageRoot } from "../storageAdapter";
import { getDb } from "../db";
import { files } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

async function requireSession(req: Request, res: Response, next: (err?: any) => void) {
  try {
    (req as any).user = await sdk.authenticateRequest(req);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function registerFileRoutes(app: Express) {
  // Serve locally-stored files (auth required)
  app.get("/files/*", requireSession, async (req, res) => {
    const key = req.params[0];
    if (!key) return res.status(400).json({ error: "Missing file key" });
    const user = (req as any).user;
    try {
      const db = await getDb();
      if (!db) return res.status(404).json({ error: "File not found" });
      const [owned] = await db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.fileKey, key), eq(files.userId, user.id)))
        .limit(1);
      if (!owned) return res.status(404).json({ error: "File not found" });
    } catch {
      return res.status(404).json({ error: "File not found" });
    }
    try {
      const adapter = getStorageAdapter();
      const buffer = await adapter.get(key);
      // Simple MIME sniff from extension
      const ext = key.split(".").pop()?.toLowerCase();
      const mime = ext === "pdf" ? "application/pdf"
        : ext === "png" ? "image/png"
        : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
        : ext === "mp4" ? "video/mp4"
        : "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.send(buffer);
    } catch (err) {
      res.status(404).json({ error: "File not found" });
    }
  });

  // Video upload slot
  app.post("/api/upload/video", requireSession, upload.single("video"), async (req, res) => {
    const user = (req as any).user;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No video uploaded" });

    try {
      await ensureLocalStorageRoot();
      const adapter = getStorageAdapter();
      const key = `users/${user.id}/videos/video-${Date.now()}.${file.originalname.split(".").pop() || "mp4"}`;
      const stored = await adapter.put(key, file.buffer, file.mimetype || "video/mp4", { userId: user.id });

      const db = await getDb();
      if (db) {
        await db.insert(files).values({
          userId: user.id,
          name: file.originalname || "uploaded-video.mp4",
          originalPrompt: "",
          format: "md",
          kind: "video",
          storageProvider: stored.provider,
          storageRef: stored.key,
          fileKey: stored.key,
          fileUrl: stored.url,
          fileSizeBytes: stored.sizeBytes,
          mimeType: file.mimetype || "video/mp4",
        });
      }

      return res.json({ url: stored.url, key: stored.key, sizeBytes: stored.sizeBytes });
    } catch (err) {
      console.error("[upload/video] error:", err);
      return res.status(500).json({ error: (err as Error).message });
    }
  });
}
