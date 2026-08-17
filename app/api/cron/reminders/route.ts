import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { appointmentEmail, emailConfigured, sendEmail } from "../../../../lib/email";

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
  if (!emailConfigured()) {
    return NextResponse.json({ sent: 0, reason: "email_unconfigured" });
  }

  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 3600 * 1000);

  const { data: appts, error } = await admin
    .from("appointments")
    .select("*, services(name), clients(*)")
    .gt("starts_at", now.toISOString())
    .lte("starts_at", until.toISOString())
    .is("reminder_email_sent_at", null)
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

  let sent = 0;
  const skipped: Record<string, number> = {};
  const note = (r: string) => {
    skipped[r] = (skipped[r] ?? 0) + 1;
  };

  for (const appt of appts ?? []) {
    const client = one(appt.clients as unknown as ClientRow | ClientRow[] | null);
    const service = one(appt.services as unknown as ServiceRow | ServiceRow[] | null);

    if (!client?.email) {
      note("no_email");
      continue;
    }
    if (client.email_opt_out) {
      note("opted_out");
      continue;
    }

    const { subject, html, text } = appointmentEmail({
      firstName: client.full_name?.trim().split(" ")[0] || "there",
      service: service?.name ?? "your appointment",
      startsAt: appt.starts_at as string,
      kind: "reminder",
    });

    const res = await sendEmail({ to: client.email, subject, html, text });
    if (!res.ok) {
      // Leave the timestamp null so tomorrow's run tries again.
      note(res.reason);
      continue;
    }

    await admin
      .from("appointments")
      .update({ reminder_email_sent_at: new Date().toISOString() })
      .eq("id", appt.id);
    sent++;
  }

  return NextResponse.json({
    sent,
    considered: appts?.length ?? 0,
    skipped,
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
