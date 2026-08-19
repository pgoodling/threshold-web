import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";

// A client cancelling their own appointment.
//
// The rule is the cancellation policy: 24 hours' notice, no charge. Inside that
// window the button is gone and they have to reach Evelyn, because a late
// cancel is exactly when the fee question arises and that's her call, not an
// automated one.
//
// The cutoff is enforced HERE, not just in the page. The page is a courtesy;
// this route is the rule. Anyone can POST to it with an appointment id, so the
// hours check has to live where it can't be skipped by not loading the page.

import { CANCEL_NOTICE_HOURS } from "../../../../lib/policy";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    .select("id, client_id, starts_at, status, clients(full_name)")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (appt.status === "cancelled") {
    // Already done — a double tap or a stale tab shouldn't read as an error.
    return NextResponse.json({ ok: true, already: true });
  }
  if (appt.status !== "booked" && appt.status !== "confirmed") {
    return NextResponse.json({ error: "not_cancellable" }, { status: 409 });
  }

  const hoursAway =
    (new Date(appt.starts_at as string).getTime() - Date.now()) / 3_600_000;
  if (hoursAway < CANCEL_NOTICE_HOURS) {
    return NextResponse.json({ error: "too_late" }, { status: 409 });
  }

  const { error } = await admin
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Tell Evelyn. A cancelled slot vanishing from the calendar with no trace is
  // how you find out at 2pm that your 2pm isn't coming — so it lands in her
  // messages as an unread line, which is where she already looks.
  const name =
    (Array.isArray(appt.clients) ? appt.clients[0] : appt.clients)?.full_name ??
    "A client";
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(appt.starts_at as string));

  await admin.from("messages").insert({
    client_id: appt.client_id,
    appointment_id: appointmentId,
    direction: "inbound",
    kind: "sms",
    body: `${name} cancelled their ${when} appointment online.`,
    status: "received",
  });

  return NextResponse.json({ ok: true });
}
