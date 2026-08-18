import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { automationEnabled, sendClientSms } from "../../../../lib/sms";
import { runningLateText } from "../../../../lib/smsTemplates";

// "Still on your way?" — sent to a client who's past their start time and
// hasn't arrived.
//
// The point isn't to chase anyone. It's that a no-show and a client stuck in
// traffic look identical from behind the chair, and they call for opposite
// responses: hold the slot, or fill it. Asking costs a cent and usually gets an
// answer within a minute or two.
//
// Unlike the daily reminder this needs to run OFTEN — a message sent forty
// minutes after someone was due is useless. Vercel's free plan allows one cron
// run per day, so this endpoint deliberately doesn't assume a scheduler: it's
// safe to call as often as you like, does nothing when nothing is due, and can
// be driven by Supabase pg_cron, an external pinger, or a paid Vercel plan.
//
// GRACE_MINUTES is the whole design. Too short and it texts someone parking
// outside; too long and the answer arrives after the slot is unsalvageable.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRACE_MINUTES = 10;
// Don't chase this morning's no-show at teatime: past this, the appointment is
// a lost cause and a text is just odd.
const STALE_MINUTES = 90;

async function run() {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }
  if (!automationEnabled()) {
    return NextResponse.json({ texted: 0, reason: "automation_off" });
  }

  const now = Date.now();
  const dueBefore = new Date(now - GRACE_MINUTES * 60_000).toISOString();
  const dueAfter = new Date(now - STALE_MINUTES * 60_000).toISOString();

  // Still 'booked' or 'confirmed' past the grace period means nobody has
  // checked them in — checked_in, checked_out, no_show and cancelled all
  // represent someone having dealt with it.
  const { data: appts, error } = await admin
    .from("appointments")
    .select("id, client_id, starts_at, clients(full_name)")
    .gte("starts_at", dueAfter)
    .lte("starts_at", dueBefore)
    .is("late_ping_sent_at", null)
    .in("status", ["booked", "confirmed"])
    .order("starts_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let texted = 0;
  const skipped: Record<string, number> = {};
  const note = (r: string) => {
    skipped[r] = (skipped[r] ?? 0) + 1;
  };

  for (const appt of appts ?? []) {
    if (!appt.client_id) {
      note("no_client");
      continue;
    }
    const client = Array.isArray(appt.clients) ? appt.clients[0] : appt.clients;

    const res = await sendClientSms(admin, {
      clientId: appt.client_id as string,
      appointmentId: appt.id as string,
      body: runningLateText({
        clientName: (client as { full_name?: string } | null)?.full_name ?? null,
        startsAt: appt.starts_at as string,
      }),
      // Their appointment is happening now. Quiet hours can't apply to a
      // message about an appointment they booked inside opening hours.
      ignoreQuietHours: true,
    });

    if (res.ok) {
      await admin
        .from("appointments")
        .update({ late_ping_sent_at: new Date().toISOString() })
        .eq("id", appt.id);
      texted++;
    } else {
      note(res.reason);
    }
  }

  return NextResponse.json({
    texted,
    considered: appts?.length ?? 0,
    skipped,
    grace_minutes: GRACE_MINUTES,
  });
}

// Same shared-secret scheme as /api/cron/reminders: without CRON_SECRET set,
// this refuses to run rather than defaulting to an open endpoint that texts
// clients on demand.
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

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return run();
}
