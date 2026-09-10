import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import {
  scheduleDigestEmail,
  sendEmail,
  emailConfigured,
  type DigestRow,
} from "../../../../lib/email";

// Evelyn's schedule for the day, emailed at 7am.
//
// The one thing she had no way to see without the app. If the studio is down,
// or her phone can't reach it, or she's simply not going to open it before her
// first client — the day is in her inbox either way, in the body of the mail
// rather than behind a link.
//
// Sent for TODAY, not tomorrow, because it arrives at 7am and the useful
// question at 7am is what the next twelve hours look like.
//
// Silent on her days off. There's no value in an email every Wednesday saying
// she's closed on Wednesday, so a day with no working hours, no appointments
// and no blocks sends nothing at all. A day she's open with an empty book does
// send — that's information, and Outreach exists to act on it.

// SCHEDULE: "0 11 * * *" in vercel.json.
//
// 11:00 UTC is 7am Eastern while the clocks are forward, and 6am once they go
// back — Vercel Cron takes no timezone and knows nothing about DST, so the
// choice is which half of the year to be right in. Forward was picked because
// that's now; an email arriving an hour early in January is harmless.
//
// Hobby fires anywhere inside the named hour, so in practice this lands
// between 7:00 and 7:59. Fine for a schedule, and the reason the short-notice
// booking alert is triggered by the booking rather than by a clock.
//
// Two cron jobs is well within the plan: Hobby allows 100, each limited to one
// run per day. (A comment in the reminders job used to say the limit was one
// run per day across the whole account. It isn't, and believing it would have
// ruled this job out.)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "America/New_York";

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// Today's date in the salon's timezone as YYYY-MM-DD, and the weekday number
// Postgres uses (0 = Sunday). Read from the salon's clock rather than the
// server's: this runs at 11:00 UTC, which is already "today" in UTC but must
// resolve to the same day Evelyn is about to have.
function salonToday(now = new Date()) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(now);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekdayName,
  );
  return { key, weekday };
}

// "GMT-04:00" → "-04:00". Falls back to EST if the format ever changes.
function offsetAt(instant: Date): string {
  const v = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;
  return v?.replace("GMT", "") || "-05:00";
}

// The instant of local midnight for a salon-local date.
//
// Two passes, because finding the offset at midnight requires knowing when
// midnight is. Probing at noon is right on 363 days and wrong on the two the
// clocks move: on the March day it reports the post-change offset and puts
// "midnight" at 11pm the evening before. So the first answer is used to build a
// candidate instant, the offset is re-read AT that instant, and if the two
// disagree the candidate is rebuilt with the real one. That converges,
// because the disagreement can only be the one hour of the transition.
function dayStart(dayKey: string): Date {
  const first = offsetAt(new Date(`${dayKey}T12:00:00Z`));
  const candidate = new Date(`${dayKey}T00:00:00${first}`);
  const actual = offsetAt(candidate);
  return actual === first
    ? candidate
    : new Date(`${dayKey}T00:00:00${actual}`);
}

function nextDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// Midnight to midnight for a salon-local date. The end is the NEXT day's
// midnight rather than start + 24h — a local day is 23 or 25 hours long twice
// a year, and adding a fixed day would spill an hour into the next one.
function dayBounds(dayKey: string) {
  return {
    start: dayStart(dayKey).toISOString(),
    end: dayStart(nextDay(dayKey)).toISOString(),
  };
}

async function run() {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }
  const to = process.env.SALON_OWNER_EMAIL;
  if (!to) return NextResponse.json({ sent: false, reason: "no_owner_email" });
  if (!emailConfigured()) {
    return NextResponse.json({ sent: false, reason: "email_unconfigured" });
  }

  const { key: dayKey, weekday } = salonToday();
  const { start, end } = dayBounds(dayKey);

  const [apptsRes, blocksRes, hoursRes] = await Promise.all([
    admin
      .from("appointments")
      .select("starts_at,ends_at,price_cents,clients(full_name,phone,created_at),services(name),created_at")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .not("status", "in", "(cancelled,no_show)")
      .order("starts_at"),
    // Overlap, not "starts today" — the middle day of a week off is still off.
    admin
      .from("time_off")
      .select("starts_at,ends_at,reason")
      .lt("starts_at", end)
      .gt("ends_at", start)
      .order("starts_at"),
    admin
      .from("availability_rules")
      .select("weekday")
      .eq("weekday", weekday)
      .eq("active", true)
      .limit(1),
  ]);

  type ClientRow = { full_name: string | null; phone: string | null; created_at: string | null };
  type ServiceRow = { name: string };

  const appts = apptsRes.data ?? [];
  const blocks = blocksRes.data ?? [];
  const isWorkingDay = (hoursRes.data ?? []).length > 0;

  // Nothing to say, and a day she isn't working. Say nothing.
  if (!isWorkingDay && appts.length === 0 && blocks.length === 0) {
    return NextResponse.json({ sent: false, reason: "closed_and_empty", day: dayKey });
  }

  const rows: DigestRow[] = [];
  let chairMinutes = 0;
  let expectedCents = 0;

  for (const a of appts) {
    const client = one(a.clients as unknown as ClientRow | ClientRow[] | null);
    const service = one(a.services as unknown as ServiceRow | ServiceRow[] | null);
    const startsAt = a.starts_at as string;
    const endsAt = a.ends_at as string;
    chairMinutes += Math.max(
      0,
      Math.round(
        (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
      ),
    );
    expectedCents += (a.price_cents as number | null) ?? 0;
    // Same test the booking alert uses: the clients row was created by the
    // booking itself, within a second of it.
    const isNew =
      Boolean(client?.created_at) &&
      new Date(a.created_at as string).getTime() -
        new Date(client!.created_at as string).getTime() <
        60 * 1000;
    rows.push({
      kind: "appt",
      startsAt,
      endsAt,
      who: client?.full_name ?? "A client",
      service: service?.name ?? "Appointment",
      phone: client?.phone ?? null,
      isNew,
    });
  }

  for (const b of blocks) {
    rows.push({
      kind: "block",
      startsAt: b.starts_at as string,
      endsAt: b.ends_at as string,
      reason: (b.reason as string | null) ?? null,
    });
  }

  // One list in time order, so the email is a picture of the day rather than
  // clients-then-blocks.
  rows.sort(
    (x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime(),
  );

  const firstIn = appts.length ? (appts[0].starts_at as string) : null;
  const lastOut = appts.length
    ? appts
        .map((a) => a.ends_at as string)
        .reduce((a, b) => (new Date(a) > new Date(b) ? a : b))
    : null;

  const { subject, html, text } = scheduleDigestEmail({
    dayISO: start,
    label: "Today",
    rows,
    apptCount: appts.length,
    chairMinutes,
    expectedCents,
    firstIn,
    lastOut,
  });

  const res = await sendEmail({ to, subject, html, text });
  if (!res.ok) {
    return NextResponse.json({ sent: false, reason: res.reason, detail: res.detail });
  }
  return NextResponse.json({
    sent: true,
    day: dayKey,
    appointments: appts.length,
    blocks: blocks.length,
  });
}

// Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`. Without the
// secret set this would be a public endpoint that reveals her whole day and
// every client's phone number to anyone who guessed the URL, so an unset
// secret refuses rather than defaulting to open.
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

// Same job, for sending one by hand to check it.
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return run();
}
