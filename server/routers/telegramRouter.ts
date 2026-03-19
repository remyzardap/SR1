import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";

export const telegramRouter = router({
  /**
   * Get Telegram webhook info
   */
  webhookInfo: publicProcedure.query(async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { configured: false, status: "Token not set" };
    return { configured: true, status: "Ready" };
  }),

  /**
   * Test endpoint for Telegram integration
   */
  test: publicProcedure.query(async () => {
    return { message: "Telegram integration active", timestamp: new Date().toISOString() };
  }),
});

export default telegramRouter;
