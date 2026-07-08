import Stripe from "stripe";
import { NextResponse } from "next/server";

// Creates (or reuses) a Stripe customer and returns a SetupIntent client
// secret so the browser can save a card on file (no charge). Server-only —
// uses the secret key, which never reaches the client.
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

    let customerId: string | undefined;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customerId = existing.data[0]?.id;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: name || undefined,
        email: email || undefined,
        phone: phone || undefined,
      });
      customerId = customer.id;
    }

    const intent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({
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
