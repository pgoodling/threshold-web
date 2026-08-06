import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";

// Charges a no-show fee against the card the client saved at booking.
//
// Authenticated: only Evelyn's signed-in studio session may call this (same
// bearer-token check as /api/sms/send). It is the one route in the app that
// moves money, so every guard is deliberate:
//
//   * the appointment must actually be marked no_show
//   * the fee can't exceed the service price (matches the posted cancellation
//     policy: "up to the full price of the service")
//   * one charge per appointment, enforced here AND by a unique index
//   * the amount comes from Evelyn, but the ceiling comes from the database
//
// Off-session charges can be declined by the bank with `authentication_required`
// when the card demands SCA. That is not a bug and cannot be forced — the
// fallback is to send the client a payment link. We surface that distinctly so
// the studio can say something useful instead of "card declined".

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const admin = getAdminClient();
  if (!secret || !admin) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }

  // Verify the caller is Evelyn, signed in to /studio.
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: userData } = await admin.auth.getUser(bearer);
  if (!userData?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { appointmentId, amountCents } = (await req.json()) as {
    appointmentId?: string;
    amountCents?: number;
  };
  if (!appointmentId || !Number.isInteger(amountCents) || (amountCents ?? 0) <= 0) {
    return NextResponse.json({ error: "Missing appointment or amount." }, { status: 400 });
  }

  const { data: appt } = await admin
    .from("appointments")
    .select(
      "id, status, price_cents, no_show_charge_id, client_id, services(name), clients(full_name, stripe_customer_id)",
    )
    .eq("id", appointmentId)
    .single();

  if (!appt) {
    return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
  }
  if (appt.status !== "no_show") {
    return NextResponse.json(
      { error: "Mark the appointment as a no-show first." },
      { status: 409 },
    );
  }
  if (appt.no_show_charge_id) {
    return NextResponse.json(
      { error: "A fee has already been charged for this appointment." },
      { status: 409 },
    );
  }

  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  const client = one(
    appt.clients as unknown as { full_name: string; stripe_customer_id: string | null } | null,
  );
  const service = one(appt.services as unknown as { name: string } | null);

  const ceiling = appt.price_cents ?? 0;
  if (ceiling > 0 && (amountCents ?? 0) > ceiling) {
    return NextResponse.json(
      { error: "The fee can't be more than the price of the service." },
      { status: 400 },
    );
  }

  const customerId = client?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "This client doesn't have a card on file." },
      { status: 409 },
    );
  }

  const stripe = new Stripe(secret);

  // Use the customer's default card if they have one, else the most recent.
  // Apple Pay / Google Pay cards show up here as ordinary card PaymentMethods.
  let paymentMethodId: string | undefined;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!("deleted" in customer && customer.deleted)) {
      const def = customer.invoice_settings?.default_payment_method;
      if (typeof def === "string") paymentMethodId = def;
      else if (def) paymentMethodId = def.id;
    }
    if (!paymentMethodId) {
      const methods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });
      paymentMethodId = methods.data[0]?.id;
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't read the card on file." },
      { status: 502 },
    );
  }

  if (!paymentMethodId) {
    return NextResponse.json(
      { error: "This client doesn't have a card on file." },
      { status: 409 },
    );
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents as number,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `No-show fee — ${service?.name ?? "appointment"} — ${client?.full_name ?? ""}`.trim(),
        metadata: { appointment_id: appointmentId, kind: "no_show_fee" },
      },
      // Stripe-side idempotency, so a retry or double-tap can't bill twice even
      // if our own write fails partway.
      { idempotencyKey: `no_show_fee_${appointmentId}` },
    );

    if (intent.status !== "succeeded") {
      return NextResponse.json(
        { error: `The card wasn't charged (${intent.status}).` },
        { status: 402 },
      );
    }

    await admin
      .from("appointments")
      .update({
        no_show_fee_cents: amountCents,
        no_show_charge_id: intent.id,
        no_show_charged_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);

    return NextResponse.json({ charged: true, amountCents, paymentIntentId: intent.id });
  } catch (e) {
    const err = e as Stripe.errors.StripeError;
    // The bank wants the cardholder present. Can't be forced off-session.
    if (err?.code === "authentication_required") {
      return NextResponse.json(
        {
          error:
            "Their bank needs them to approve this charge. Send them a payment link instead.",
          code: "authentication_required",
        },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: err?.message ?? "The card couldn't be charged.", code: err?.code },
      { status: 402 },
    );
  }
}
