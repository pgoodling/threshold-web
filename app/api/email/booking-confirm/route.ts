import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { appointmentEmail, sendEmail } from "../../../../lib/email";

// Sends a booking-confirmation email. The email twin of
// /api/sms/booking-confirm, and locked down the same way, because it has the
// same problem: the public booking page calls it, so it cannot require a login.
//
//   * The caller supplies ONLY an appointment id. Everything in the email —
//     name, service, time, address — is read from the database, so nothing a
//     caller sends can shape a message that appears to come from the salon.
//   * The appointment must be minutes old, so a leaked id can't be replayed.
//   * One confirmation per appointment, ever (confirmation_email_sent_at).
//   * Opted-out clients are never emailed.
//
// Best-effort: the booking already succeeded before this runs, so every
// "didn't send" path returns 200 with a reason rather than failing the booking.

const CONFIRM_WINDOW_MINUTES = 15;
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

  const { data: appt } = await admin
    .from("appointments")
    // `*` so the columns from migration 0017 are tolerated before it runs.
    .select("*, services(name), clients(*)")
    .eq("id", appointmentId)
    .single();

  if (!appt) return skip("not_found");

  const ageMs = Date.now() - new Date(appt.created_at as string).getTime();
  if (ageMs > CONFIRM_WINDOW_MINUTES * 60 * 1000) return skip("expired");
  if (appt.confirmation_email_sent_at) return skip("already_sent");

  type ClientRow = {
    full_name: string;
    email: string | null;
    email_opt_out?: boolean;
  };
  type ServiceRow = { name: string };
  const client = one(appt.clients as unknown as ClientRow | ClientRow[] | null);
  const service = one(appt.services as unknown as ServiceRow | ServiceRow[] | null);

  if (!client?.email) return skip("no_email");
  if (client.email_opt_out) return skip("opted_out");

  const { subject, html, text } = appointmentEmail({
    firstName: client.full_name?.trim().split(" ")[0] || "there",
    service: service?.name ?? "your appointment",
    startsAt: appt.starts_at as string,
    kind: "confirmation",
  });

  const res = await sendEmail({ to: client.email, subject, html, text });
  if (!res.ok) return skip(res.reason);

  // Stamp AFTER a successful send: a failed send should be retryable, and the
  // 15-minute window bounds how long that stays possible.
  await admin
    .from("appointments")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", appointmentId);

  return NextResponse.json({ sent: true, id: res.id });
}
