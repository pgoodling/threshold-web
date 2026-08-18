"use client";

import { useState } from "react";
import {
  ExpressCheckoutElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js";

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

  // Stripe reports availability under different keys on the two events, and
  // only ever tells us about wallets it found. Once something is available we
  // keep the block shown — a later empty report shouldn't hide a working
  // button out from under someone mid-tap.
  function noteAvailable(methods?: { applePay?: boolean; googlePay?: boolean }) {
    if (methods?.applePay || methods?.googlePay) setAvailable(true);
  }

  async function handleConfirm(event: StripeExpressCheckoutElementConfirmEvent) {
    if (!stripe || !elements) return;
    setError(null);

    // The wallet sheet is modal and stays open until we tell it otherwise. If
    // confirmation fails and we never call paymentFailed(), Apple Pay just sits
    // there spinning — the error we render underneath is invisible behind the
    // sheet, so it reads as "it doesn't go through". Every failure path has to
    // report back, and passing the message shows the real reason in the sheet.
    const fail = (message: string) => {
      setError(message);
      event.paymentFailed({ reason: "fail", message });
    };

    const { error: submitErr } = await elements.submit();
    if (submitErr) {
      fail(submitErr.message ?? "Couldn't start the wallet. Use the card below.");
      return;
    }

    const { error: err, setupIntent } = await stripe.confirmSetup({
      elements,
      clientSecret,
      redirect: "if_required",
    });

    if (err) {
      fail(err.message ?? "Your card couldn't be saved. Use the card below.");
      return;
    }
    if (setupIntent?.status !== "succeeded") {
      fail(`Card setup didn't complete (${setupIntent?.status ?? "unknown"}). Please try again.`);
      return;
    }

    // The card is saved by this point, so a failure here is the BOOKING
    // failing, not the payment. Still has to close the sheet.
    try {
      await onConfirmed();
    } catch (e) {
      fail(e instanceof Error ? e.message : "Couldn't complete the booking.");
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
        // Wallet detection is ASYNCHRONOUS. `ready` fires once when the element
        // mounts, and at that moment Apple Pay availability may not be resolved
        // yet — so relying on `ready` alone left this permanently hidden even
        // when Apple Pay was perfectly available a moment later. Stripe
        // documents `availablepaymentmethodschange` for exactly this. Listen to
        // both: whichever reports a wallet first wins, and we never flip back
        // to hidden once something is available.
        onReady={({ availablePaymentMethods }) => noteAvailable(availablePaymentMethods)}
        // Note the shapes differ: `ready` gives plain booleans, this event gives
        // { available: boolean } per wallet.
        onAvailablePaymentMethodsChange={({ paymentMethods }) =>
          noteAvailable({
            applePay: paymentMethods?.applePay?.available,
            googlePay: paymentMethods?.googlePay?.available,
          })
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
