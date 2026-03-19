// Central definition of all products and plans offered via Stripe.
// Prices are in USD cents. Update these to match your actual Stripe Price IDs
// once you have created them in the Stripe Dashboard.

export type PlanInterval = "month" | "year" | "one_time";

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number; // in USD cents
  currency: string;
  interval: PlanInterval;
  features: string[];
  stripePriceId: string; // Set this to your real Stripe Price ID
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Perfect for small businesses getting started",
    price: 2900, // $29/month
    currency: "usd",
    interval: "month",
    stripePriceId: "price_starter_monthly", // Replace with real Stripe Price ID
    features: [
      "Up to 100 receipts/month",
      "WhatsApp integration",
      "AI OCR extraction",
      "Basic reports",
      "1 user",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    description: "For growing businesses with more volume",
    price: 7900, // $79/month
    currency: "usd",
    interval: "month",
    stripePriceId: "price_professional_monthly", // Replace with real Stripe Price ID
    popular: true,
    features: [
      "Unlimited receipts",
      "WhatsApp integration",
      "AI OCR extraction",
      "Advanced reports & CSV export",
      "Procurement workflow",
      "Up to 5 users",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Full-featured for large operations",
    price: 19900, // $199/month
    currency: "usd",
    interval: "month",
    stripePriceId: "price_enterprise_monthly", // Replace with real Stripe Price ID
    features: [
      "Everything in Professional",
      "Unlimited users",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantee",
      "Custom domain",
      "White-label option",
    ],
  },
];

export const ONE_TIME_PRODUCTS = [
  {
    id: "setup_fee",
    name: "Onboarding & Setup",
    description: "One-time professional setup and onboarding session",
    price: 19900, // $199 one-time
    currency: "usd",
    interval: "one_time" as PlanInterval,
    stripePriceId: "price_setup_fee", // Replace with real Stripe Price ID
    features: [
      "2-hour onboarding call",
      "WhatsApp webhook configuration",
      "Team training session",
      "Custom category setup",
    ],
  },
];

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function getPlanByPriceId(priceId: string): Plan | undefined {
  return PLANS.find((p) => p.stripePriceId === priceId);
}
