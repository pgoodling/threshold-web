import { loadStripe } from "@stripe/stripe-js";

// Browser-side Stripe. The publishable key is safe to expose.
export const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);
