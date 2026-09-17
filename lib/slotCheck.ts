import type { SupabaseClient } from "@supabase/supabase-js";
import { salonWallToISO } from "./format";

// "Can I say yes to this?" — answered before she presses Book.
//
// Bookings reach Evelyn from places the app doesn't see: Salon Lofts emails,
// texts, someone at the desk. When one arrives she needs to know, before
// replying, whether the time works. The booking forms used to say nothing until
// submit, and then only about clashes with other appointments — never about her
// own time off or her working hours, because the studio's inserts aren't held
// to either.
//
// Clashes are judged against appointment_busy, not appointment start-to-end.
// Those are the blocks the database actually refuses to overlap, and they're
// what make a colour client's processing gap bookable: a 45-minute cut can sit
// inside someone else's hour under the dryer. Checking the whole span would
// report that as a clash when the database would accept it, and teach her to
// ignore the warning.

export type SlotClash = {
  id: string;
  who: string;
  service: string;
  startsAt: string;
  endsAt: string;
};

export type SlotReport = {
  startsAt: string;
  endsAt: string;
  /** Busy blocks overlap — the database will refuse this booking. */
  clashes: SlotClash[];
  /** Overlaps an appointment's span but only its processing gap. Allowed. */
  inGapOf: SlotClash[];
  /** Her own time off. The studio can still book over it. */
  blocks: { reason: string | null; startsAt: string; endsAt: string }[];
  /** No working hours at all that day. */
  closed: boolean;
  /** Open that day, but this time runs outside every window. */
  outsideHours: boolean;
  /** The day's hours as she set them, for the message. */
  hours: { start: string; end: string }[];
};

type Svc = {
  duration_minutes: number;
  start_minutes: number | null;
  process_minutes: number | null;
  finish_minutes: number | null;
};

type Row = Record<string, unknown>;

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

function toClash(a: Row): SlotClash {
  const client = one(a.clients as { full_name: string } | null);
  const service = one(a.services as { name: string } | null);
  return {
    id: a.id as string,
    who: client?.full_name ?? "A client",
    service: service?.name ?? "an appointment",
    startsAt: a.starts_at as string,
    endsAt: a.ends_at as string,
  };
}

export async function checkSlot(
  db: SupabaseClient,
  opts: {
    serviceId: string;
    /** Wall-clock salon time, "YYYY-MM-DDTHH:MM". */
    local: string;
    /** The appointment being moved, which can't clash with itself. */
    ignoreAppointmentId?: string;
  },
): Promise<SlotReport | null> {
  const { data: svc } = await db
    .from("services")
    // `*` so the timing columns from 0012 are tolerated if they're ever absent.
    .select("*")
    .eq("id", opts.serviceId)
    .maybeSingle<Svc>();
  if (!svc) return null;

  // Same arithmetic as appointments_set_span and rebuild_appointment_busy, so
  // the answer here is the answer the database will give.
  const segStart = svc.start_minutes ?? 0;
  const segProcess = svc.process_minutes ?? 0;
  const segFinish = svc.finish_minutes ?? 0;
  const total = segStart + segProcess + segFinish;
  const duration = total > 0 ? total : svc.duration_minutes;

  const startsAt = salonWallToISO(opts.local);
  const s = new Date(startsAt).getTime();
  const endsAt = new Date(s + duration * 60000).toISOString();
  const e = new Date(endsAt).getTime();

  const mine: [number, number][] =
    segProcess > 0 && segStart > 0
      ? [
          [s, s + segStart * 60000],
          ...(segFinish > 0
            ? ([[s + (segStart + segProcess) * 60000, e]] as [number, number][])
            : []),
        ]
      : [[s, e]];

  const [datePart, timePart] = opts.local.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();

  const [busyRes, spanRes, offRes, hoursRes] = await Promise.all([
    db
      .from("appointment_busy")
      .select(
        "appointment_id,starts_at,ends_at,appointments(id,starts_at,ends_at,clients(full_name),services(name))",
      )
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt),
    db
      .from("appointments")
      .select("id,starts_at,ends_at,clients(full_name),services(name)")
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .not("status", "in", "(cancelled,no_show)"),
    db
      .from("time_off")
      .select("starts_at,ends_at,reason")
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .order("starts_at"),
    db
      .from("availability_rules")
      .select("start_time,end_time")
      .eq("weekday", weekday)
      .eq("active", true)
      .order("start_time"),
  ]);

  const clashes = new Map<string, SlotClash>();
  for (const b of (busyRes.data ?? []) as Row[]) {
    const id = b.appointment_id as string;
    if (id === opts.ignoreAppointmentId) continue;
    const bs = new Date(b.starts_at as string).getTime();
    const be = new Date(b.ends_at as string).getTime();
    // The fetch overlapped the whole span; only her actual busy blocks count.
    if (!mine.some(([ms, me]) => bs < me && be > ms)) continue;
    const appt = one<Row>(b.appointments as Row | Row[] | null);
    if (appt && !clashes.has(id)) clashes.set(id, toClash(appt));
  }

  const inGapOf = ((spanRes.data ?? []) as Row[])
    .filter(
      (a) =>
        a.id !== opts.ignoreAppointmentId && !clashes.has(a.id as string),
    )
    .map((a) => toClash(a));

  const hours = ((hoursRes.data ?? []) as Row[]).map((r) => ({
    start: String(r.start_time).slice(0, 5),
    end: String(r.end_time).slice(0, 5),
  }));

  // Minutes past midnight on the day she picked. A finish past midnight can't
  // be inside any window, so it's outside by construction.
  const startMin = toMin(timePart ?? "00:00");
  const endMin = startMin + duration;
  const closed = hours.length === 0;
  const outsideHours =
    !closed &&
    !hours.some((h) => toMin(h.start) <= startMin && toMin(h.end) >= endMin);

  return {
    startsAt,
    endsAt,
    clashes: [...clashes.values()],
    inGapOf,
    blocks: ((offRes.data ?? []) as Row[]).map((b) => ({
      reason: (b.reason as string | null) ?? null,
      startsAt: b.starts_at as string,
      endsAt: b.ends_at as string,
    })),
    closed,
    outsideHours,
    hours,
  };
}
