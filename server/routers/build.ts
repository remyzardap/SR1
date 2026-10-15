import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { complete, LlmUnavailableError } from "../lib/fnLlm";
import { LIMITS, applyOps, buildSystemPrompt, buildUserPrompt, normalizePath, parseBuildReply, type ProjectFiles } from "../lib/buildEdits";

const editInput = z.object({
  files: z.record(z.string(), z.string().max(LIMITS.maxFileBytes)),
  instruction: z.string().trim().min(1).max(8000),
  /** Earlier turns, so "make it bigger" knows what "it" is. */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .default([]),
  activeFile: z.string().max(LIMITS.maxPathLength).optional(),
});

/** Build mode: Sutaeru edits a small React project that runs in the browser. */
export const buildRouter = router({
  edit: protectedProcedure.input(editInput).mutation(async ({ ctx, input }) => {
    const entries = Object.entries(input.files);
    if (entries.length > LIMITS.maxFiles) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `A project can have up to ${LIMITS.maxFiles} files.` });
    }
    const total = entries.reduce((sum, [, code]) => sum + code.length, 0);
    if (total > LIMITS.maxTotalBytes) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This project is too large for Build mode." });
    }
    const files: ProjectFiles = {};
    for (const [raw, code] of entries) {
      const path = normalizePath(raw);
      if (path) files[path] = code;
    }

    let text: string;
    try {
      const result = await complete(
        [
          { role: "system", content: buildSystemPrompt() },
          ...input.history,
          { role: "user", content: buildUserPrompt(files, input.instruction, input.activeFile) },
        ],
        { userId: ctx.user.id, purpose: "build_edit", maxTokens: 16000, reasoning: "low" }
      );
      text = result.text;
    } catch (err) {
      if (err instanceof LlmUnavailableError) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No model is set up for Build mode." });
      }
      console.error("[build.edit] model call failed:", err);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Sutaeru couldn't reach the model. Try again." });
    }

    const parsed = parseBuildReply(text);
    const { changed, skipped } = applyOps(files, parsed.ops);
    return { reply: parsed.reply, changed, skipped };
  }),
});
