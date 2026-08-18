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
  feeCeilingCents,
  appointmentISO,
}: {
  clientSecret: string;
  onConfirmed: () => Promise<void>;
  // What could later be charged, and when. Apple needs both declared up front —
  // see deferredPaymentRequest below.
  feeCeilingCents: number;
  appointmentISO: string;
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
    setError(null);

    // Every exit from here MUST either succeed or call fail(). Previously this
    // returned silently when Stripe wasn't ready, and any thrown error (an
    // IntegrationError from confirmSetup, say) escaped the error handling
    // entirely — in both cases the sheet failed with Apple's generic text and
    // the page showed nothing at all, which is exactly what we were seeing.
    if (!stripe || !elements) {
      fail(event, "Payments didn't finish loading. Please use the card form below.");
      return;
    }

    try {
      await runConfirm(event);
    } catch (e) {
      // Surface the real thing. Stripe errors carry code/type that say far more
      // than the message alone, and without them we're guessing.
      const err = e as { message?: string; code?: string; type?: string };
      const detail = [err.code, err.type].filter(Boolean).join(" · ");
      fail(
        event,
        `${err.message ?? "Something went wrong saving your card."}${detail ? ` [${detail}]` : ""}`,
      );
    }
  }

  function fail(event: StripeExpressCheckoutElementConfirmEvent, message: string) {
    setError(message);
    event.paymentFailed({ reason: "fail", message });
  }

  async function runConfirm(event: StripeExpressCheckoutElementConfirmEvent) {
    if (!stripe || !elements) return;

    // The wallet sheet is modal and stays open until we tell it otherwise, so
    // every failure path has to call paymentFailed() or Apple Pay hangs.
    const { error: submitErr } = await elements.submit();
    if (submitErr) {
      fail(
        event,
        `${submitErr.message ?? "Couldn't start the wallet."}${
          submitErr.code ? ` [${submitErr.code}]` : ""
        }`,
      );
      return;
    }

    const { error: err, setupIntent } = await stripe.confirmSetup({
      elements,
      clientSecret,
      redirect: "if_required",
    });

    if (err) {
      const detail = [err.code, err.decline_code, err.type].filter(Boolean).join(" · ");
      fail(
        event,
        `${err.message ?? "Your card couldn't be saved."}${detail ? ` [${detail}]` : ""}`,
      );
      return;
    }
    if (setupIntent?.status !== "succeeded") {
      fail(
        event,
        `Card setup didn't complete (${setupIntent?.status ?? "no setup intent returned"}).`,
      );
      return;
    }

    // The card is saved by this point, so a failure here is the BOOKING
    // failing, not the payment. Still has to close the sheet.
    try {
      await onConfirmed();
    } catch (e) {
      fail(event, e instanceof Error ? e.message : "Couldn't complete the booking.");
    }
  }

  return (
    <div className={available ? "grid gap-4" : "hidden"}>
      <ExpressCheckoutElement
        options={{
          buttonType: { applePay: "book", googlePay: "book" },
          // We're storing a card to charge a possible late-cancellation or
          // no-show fee AFTER the appointment — a deferred payment in Apple's
          // terms. Declaring it asks the issuer for a merchant token (MPAN)
          // rather than a device token, which is what makes the saved card
          // valid for that later off-session charge. Without this, issuers can
          // decline the $0 setup outright — which surfaces to the client as
          // "try a different card".
          applePay: {
            deferredPaymentRequest: {
              paymentDescription: "Late cancellation or no-show fee",
              managementURL: "https://threshold.salon/privacy",
              deferredBilling: {
                amount: feeCeilingCents,
                label: "Late cancellation or no-show fee",
                deferredPaymentDate: new Date(appointmentISO),
              },
            },
          },
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
