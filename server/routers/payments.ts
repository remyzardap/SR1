import Stripe from "stripe";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { payments, users } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { PLANS, ONE_TIME_PRODUCTS } from "../stripeProducts";
import { TRPCError } from "@trpc/server";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe not configured" });
  return new Stripe(key, { apiVersion: "2026-01-28.clover" });
}

export const paymentsRouter = router({
  // List all available plans
  plans: protectedProcedure.query(() => {
    return { plans: PLANS, oneTimeProducts: ONE_TIME_PRODUCTS };
  }),

  // Create a checkout session for a subscription plan
  createCheckout: protectedProcedure
    .input(
      z.object({
        priceId: z.string(),
        planId: z.string(),
        origin: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get or create Stripe customer
      let stripeCustomerId = ctx.user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: ctx.user.email ?? undefined,
          name: ctx.user.name ?? undefined,
          metadata: { userId: ctx.user.id.toString() },
        });
        stripeCustomerId = customer.id;
        await db.update(users).set({ stripeCustomerId }).where(eq(users.id, ctx.user.id));
      }

      // Determine if it's a subscription or one-time
      const allProducts = [...PLANS, ...ONE_TIME_PRODUCTS];
      const product = allProducts.find((p) => p.id === input.planId);
      const mode = product?.interval === "one_time" ? "payment" : "subscription";

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        mode,
        line_items: [{ price: input.priceId, quantity: 1 }],
        allow_promotion_codes: true,
        client_reference_id: ctx.user.id.toString(),
        customer_email: stripeCustomerId ? undefined : (ctx.user.email ?? undefined),
        metadata: {
          user_id: ctx.user.id.toString(),
          customer_email: ctx.user.email ?? "",
          customer_name: ctx.user.name ?? "",
          plan_id: input.planId,
        },
        success_url: `${input.origin}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/billing?cancelled=true`,
      });

      return { url: session.url };
    }),

  // Create a billing portal session to manage subscription
  createPortal: protectedProcedure
    .input(z.object({ origin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      if (!ctx.user.stripeCustomerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active subscription found" });
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: ctx.user.stripeCustomerId,
        return_url: `${input.origin}/billing`,
      });
      return { url: session.url };
    }),

  // Get current subscription status
  subscription: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.stripeSubscriptionId) return null;
    const stripe = getStripe();
    try {
      const sub = await stripe.subscriptions.retrieve(ctx.user.stripeSubscriptionId);
      return {
        id: sub.id,
        status: sub.status,
        currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        priceId: (sub.items.data[0]?.price?.id) ?? null,
        planId: ctx.user.stripePriceId,
      };
    } catch {
      return null;
    }
  }),

  // List payment history
  history: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(payments)
        .where(eq(payments.userId, ctx.user.id))
        .orderBy(desc(payments.createdAt))
        .limit(input.limit);
    }),
});
