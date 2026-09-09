import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { sendOwnerSms } from "../../../../lib/sms";
import { ownerNewBookingText } from "../../../../lib/smsTemplates";

// Tells Evelyn a booking just landed inside her next 24 hours.
//
// Called by the public booking page right after a booking succeeds, so — like
// its two siblings in this folder — it cannot require a login, and is locked
// down the same three ways:
//
//   * The caller supplies ONLY an appointment id. Everything in the text is
//     read from the database, so nothing from a browser can shape a message
//     sent from the salon's own number.
//   * The appointment must be minutes old, so a leaked id can't be replayed.
//   * One alert per appointment, ever (owner_notified_at).
//
// Why only inside 24 hours: a booking six weeks out is not news, and an alert
// that fires for every booking is one she stops reading — at which point the
// same alert for tomorrow morning gets ignored too. Everything outside the
// window is caught by the "booked while you were away" strip on the studio home
// screen, which is patient in a way a text can't be.
//
// Nothing sends until SMS_AUTOMATION_ENABLED is true. Until the A2P campaign
// clears this route runs end to end and returns {sent:false,
// reason:"automation_off"}, which is the point: the day it clears is a config
// change, not a deploy.
//
// Best-effort throughout. The booking has already succeeded by the time this
// runs, so every refusal is a 200 with a reason rather than a failure.

export const dynamic = "force-dynamic";

// Bookings further out than this don't interrupt her.
const SHORT_NOTICE_HOURS = 24;

// How long after booking an alert may still go out. Bounds replay of an id
// that leaks later.
const FRESH_WINDOW_MINUTES = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // `*` rather than a column list so owner_notified_at is tolerated before
  // migration 0032 runs — naming it would make the whole select fail on a
  // deploy that lands ahead of its SQL.
  const { data: appt } = await admin
    .from("appointments")
    .select("*, services(name), clients(full_name, created_at)")
    .eq("id", appointmentId)
    .single();

  if (!appt) return skip("not_found");

  const ageMs = Date.now() - new Date(appt.created_at as string).getTime();
  if (ageMs > FRESH_WINDOW_MINUTES * 60 * 1000) return skip("expired");
  if (appt.owner_notified_at) return skip("already_sent");

  const startsAt = appt.starts_at as string;
  const hoursOut =
    (new Date(startsAt).getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursOut > SHORT_NOTICE_HOURS) return skip("not_short_notice");

  type ClientRow = { full_name: string | null; created_at: string | null };
  type ServiceRow = { name: string };
  const client = one(appt.clients as unknown as ClientRow | ClientRow[] | null);
  const service = one(appt.services as unknown as ServiceRow | ServiceRow[] | null);

  // "New client" means the clients row was created by this same booking.
  // create_booking makes one on the spot when the email doesn't match anyone,
  // so the two timestamps land within a second of each other. A minute of slack
  // covers clock skew without ever calling a returning client new.
  const clientAgeMs = client?.created_at
    ? new Date(appt.created_at as string).getTime() -
      new Date(client.created_at).getTime()
    : Number.MAX_SAFE_INTEGER;
  const isNewClient = clientAgeMs < 60 * 1000;

  const body = ownerNewBookingText({
    clientName: client?.full_name ?? null,
    serviceName: service?.name ?? null,
    startsAt,
    isNewClient,
  });

  const res = await sendOwnerSms(body);
  if (!res.ok) return skip(res.reason);

  // Stamped only after Twilio accepts it, so a transient failure leaves the
  // alert available rather than burning it.
  await admin
    .from("appointments")
    .update({ owner_notified_at: new Date().toISOString() })
    .eq("id", appointmentId);

  return NextResponse.json({ sent: true });
}
