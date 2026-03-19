import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTask, deleteTask, getTaskById, getTasks, updateTask } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const tasksRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return getTasks(input);
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const task = await getTaskById(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      return task;
    }),

  create: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
        dueDate: z.string().optional(),
        category: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        status: z.enum(["open", "in_progress", "done", "cancelled"]).default("open"),
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
        id: z.number(),
        text: z.string().optional(),
        dueDate: z.string().optional(),
        category: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, dueDate, ...rest } = input;
      return updateTask(id, {
        ...rest,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });
    }),

  markDone: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return updateTask(input.id, { status: "done" });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteTask(input.id);
      return { success: true };
    }),
});
