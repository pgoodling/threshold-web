import twilio from "twilio";
import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { toE164 } from "../../../../lib/phone";

// Sends a booking-confirmation text. Called by the public booking page right
// after a booking succeeds, so it CANNOT require a login — which is exactly why
// it has to be locked down other ways:
//
//   * The caller supplies ONLY an appointment id. Every value that ends up in
//     the message (phone, name, service, time) is read from the database, so
//     nothing a caller sends can be injected into a text from Evelyn's number.
//   * The appointment must have been created in the last few minutes, so a
//     leaked id can't be replayed later.
//   * One confirmation per appointment, ever.
//   * Opted-out clients are never texted.
//
// Best-effort by design: the booking already succeeded before this runs, so
// every "we decided not to send" path returns 200 with a reason rather than
// failing the booking. Appointment ids are unguessable v4 UUIDs, so reporting
// the reason isn't a useful oracle and makes support far easier.

// How long after booking a confirmation may still go out.
const CONFIRM_WINDOW_MINUTES = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgREST returns an embedded to-one relation as an object, but the generated
// types allow an array. Normalize so callers can just read `.name`.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const skip = (reason: string) => NextResponse.json({ sent: false, reason });

export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }

  let appointmentId: string | undefined;
  try {
    ({ appointmentId } = (await req.json()) as { appointmentId?: string });
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!appointmentId || !UUID_RE.test(appointmentId)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Everything the text says comes from here — never from the request body.
  const { data: appt } = await admin
    .from("appointments")
    .select(
      "id, starts_at, created_at, client_id, services(name), clients(full_name, phone, sms_opt_out)",
    )
    .eq("id", appointmentId)
    .single();

  if (!appt) return skip("not_found");

  // Only fresh bookings. Bounds replay of an id that leaks later.
  const ageMs = Date.now() - new Date(appt.created_at as string).getTime();
  if (ageMs > CONFIRM_WINDOW_MINUTES * 60 * 1000) return skip("expired");

  // One confirmation per appointment, even if the booking page retries.
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("appointment_id", appointmentId)
    .eq("direction", "outbound");
  if (count) return skip("already_sent");

  type ClientRow = { full_name: string; phone: string | null; sms_opt_out: boolean };
  type ServiceRow = { name: string };
  const client = one(appt.clients as unknown as ClientRow | ClientRow[] | null);
  const service = one(appt.services as unknown as ServiceRow | ServiceRow[] | null);

  if (!client?.phone) return skip("no_phone");
  if (client.sms_opt_out) return skip("opted_out");

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    return NextResponse.json({ error: "SMS not configured." }, { status: 503 });
  }

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(appt.starts_at as string));

  const first = client.full_name?.trim().split(" ")[0] || "there";
  const what = service?.name ?? "your appointment";
  // A2P 10DLC expects opt-out language in the message; the inbound webhook
  // already honours STOP.
  const body =
    `Hi ${first}! You're booked at Threshold for ${what} on ${when}. ` +
    `Reply here if you need anything. — Evelyn (Reply STOP to opt out.)`;

  const to = toE164(client.phone);

  try {
    const msg = await twilio(sid, token).messages.create({ to, from, body });

    // Log it so the confirmation shows up in Evelyn's thread with the client,
    // and so the already_sent check above has something to find.
    await admin.from("messages").insert({
      client_id: appt.client_id,
      appointment_id: appointmentId,
      direction: "outbound",
      body,
      from_number: from,
      to_number: to,
      twilio_sid: msg.sid,
      status: msg.status,
    });

    return NextResponse.json({ sent: true, status: msg.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "SMS error" },
      { status: 500 },
    );
  }
}
