"use client";

import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

// Renders Stripe's Payment Element (Apple Pay / Google Pay / card) and, on
// confirm, saves the card to the customer (SetupIntent) then runs onConfirmed
// to create the booking. No charge is made here.
export default function CardCollect({
  onConfirmed,
}: {
  onConfirmed: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    const { error: err, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

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
      <PaymentElement />
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
