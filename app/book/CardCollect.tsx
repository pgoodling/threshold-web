"use client";

import { useState } from "react";
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

// A clean, card-only input for saving a card on file (SetupIntent). No bank /
// Link / other payment methods. Split into three separate fields — number on
// its own row, expiry and CVC side by side — because the combined single-line
// CardElement is fiddly to tap accurately on a phone.
// 16px keeps iOS Safari from zooming the page when a field is focused.
const elementStyle = {
  base: {
    fontSize: "16px",
    color: "#32251f",
    "::placeholder": { color: "#6f5c52" },
  },
};

export default function CardCollect({
  clientSecret,
  onConfirmed,
}: {
  clientSecret: string;
  onConfirmed: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    if (!stripe || !elements) return;
    // Stripe links the sibling expiry/CVC elements to this one automatically.
    const card = elements.getElement(CardNumberElement);
    if (!card) return;
    setBusy(true);
    setError(null);

    const { error: err, setupIntent } = await stripe.confirmCardSetup(
      clientSecret,
      { payment_method: { card } },
    );

    if (err) {
      setError(err.message ?? "Your card couldn't be saved. Please try again.");
      setBusy(false);
      return;
    }
    if (setupIntent?.status !== "succeeded") {
      setError("Card setup didn't complete. Please try again.");
      setBusy(false);
      return;
    }

    try {
      await onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't complete the booking.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-4">
        <label className="block">
          <span className="mb-1 block text-sm">
            Card number
            <span className="text-accent"> *</span>
          </span>
          <div className="rounded-xl border border-foreground/15 bg-white px-4 py-3.5">
            <CardNumberElement options={{ style: elementStyle }} />
          </div>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-sm">
              Expiration
              <span className="text-accent"> *</span>
            </span>
            <div className="rounded-xl border border-foreground/15 bg-white px-4 py-3.5">
              <CardExpiryElement options={{ style: elementStyle }} />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">
              CVC
              <span className="text-accent"> *</span>
            </span>
            <div className="rounded-xl border border-foreground/15 bg-white px-4 py-3.5">
              <CardCvcElement options={{ style: elementStyle }} />
            </div>
          </label>
        </div>
      </div>
      {error && (
        <p className="rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handle}
        disabled={busy || !stripe}
        className="rounded-full bg-accent px-8 py-3 text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save card & confirm booking"}
      </button>
    </div>
  );
}
