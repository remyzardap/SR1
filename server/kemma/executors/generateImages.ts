import { generateImage } from "../../_core/imageGeneration";
import { getStorageAdapter } from "../../storageAdapter";
import { getDb } from "../../db";
import { files } from "../../../drizzle/schema";

/**
 * Batch image generation executor.
 *
 * The whole point of this file: a single agent tool call (one user prompt,
 * e.g. "render 15 photos of X") fans out into N parallel image-generation
 * calls internally, instead of requiring N separate tool calls from the
 * model (which is the behavior gap Remy hit comparing this to Kimi K2 —
 * Gemini's own API only ever renders one image per call, so without this
 * fan-out layer Kemma could only ever produce one image per request too).
 *
 * Model-agnostic on purpose: generateImage() from ../../_core/imageGeneration
 * is the only place that knows which backend (Vertex/Gemini today) actually
 * renders a single image. Swapping in another provider (e.g. FLUX.1
 * [schnell] for commercial-safe, cheaper renders) means changing that one
 * function's internals — this file's batching/storage/DB logic doesn't
 * need to change.
 */

export interface BatchImageRequest {
  /** Base prompt used for every image, unless overridden by `variations`. */
  prompt: string;
  /** How many images to render in this call. Clamped to [1, MAX_BATCH]. */
  count: number;
  /**
   * Optional per-image prompt overrides. images[i] uses variations[i] when
   * present, otherwise falls back to `prompt`.
   */
  variations?: string[];
}

export interface BatchImageResultItem {
  index: number;
  prompt: string;
  url?: string;
  fileId?: number;
  mimeType?: string;
  error?: string;
}

export interface BatchImageResult {
  requested: number;
  succeeded: number;
  failed: number;
  images: BatchImageResultItem[];
}

/** Hard ceiling so a single prompt can't be used to trigger an unbounded fan-out. */
export const MAX_IMAGE_BATCH = 20;
/** How many renders run at once — a fan-out, not an unbounded burst against Vertex. */
const CONCURRENCY = 4;

function extensionFor(mimeType: string): "png" | "jpg" | "webp" {
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

export async function generateAndSaveImages(
  userId: number,
  request: BatchImageRequest,
  options?: { threadId?: string; spaceId?: string }
): Promise<BatchImageResult> {
  const count = Math.max(1, Math.min(Math.floor(request.count) || 1, MAX_IMAGE_BATCH));
  const prompts: string[] = Array.from({ length: count }, (_, i) => {
    const variant = request.variations?.[i];
    return variant && variant.trim() ? variant : request.prompt;
  });

  const db = await getDb();
  const adapter = getStorageAdapter();
  const results: BatchImageResultItem[] = new Array(count);

  let cursor = 0;
  async function worker() {
    while (cursor < count) {
      const i = cursor++;
      const prompt = prompts[i];
      try {
        const { buffer, mimeType } = await generateImage({ prompt });
        const ext = extensionFor(mimeType);
        const name = `image-${Date.now()}-${i + 1}`;
        const fileKey = `users/${userId}/images/${name}.${ext}`;
        const stored = await adapter.put(fileKey, buffer, mimeType, {
          userId,
          spaceId: options?.spaceId,
        });

        let fileId: number | undefined;
        if (db) {
          const [inserted] = await db
            .insert(files)
            .values({
              userId,
              name,
              originalPrompt: prompt,
              format: ext,
              kind: "image",
              storageProvider: stored.provider,
              storageRef: stored.key,
              threadId: options?.threadId ?? null,
              spaceId: options?.spaceId ?? null,
              fileKey: stored.key,
              fileUrl: stored.url,
              mimeType,
              fileSizeBytes: stored.sizeBytes,
            })
            .returning({ id: files.id });
          fileId = inserted?.id;
        }

        results[i] = { index: i, prompt, url: stored.url, fileId, mimeType };
      } catch (err) {
        results[i] = {
          index: i,
          prompt,
          error: err instanceof Error ? err.message : "Image generation failed",
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, count) }, () => worker()));

  const succeeded = results.filter((r) => !!r.url).length;
  return { requested: count, succeeded, failed: count - succeeded, images: results };
}
