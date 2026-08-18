import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { last10 } from "../../../../lib/phone";

// Prepares card collection for a booking.
//
// If we already know this client and she already has a card on file, this
// returns { hasCardOnFile: true } and NO client secret — the booking page then
// skips the card step entirely. Otherwise it creates (or reuses) the Stripe
// customer and returns a SetupIntent so the browser can save a card.
//
// The client is resolved SERVER-SIDE by phone + first name — the same rule
// migration 0010 uses for client identity — reading `clients.stripe_customer_id`
// with the service-role key, because the public booking page can't (and must
// not) read the clients table. The old version searched Stripe by EMAIL, which
// is optional on the booking form: a client who booked without one got a brand
// new Stripe customer every single visit, scattering her saved cards across
// orphaned customer records that Evelyn would never find when charging a fee.
//
// Note this endpoint will confirm "yes, a card is on file" to anyone who knows
// a client's phone number AND first name. That pairing makes it near-worthless
// to a stranger, and no card details, name, or booking history are returned.

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Payments aren't configured yet." },
      { status: 503 },
    );
  }

  try {
    const stripe = new Stripe(secret);
    const { name, email, phone } = (await req.json()) as {
      name?: string;
      email?: string;
      phone?: string;
    };

    const admin = getAdminClient();
    let customerId: string | undefined;

    // 1. Known client? Match on phone + first name, then email.
    if (admin) {
      const phoneKey = last10(phone ?? "");
      const firstName = (name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";

      let existing: { stripe_customer_id: string | null } | null = null;
      if (phoneKey && firstName) {
        const { data } = await admin
          .from("clients")
          .select("stripe_customer_id")
          .eq("phone_key", phoneKey)
          .eq("first_name_key", firstName.replace(/[^a-z]/g, ""))
          .maybeSingle();
        existing = data;
      }
      if (!existing && email) {
        const { data } = await admin
          .from("clients")
          .select("stripe_customer_id")
          .ilike("email", email)
          .maybeSingle();
        existing = data;
      }
      if (existing?.stripe_customer_id) customerId = existing.stripe_customer_id;
    }

    // 2. Already has a usable card? Skip collection entirely.
    if (customerId) {
      try {
        const methods = await stripe.paymentMethods.list({
          customer: customerId,
          type: "card",
          limit: 1,
        });
        if (methods.data.length > 0) {
          return NextResponse.json({ hasCardOnFile: true, customerId });
        }
      } catch {
        // Customer id is stale (e.g. a test-mode id after the live switch).
        // Fall through and make a fresh one.
        customerId = undefined;
      }
    }

    // 3. Fall back to the email lookup in Stripe, then create.
    if (!customerId && email) {
      const found = await stripe.customers.list({ email, limit: 1 });
      customerId = found.data[0]?.id;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: name || undefined,
        email: email || undefined,
        phone: phone || undefined,
      });
      customerId = customer.id;
    }

    // MUST be automatic_payment_methods, not payment_method_types.
    //
    // The booking page renders Elements in deferred mode (`mode: "setup"` with
    // no explicit paymentMethodTypes), which means Stripe collects details
    // using automatic payment methods. An intent pinned to payment_method_types
    // can't confirm those details — Stripe rejects it outright with "Payment
    // details were collected through Stripe Elements using automatic payment
    // methods and cannot be confirmed through the API configured with
    // payment_method_types". That's what broke Apple Pay, and it would equally
    // have broken Google Pay.
    //
    // allow_redirects: "never" keeps this to methods that finish on the page —
    // cards and wallets. A redirect would navigate away mid-booking and the
    // appointment would never be created, since that happens after the card is
    // saved.
    //
    // usage: off_session is what makes the saved card chargeable later for a
    // no-show fee without the client present.
    const intent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });

    return NextResponse.json({
      hasCardOnFile: false,
      clientSecret: intent.client_secret,
      customerId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Stripe error" },
      { status: 500 },
    );
  }
}
