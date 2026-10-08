// What each service earns per hour of her hands — the arithmetic behind
// Money → Services, kept out of the screen so tests can hold it to answers
// worked out by hand.
//
// Per hour of her HANDS: a free processing gap is time she can give another
// client, so it isn't counted against the service; blocked processing is.
// Timing comes from the visit where she set its own, otherwise the service.
// Card fees are her own Intuit fees over Intuit deposits, on card visits only.
// Product per visit is passed in -- see lib/productCost.ts.

export type EarningsAppt = {
  id: string;
  starts_at: string;
  paid_cents: number | null;
  payment_method: string | null;
  start_minutes: number | null;
  process_minutes: number | null;
  finish_minutes: number | null;
  block_processing: boolean | null;
  services: EarningsService | EarningsService[] | null;
};

type EarningsService = {
  name: string;
  price_cents: number | null;
  start_minutes: number | null;
  process_minutes: number | null;
  finish_minutes: number | null;
  duration_minutes: number | null;
};

export type Visit = {
  id: string;
  day: string;
  paidCents: number;
  feeCents: number;
  card: boolean;
  handMinutes: number;
  chairMinutes: number;
  processMinutes: number;
  startMinutes: number;
  finishMinutes: number;
};

export type ServiceRow = { name: string; listCents: number | null; visits: Visit[] };

const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

/** Intuit's fees over Intuit's deposits. 0 when there are no deposits yet. */
export function cardFeeRate(
  txns: { amount_cents: number; category: string }[],
): number {
  let fees = 0;
  let deposits = 0;
  for (const t of txns) {
    if (t.category === "Card processing fees") fees += Math.abs(t.amount_cents);
    if (t.category === "Card revenue (Intuit)" && t.amount_cents > 0) deposits += t.amount_cents;
  }
  return deposits > 0 ? fees / deposits : 0;
}

/** Paid visits grouped by service, each with its fee and minutes. */
export function serviceRows(appts: EarningsAppt[], feeRate: number): ServiceRow[] {
  const by = new Map<string, ServiceRow>();
  for (const a of appts) {
    const sv = one(a.services);
    const paid = a.paid_cents ?? 0;
    if (paid <= 0 || !sv) continue;
    const st = a.start_minutes ?? sv.start_minutes ?? 0;
    const pr = a.process_minutes ?? sv.process_minutes ?? 0;
    const fi = a.finish_minutes ?? sv.finish_minutes ?? 0;
    const chair = st + pr + fi || sv.duration_minutes || 0;
    const freeGap = pr > 0 && !a.block_processing;
    const card = a.payment_method === "card";
    const row = by.get(sv.name) ?? { name: sv.name, listCents: sv.price_cents, visits: [] };
    row.visits.push({
      id: a.id,
      day: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(a.starts_at)),
      paidCents: paid,
      feeCents: card ? Math.round(paid * feeRate) : 0,
      card,
      handMinutes: freeGap ? st + fi : chair,
      chairMinutes: chair,
      processMinutes: freeGap ? pr : 0,
      startMinutes: st,
      finishMinutes: fi,
    });
    by.set(sv.name, row);
  }
  return [...by.values()];
}

export const sumVisits = (vs: Visit[], k: keyof Visit) =>
  vs.reduce((t, v) => t + (v[k] as number), 0);

export const perHour = (netCents: number, minutes: number) =>
  minutes > 0 ? (netCents / minutes) * 60 : 0;

/** (paid − fees − product per visit × visits) ÷ hands minutes × 60, in cents. */
export const handRate = (r: ServiceRow, productPerVisitCents = 0) =>
  perHour(
    sumVisits(r.visits, "paidCents") - sumVisits(r.visits, "feeCents") - productPerVisitCents * r.visits.length,
    sumVisits(r.visits, "handMinutes"),
  );
