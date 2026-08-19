import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { automationEnabled, sendClientSms } from "../../../../lib/sms";
import { reminderText } from "../../../../lib/smsTemplates";

// The day-before reminder text. Run by Vercel Cron (see vercel.json).
//
// Texting is the channel. She has email and it works, but it isn't how she
// talks to clients -- so this sends one text and nothing else, and the email
// plumbing stays in place unused rather than being ripped out.
//
// Vercel's free plan allows one cron run per day, which suits a salon fine: it
// fires each morning and reminds everyone due in the next 36 hours. The window
// overlaps deliberately -- a client booked at 4pm for 10am tomorrow is only 18
// hours out and still gets caught by the next morning's run.
//
// reminder_sms_sent_at is the idempotency key, so the overlapping window can
// never text twice. It's stamped only after a successful send, so a transient
// Twilio failure is retried by tomorrow's run rather than silently swallowed.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOOKAHEAD_HOURS = 36;

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

async function run() {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }
  if (!automationEnabled()) {
    return NextResponse.json({ sent: 0, reason: "automation_off" });
  }

  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 3600 * 1000);

  // Fetch everything due in the window and decide per appointment below.
  const { data: appts, error } = await admin
    .from("appointments")
    .select("*, services(name), clients(*)")
    .gt("starts_at", now.toISOString())
    .lte("starts_at", until.toISOString())
    .in("status", ["booked", "confirmed"])
    .order("starts_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Who's already sent their hair notes in, so the reminder doesn't ask again.
  const { data: filled } = await admin
    .from("appointment_intake")
    .select("appointment_id")
    .in("appointment_id", (appts ?? []).map((a) => a.id as string));
  const filledIn = new Set(
    (filled ?? []).map((r) => (r as { appointment_id: string }).appointment_id),
  );

  type ClientRow = { full_name: string };
  type ServiceRow = { name: string };

  let texted = 0;
  const skippedSms: Record<string, number> = {};
  const note = (bucket: Record<string, number>, r: string) => {
    bucket[r] = (bucket[r] ?? 0) + 1;
  };

  for (const appt of appts ?? []) {
    const client = one(appt.clients as unknown as ClientRow | ClientRow[] | null);
    const service = one(appt.services as unknown as ServiceRow | ServiceRow[] | null);
    const serviceName = service?.name ?? "your appointment";

    // --- Text ---
    // sendClientSms owns the consent, opt-out and quiet-hours rules; this only
    // decides whether we've already texted about this particular appointment.
    if (appt.reminder_sms_sent_at) {
      note(skippedSms, "already_sent");
    } else if (!appt.client_id) {
      note(skippedSms, "no_client");
    } else {
      const res = await sendClientSms(admin, {
        clientId: appt.client_id as string,
        appointmentId: appt.id as string,
        body: reminderText({
          clientName: client?.full_name ?? null,
          service: serviceName,
          startsAt: appt.starts_at as string,
          // Only nag about the form if they haven't already filled it in.
          appointmentId: filledIn.has(appt.id as string)
            ? null
            : (appt.id as string),
        }),
      });
      if (res.ok) {
        await admin
          .from("appointments")
          .update({ reminder_sms_sent_at: new Date().toISOString() })
          .eq("id", appt.id);
        texted++;
      } else {
        note(skippedSms, res.reason);
      }
    }
  }

  return NextResponse.json({
    texted,
    considered: appts?.length ?? 0,
    skipped_sms: skippedSms,
    window_hours: LOOKAHEAD_HOURS,
  });
}

// Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`. Without the
// secret set this would be a public endpoint that emails every client on
// demand, so an unset secret refuses to run rather than defaulting to open.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return run();
}

// Same job, for running it by hand from the studio or a terminal.
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return run();
}
