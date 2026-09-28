import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const telegramRouter = router({
  /**
   * Get Telegram webhook info (admin only)
   */
  webhookInfo: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { configured: false, status: "Token not set" };
    return { configured: true, status: "Ready" };
  }),
});

export default telegramRouter;
