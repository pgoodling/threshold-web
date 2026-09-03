// What's on the books ahead, and how much of it usually turns into money.
//
// Two numbers that must never be run together, because confusing them is how a
// forecast becomes a lie:
//
//   booked     the price of every future appointment that hasn't been
//              cancelled. A ceiling. Nobody has paid this.
//   expected   booked, discounted by how often her booked appointments
//              actually get paid for. A forecast.
//
// `expected` is only honest once there's enough history behind the rate. A
// completion rate off four appointments is noise dressed as arithmetic, and a
// number like that is worse than no number — it gets believed and planned
// against. So the rate is returned as null until there's a real sample, and the
// UI is expected to say so rather than quietly falling back to 100%.

/** Below this many decided appointments, a completion rate means nothing. */
export const MIN_DECIDED_FOR_RATE = 12;

export type ApptLike = {
  starts_at: string;
  status: string;
  price_cents: number | null;
  paid_cents: number | null;
};

const PAID = ["checked_out", "completed"];
/** Booked, then didn't produce money. Reschedules aren't here: the appointment
 *  moves, the row stays live, and it gets counted on its new date. */
const LOST = ["cancelled", "no_show"];

/** Future and not cancelled — money that could still arrive. */
export const isAhead = (r: ApptLike, now = Date.now()) =>
  new Date(r.starts_at).getTime() >= now &&
  (r.status === "booked" || r.status === "confirmed");

/** What an appointment is worth. Ahead of time that's the price agreed at
 *  booking; afterwards it's what was actually taken. */
export const value = (r: ApptLike) => r.paid_cents ?? r.price_cents ?? 0;

/**
 * How much of what she books turns into money, by value rather than by count —
 * losing one blonding session hurts more than losing one fringe trim, and a
 * count-based rate hides that.
 *
 * Null when there isn't enough decided history to mean anything.
 */
export function completionRate(rows: ApptLike[], now = Date.now()) {
  const decided = rows.filter(
    (r) =>
      new Date(r.starts_at).getTime() < now &&
      (PAID.includes(r.status) || LOST.includes(r.status)),
  );
  if (decided.length < MIN_DECIDED_FOR_RATE) {
    return { rate: null as number | null, sample: decided.length };
  }
  const kept = decided
    .filter((r) => PAID.includes(r.status))
    .reduce((s, r) => s + value(r), 0);
  const total = decided.reduce((s, r) => s + value(r), 0);
  return { rate: total > 0 ? kept / total : null, sample: decided.length };
}

export type Bucket = {
  /** Start of the bucket, salon-local. */
  start: Date;
  /** Terse, for the axis, where width is scarce and position gives context. */
  label: string;
  /** Unambiguous, for prose and the table. "Busiest is T" is not a sentence —
   *  there are two Tuesdays in a fortnight and she can't act on either. */
  fullLabel: string;
  booked: number;
  count: number;
};

/**
 * Money on the books, bucketed forward from today.
 *
 * Empty buckets are included deliberately. A week with nothing in it is the
 * single most useful thing on this screen — it's the shortfall, far enough out
 * that outreach can still fill it — and a chart that only plots weeks with
 * bookings would draw a reassuring line straight through the gap.
 */
export function bucketAhead(
  rows: ApptLike[],
  grain: "day" | "week" | "month",
  count: number,
  now = new Date(),
): Bucket[] {
  const buckets: Bucket[] = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (grain === "week") start.setDate(start.getDate() - start.getDay());
  if (grain === "month") start.setDate(1);

  for (let i = 0; i < count; i++) {
    const s = new Date(start);
    if (grain === "day") s.setDate(start.getDate() + i);
    if (grain === "week") s.setDate(start.getDate() + i * 7);
    if (grain === "month") s.setMonth(start.getMonth() + i);
    buckets.push({
      start: s,
      label: bucketLabel(s, grain),
      fullLabel: bucketFullLabel(s, grain),
      booked: 0,
      count: 0,
    });
  }

  // The end of the window, so appointments beyond it aren't folded into the
  // last bucket and made to look like a bumper month.
  const end = new Date(buckets[buckets.length - 1].start);
  if (grain === "day") end.setDate(end.getDate() + 1);
  if (grain === "week") end.setDate(end.getDate() + 7);
  if (grain === "month") end.setMonth(end.getMonth() + 1);

  for (const r of rows) {
    if (!isAhead(r, now.getTime())) continue;
    const t = new Date(r.starts_at);
    if (t >= end) continue;

    // Walk back to find the bucket it lands in. Linear, but this is at most a
    // few dozen buckets against a few hundred appointments.
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= buckets[i].start) {
        buckets[i].booked += value(r);
        buckets[i].count += 1;
        break;
      }
    }
  }

  return buckets;
}

function bucketLabel(d: Date, grain: "day" | "week" | "month") {
  if (grain === "month")
    return d.toLocaleDateString("en-US", { month: "short" });
  if (grain === "week")
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  // Day of month, not a weekday initial: a fortnight contains two Tuesdays and
  // "T" identifies neither of them.
  return String(d.getDate());
}

function bucketFullLabel(d: Date, grain: "day" | "week" | "month") {
  if (grain === "month")
    return d.toLocaleDateString("en-US", { month: "long" });
  // The article lives here rather than in the sentence, because "the November"
  // isn't English and "week of Oct 11" on its own isn't either.
  if (grain === "week")
    return `the week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
