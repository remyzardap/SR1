import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTask, deleteTask, getTaskById, getTasks, updateTask } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const TASK_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;

const isoDate = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), {
  message: "Invalid date",
});

// The db helpers in ../db do not scope tasks by user yet, so the router is the
// enforcement point: every read and write is checked against ctx.user.id.
async function requireOwnedTask(id: number, userId: number) {
  const task = await getTaskById(id);
  if (!task || task.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
  }
  return task;
}

export const tasksRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(TASK_STATUSES).optional(),
        category: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const rows = await getTasks(input);
      return rows.filter((t) => t.userId === ctx.user.id);
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      return requireOwnedTask(input.id, ctx.user.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        text: z.string().trim().min(1),
        dueDate: isoDate.optional(),
        category: z.string().max(100).optional(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        status: z.enum(TASK_STATUSES).default("open"),
        source: z.enum(["whatsapp", "web"]).default("web"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return createTask({
        ...input,
        userId: ctx.user.id,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        text: z.string().trim().min(1).optional(),
        dueDate: isoDate.optional(),
        category: z.string().max(100).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        status: z.enum(TASK_STATUSES).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, dueDate, ...rest } = input;
      await requireOwnedTask(id, ctx.user.id);
      return updateTask(id, {
        ...rest,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });
    }),

  markDone: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnedTask(input.id, ctx.user.id);
      return updateTask(input.id, { status: "done" });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnedTask(input.id, ctx.user.id);
      await deleteTask(input.id);
      return { success: true };
    }),
});
