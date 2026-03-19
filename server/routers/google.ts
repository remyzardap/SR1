import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import {
  getAuthUrl,
  getConnectionStatus,
  disconnect,
  listEmails,
  getEmailContent,
  sendEmail,
  listCalendarEvents,
  createCalendarEvent,
  listDriveFiles,
  isGoogleConfigured,
} from "../services/google";

export const googleRouter = router({
  configured: publicProcedure.query(() => {
    return { configured: isGoogleConfigured() };
  }),

  getAuthUrl: protectedProcedure.query(({ ctx }) => {
    return getAuthUrl(ctx.user.id);
  }),

  status: protectedProcedure.query(async ({ ctx }) => {
    return getConnectionStatus(ctx.user.id);
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await disconnect(ctx.user.id);
    return { success: true };
  }),

  listEmails: protectedProcedure
    .input(z.object({
      maxResults: z.number().min(1).max(50).default(10),
      query: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return listEmails(ctx.user.id, input.maxResults, input.query);
    }),

  getEmail: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getEmailContent(ctx.user.id, input.messageId);
    }),

  sendEmail: protectedProcedure
    .input(z.object({
      to: z.string().email(),
      subject: z.string().min(1),
      body: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return sendEmail(ctx.user.id, input.to, input.subject, input.body);
    }),

  listEvents: protectedProcedure
    .input(z.object({
      maxResults: z.number().min(1).max(50).default(10),
      timeMin: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return listCalendarEvents(ctx.user.id, input.maxResults, input.timeMin);
    }),

  createEvent: protectedProcedure
    .input(z.object({
      summary: z.string().min(1),
      startTime: z.string(),
      endTime: z.string(),
      description: z.string().optional(),
      location: z.string().optional(),
      attendees: z.array(z.string().email()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createCalendarEvent(
        ctx.user.id,
        input.summary,
        input.startTime,
        input.endTime,
        input.description,
        input.location,
        input.attendees
      );
    }),

  listFiles: protectedProcedure
    .input(z.object({
      maxResults: z.number().min(1).max(50).default(10),
      query: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return listDriveFiles(ctx.user.id, input.maxResults, input.query);
    }),
});
