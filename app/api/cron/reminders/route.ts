import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { appointmentEmail, emailConfigured, sendEmail } from "../../../../lib/email";
import { automationEnabled, sendClientSms } from "../../../../lib/sms";
import { reminderText } from "../../../../lib/smsTemplates";

// Daily appointment-reminder email. Run by Vercel Cron (see vercel.json).
//
// Vercel's free plan allows one cron run per day, which suits a salon fine: it
// fires each morning and reminds everyone due in the next 36 hours. The window
// overlaps deliberately — a client booked at 4pm for 10am tomorrow is only 18
// hours out and still gets caught by the next morning's run.
//
// reminder_email_sent_at is the idempotency key, so the overlapping window can
// never send twice. It's stamped only after a successful send, so a transient
// Resend failure is retried by tomorrow's run rather than silently swallowed.
//
// The same run now also sends the reminder TEXT, tracked by its own timestamp.
// One job rather than two because the question is identical — who's due soon
// and hasn't been reminded? — and because Vercel's free plan allows one cron a
// day, so a second daily job isn't available to spend.
//
// A client with both an email and a texting consent gets both. That reads as
// redundant on paper and isn't in practice: email is where the calendar link
// and the cancellation policy live, and the text is the one she'll actually
// see. Anyone who finds it excessive can stop either independently.

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
  // Neither channel being available is the only reason to stop early; one
  // without the other is normal, and was the state all through August.
  if (!emailConfigured() && !automationEnabled()) {
    return NextResponse.json({ sent: 0, reason: "no_channel_configured" });
  }

  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 3600 * 1000);

  // Fetch everything due in the window and decide per channel below, rather
  // than filtering on one channel's timestamp — an appointment that was emailed
  // yesterday may still be owed a text today.
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

  type ClientRow = {
    full_name: string;
    email: string | null;
    email_opt_out?: boolean;
  };
  type ServiceRow = { name: string };

  let emailed = 0;
  let texted = 0;
  const skippedEmail: Record<string, number> = {};
  const skippedSms: Record<string, number> = {};
  const note = (bucket: Record<string, number>, r: string) => {
    bucket[r] = (bucket[r] ?? 0) + 1;
  };

  for (const appt of appts ?? []) {
    const client = one(appt.clients as unknown as ClientRow | ClientRow[] | null);
    const service = one(appt.services as unknown as ServiceRow | ServiceRow[] | null);
    const serviceName = service?.name ?? "your appointment";

    // --- Email ---
    if (appt.reminder_email_sent_at) {
      note(skippedEmail, "already_sent");
    } else if (!emailConfigured()) {
      note(skippedEmail, "email_unconfigured");
    } else if (!client?.email) {
      note(skippedEmail, "no_email");
    } else if (client.email_opt_out) {
      note(skippedEmail, "opted_out");
    } else {
      const { subject, html, text } = appointmentEmail({
        firstName: client.full_name?.trim().split(" ")[0] || "there",
        service: serviceName,
        startsAt: appt.starts_at as string,
        kind: "reminder",
      });
      const res = await sendEmail({ to: client.email, subject, html, text });
      if (res.ok) {
        // Stamped only on success, so a bad day at Resend is retried tomorrow.
        await admin
          .from("appointments")
          .update({ reminder_email_sent_at: new Date().toISOString() })
          .eq("id", appt.id);
        emailed++;
      } else {
        note(skippedEmail, res.reason);
      }
    }

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
    emailed,
    texted,
    considered: appts?.length ?? 0,
    skipped_email: skippedEmail,
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
