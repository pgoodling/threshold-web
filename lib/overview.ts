// Money → Overview's arithmetic: which period a day falls in, revenue against
// expenses per period, and the breakdown of one period. Kept out of the screen
// so tests can hold it to answers worked out by hand.
//
// Revenue is what clients paid — check-outs (dated the day of the work) and
// product sales before tax — not bank deposits. Expenses are sorted business
// transactions in the running categories; 'capital' ones (furniture,
// equipment, decor) are "setting up", counted but kept apart. Savings
// transfers, owner draws and personal spending never appear.

export type Grain = "week" | "month" | "quarter" | "year";

export type OverviewAppt = { starts_at: string; paid_cents: number | null; services: { name: string } | null };
export type OverviewSale = { sold_on: string; subtotal_cents: number };
export type OverviewTxn = {
  id: string;
  posted_on: string;
  amount_cents: number;
  merchant: string | null;
  description: string | null;
  expense_categories: { name: string; kind: string } | null;
};
export type Totals = { revenue: number; expenses: number; setup: number };

export const EXPENSE_KINDS = ["fixed", "product", "variable", "resale"];
export const SETUP_KIND = "capital";
// Six weeks, not eight: at eight, the profit figures under the bars touch on a phone.
export const HOW_MANY: Record<Grain, number> = { week: 6, month: 6, quarter: 4, year: 3 };

export const salonDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
export const utc = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

/** The key of the period a day falls in. Weeks start Monday. */
export function periodOf(ymd: string, g: Grain): string {
  if (g === "year") return ymd.slice(0, 4);
  if (g === "month") return ymd.slice(0, 7);
  if (g === "quarter") return `${ymd.slice(0, 4)}-Q${Math.floor((Number(ymd.slice(5, 7)) - 1) / 3) + 1}`;
  const d = utc(ymd);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return ymdOf(d);
}

/** The n periods ending with the one `today` is in, oldest first. */
export function periodsBack(g: Grain, n: number, today: string): string[] {
  const out: string[] = [];
  const d = utc(today);
  for (let i = 0; i < n; i++) {
    out.unshift(periodOf(ymdOf(d), g));
    if (g === "week") d.setUTCDate(d.getUTCDate() - 7);
    else if (g === "month") d.setUTCMonth(d.getUTCMonth() - 1, 1);
    else if (g === "quarter") d.setUTCMonth(d.getUTCMonth() - 3, 1);
    else d.setUTCFullYear(d.getUTCFullYear() - 1, 0, 1);
  }
  return out;
}

/**
 * The periods to draw: the last HOW_MANY, but starting at the first one with
 * any money in it — empty months before she opened just squeeze the chart.
 * The current period always stays.
 */
export function visiblePeriods(
  g: Grain,
  today: string,
  appts: OverviewAppt[],
  sales: OverviewSale[],
  txns: OverviewTxn[],
): string[] {
  const all = periodsBack(g, HOW_MANY[g], today);
  const days = [
    ...appts.map((a) => salonDay(a.starts_at)),
    ...sales.map((x) => x.sold_on),
    ...txns.map((t) => t.posted_on),
  ].sort();
  if (days.length === 0) return all.slice(-1);
  const first = periodOf(days[0], g);
  const from = all.findIndex((p) => p >= first);
  return from === -1 ? all.slice(-1) : all.slice(from);
}

export function periodLabel(key: string, g: Grain, long = false): string {
  if (g === "year") return key;
  if (g === "quarter") return long ? `${key.slice(5)} ${key.slice(0, 4)}` : key.slice(5);
  if (g === "month")
    return utc(`${key}-15`).toLocaleDateString("en-US", { month: long ? "long" : "short", timeZone: "UTC" });
  if (!long) return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`; // 9/7 fits under a bar
  const s = utc(key).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `Week of ${s}`;
}

/** Revenue, running expenses and setting-up costs for each period. */
export function bucketTotals(
  periods: string[],
  g: Grain,
  appts: OverviewAppt[],
  sales: OverviewSale[],
  txns: OverviewTxn[],
): Map<string, Totals> {
  const m = new Map<string, Totals>(periods.map((p) => [p, { revenue: 0, expenses: 0, setup: 0 }]));
  for (const a of appts) {
    const b = m.get(periodOf(salonDay(a.starts_at), g));
    if (b) b.revenue += a.paid_cents ?? 0;
  }
  for (const s of sales) {
    const b = m.get(periodOf(s.sold_on, g));
    if (b) b.revenue += s.subtotal_cents;
  }
  for (const t of txns) {
    const kind = t.expense_categories?.kind ?? "";
    const b = m.get(periodOf(t.posted_on, g));
    if (!b) continue;
    // Negated, so a refund in an expense category reduces it.
    if (EXPENSE_KINDS.includes(kind)) b.expenses -= t.amount_cents;
    else if (kind === SETUP_KIND) b.setup -= t.amount_cents;
  }
  return m;
}

export type Breakdown = {
  services: [string, { cents: number; visits: number }][];
  productCents: number;
  running: [string, { cents: number; setup: boolean; rows: OverviewTxn[] }][];
  setup: [string, { cents: number; setup: boolean; rows: OverviewTxn[] }][];
  cats: Map<string, { cents: number; setup: boolean; rows: OverviewTxn[] }>;
};

/** One period, broken down: revenue by service, expenses by category. */
export function breakdown(
  selected: string,
  g: Grain,
  appts: OverviewAppt[],
  sales: OverviewSale[],
  txns: OverviewTxn[],
): Breakdown {
  const inPeriod = (ymd: string) => periodOf(ymd, g) === selected;
  const services = new Map<string, { cents: number; visits: number }>();
  for (const a of appts) {
    if (!inPeriod(salonDay(a.starts_at))) continue;
    const k = a.services?.name ?? "Other";
    const v = services.get(k) ?? { cents: 0, visits: 0 };
    v.cents += a.paid_cents ?? 0;
    v.visits += 1;
    services.set(k, v);
  }
  const productCents = sales.filter((s) => inPeriod(s.sold_on)).reduce((t, s) => t + s.subtotal_cents, 0);

  const cats = new Map<string, { cents: number; setup: boolean; rows: OverviewTxn[] }>();
  for (const t of txns) {
    const kind = t.expense_categories?.kind ?? "";
    if (!inPeriod(t.posted_on)) continue;
    if (!EXPENSE_KINDS.includes(kind) && kind !== SETUP_KIND) continue;
    const k = t.expense_categories!.name;
    const v = cats.get(k) ?? { cents: 0, setup: kind === SETUP_KIND, rows: [] };
    v.cents -= t.amount_cents;
    v.rows.push(t);
    cats.set(k, v);
  }
  const byCents = <T extends { cents: number }>(a: [string, T], b: [string, T]) => b[1].cents - a[1].cents;
  return {
    services: [...services.entries()].sort(byCents),
    productCents,
    running: [...cats.entries()].filter(([, v]) => !v.setup).sort(byCents),
    setup: [...cats.entries()].filter(([, v]) => v.setup).sort(byCents),
    cats,
  };
}
