"use client";

import { useState } from "react";
import {
  ExpressCheckoutElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

// Apple Pay / Google Pay button for saving a card on file (SetupIntent, no
// charge). It renders only when the buyer's device actually offers a wallet —
// on everything else nothing shows and the plain card field below is used.
// Lives in its own Elements island (setup mode) so confirming the wallet never
// touches the separate CardElement.
export default function WalletCollect({
  clientSecret,
  onConfirmed,
}: {
  clientSecret: string;
  onConfirmed: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!stripe || !elements) return;
    setError(null);

    const { error: submitErr } = await elements.submit();
    if (submitErr) {
      setError(submitErr.message ?? "Couldn't start the wallet. Use the card below.");
      return;
    }

    const { error: err, setupIntent } = await stripe.confirmSetup({
      elements,
      clientSecret,
      redirect: "if_required",
    });

    if (err) {
      setError(err.message ?? "Your card couldn't be saved. Use the card below.");
      return;
    }
    if (setupIntent?.status !== "succeeded") {
      setError("Card setup didn't complete. Please try again.");
      return;
    }

    try {
      await onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't complete the booking.");
    }
  }

  return (
    <div className={available ? "grid gap-4" : "hidden"}>
      <ExpressCheckoutElement
        options={{
          buttonType: { applePay: "book", googlePay: "book" },
          paymentMethods: {
            applePay: "auto",
            googlePay: "auto",
            amazonPay: "never",
            paypal: "never",
            link: "never",
            klarna: "never",
          },
        }}
        onReady={({ availablePaymentMethods }) =>
          setAvailable(
            !!availablePaymentMethods &&
              (availablePaymentMethods.applePay || availablePaymentMethods.googlePay),
          )
        }
        onConfirm={handleConfirm}
      />
      {error && (
        <p className="rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-foreground/10" />
        or pay with card
        <span className="h-px flex-1 bg-foreground/10" />
      </div>
    </div>
  );
}
