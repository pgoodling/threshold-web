"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { estimateColourCost, type ColourCostEstimate, type Purchase } from "../../lib/colourCost";

// Services: what each one earns, per hour of her hands, after product.
//
// PER HOUR OF HER HANDS, NOT OF THE BOOKING. A highlight holds the chair for
// three hours, but forty-five minutes of that is processing, when she can
// take another client. Dividing by the whole booking would make every colour
// look worse than it is — so the headline divides by the time she's actually
// working on that head (before and after processing), and the chair figure is
// shown beside it for the days the gap goes unfilled. A service booked with
// processing blocked counts its whole length, because then it really is hers.
//
// PRODUCT COST IS "ABOUT". It uses the consumption-window method from
// lib/colourCost — each order spread over the appointments it covered before
// the next, by length — but over every product order since she opened, not
// colour alone. Nothing in her bank feed is categorised "Colour and developer"
// yet; every order sits under "Back bar and supplies", so a colour-only
// estimate had nothing to divide. Spreading all product by duration is the
// honest fallback: a three-hour highlight carries more than a haircut, which
// is directionally right, if blunt. Retail stock isn't in it — she sells that.
//
// CARD FEES come from her own statement: what Intuit charged, over what
// Intuit deposited. Applied only to visits paid by card.
//
// A service needs two paid visits to be ranked. One visit is an anecdote.

type Appt = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  paid_cents: number | null;
  payment_method: string | null;
  start_minutes: number | null;
  process_minutes: number | null;
  finish_minutes: number | null;
  block_processing: boolean | null;
  services: {
    name: string;
    price_cents: number | null;
    start_minutes: number | null;
    process_minutes: number | null;
    finish_minutes: number | null;
    duration_minutes: number | null;
  } | null;
};

type Row = {
  name: string;
  listCents: number | null;
  visits: number;
  paidCents: number; // totals, so averages weight properly
  productCents: number;
  feeCents: number;
  handMinutes: number;
  chairMinutes: number;
  processMinutes: number;
  startMinutes: number;
  finishMinutes: number;
};

const PRODUCT_CATEGORIES = ["Colour and developer", "Back bar and supplies"];
const MIN_VISITS = 2;

const whole = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const perHour = (net: number, minutes: number) => (minutes > 0 ? (net / minutes) * 60 : 0);
const hm = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${h} h${r ? ` ${r}` : ""}` : `${r} min`;
};

export default function MoneyServices() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [est, setEst] = useState<ColourCostEstimate | null>(null);
  const [feeRate, setFeeRate] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [showMethod, setShowMethod] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase
        .from("appointments")
        .select(
          "id,starts_at,ends_at,paid_cents,payment_method,status,start_minutes,process_minutes,finish_minutes,block_processing,services(name,price_cents,start_minutes,process_minutes,finish_minutes,duration_minutes)",
        )
        .not("status", "in", "(cancelled,no_show)"),
      supabase
        .from("bank_transactions")
        .select("posted_on,amount_cents,merchant,expense_categories(name)")
        .eq("is_business", true)
        .not("reviewed_at", "is", null),
      supabase.from("salon_settings").select("opened_on").limit(1).maybeSingle(),
    ]).then(([a, t, s]) => {
      if (!alive) return;
      if (a.error || t.error) setError((a.error ?? t.error)!.message);
      const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
      const appts = ((a.data ?? []) as unknown as (Appt & { status: string })[]).map((r) => ({
        ...r,
        services: one(r.services),
      }));
      const txns = (t.data ?? []).map((r) => ({
        posted_on: String(r.posted_on),
        amount_cents: Number(r.amount_cents),
        merchant: (r.merchant as string | null) ?? null,
        category: one(r.expense_categories as unknown as { name: string } | null)?.name ?? "",
      }));
      const openedOn = (s.data?.opened_on as string | null) ?? null;

      // Time comes from the service's own timings — or this visit's, where
      // she changed them on the appointment — not from how long the slot was
      // booked. One blowout sat in a two-hour slot; the question here is
      // whether the SERVICE is priced right, and a padded slot isn't the
      // service taking longer.
      const timing = (x: Appt) => {
        const sv = x.services;
        const st = x.start_minutes ?? sv?.start_minutes ?? 0;
        const pr = x.process_minutes ?? sv?.process_minutes ?? 0;
        const fi = x.finish_minutes ?? sv?.finish_minutes ?? 0;
        const total = st + pr + fi || sv?.duration_minutes || 0;
        return { st, pr, fi, total };
      };
      const chair = (x: Appt) => timing(x).total;

      // Product: every product order since opening, spread over every visit
      // by length. Orders before she opened stocked an empty salon.
      const purchases: Purchase[] = txns
        .filter((r) => PRODUCT_CATEGORIES.includes(r.category) && r.amount_cents < 0)
        .map((r) => ({
          postedOn: r.posted_on,
          amountCents: Math.abs(r.amount_cents),
          merchant: r.merchant,
          isStockUp: openedOn !== null && r.posted_on < openedOn,
        }));
      const estimate = estimateColourCost(
        purchases,
        appts.map((x) => ({ id: x.id, startsAt: x.starts_at, minutes: chair(x) })),
      );

      // Card fees: what Intuit took, over what it paid in.
      let fees = 0;
      let deposits = 0;
      for (const r of txns) {
        if (r.category === "Card processing fees") fees += Math.abs(r.amount_cents);
        if (r.category === "Card revenue (Intuit)" && r.amount_cents > 0) deposits += r.amount_cents;
      }
      const rate = deposits > 0 ? fees / deposits : 0;

      const perMinute = estimate.averagePerMinuteCents ?? 0;
      const by = new Map<string, Row>();
      for (const x of appts) {
        if (x.status !== "checked_out" && x.status !== "completed") continue;
        const paid = x.paid_cents ?? 0;
        if (paid <= 0 || !x.services) continue;
        const sv = x.services;
        const { st, pr, fi, total: c } = timing(x);
        // Blocked processing means nobody else could be booked in the gap.
        const hands = pr > 0 && !x.block_processing ? st + fi : c;
        const r =
          by.get(sv.name) ??
          ({
            name: sv.name,
            listCents: sv.price_cents,
            visits: 0,
            paidCents: 0,
            productCents: 0,
            feeCents: 0,
            handMinutes: 0,
            chairMinutes: 0,
            processMinutes: 0,
            startMinutes: 0,
            finishMinutes: 0,
          } as Row);
        r.visits += 1;
        r.paidCents += paid;
        r.productCents += Math.round(perMinute * c);
        r.feeCents += x.payment_method === "card" ? Math.round(paid * rate) : 0;
        r.handMinutes += hands;
        r.chairMinutes += c;
        r.processMinutes += pr > 0 && !x.block_processing ? pr : 0;
        r.startMinutes += st;
        r.finishMinutes += fi;
        by.set(sv.name, r);
      }

      setEst(estimate);
      setFeeRate(rate);
      setRows([...by.values()]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const net = (r: Row) => r.paidCents - r.productCents - r.feeCents;
  const ranked = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => r.visits >= MIN_VISITS)
        .sort((a, b) => perHour(net(b), b.handMinutes) - perHour(net(a), a.handMinutes)),
    [rows],
  );
  const few = (rows ?? []).filter((r) => r.visits < MIN_VISITS);
  const top = ranked[0] ? perHour(net(ranked[0]), ranked[0].handMinutes) : 1;
  // The lowest-earning service by a wide margin gets red, so it's findable.
  const lowBar = top * 0.5;

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (rows === null) return <p className="text-sm text-muted">Loading…</p>;

  // ---- One service, opened -------------------------------------------------------
  const r = open ? (rows.find((x) => x.name === open) ?? null) : null;
  if (r) {
    const avg = (c: number) => c / r.visits;
    const listGap =
      r.listCents && r.listCents > 0 ? avg(r.paidCents) / r.listCents - 1 : 0;
    return (
      <div className="max-w-xl">
        <button
          onClick={() => setOpen(null)}
          className="-ml-1 inline-flex items-center gap-1 text-left font-display text-xl"
        >
          <ChevronLeft size={20} className="shrink-0" /> {r.name}
        </button>
        <p className="mt-1 text-sm text-muted">
          {r.visits} paid visit{r.visits === 1 ? "" : "s"}
        </p>

        <div className="mt-4 flex gap-8">
          <div>
            <p className="text-3xl font-medium tabular-nums">{whole(perHour(net(r), r.handMinutes))}</p>
            <p className="text-xs text-muted">per hour of your hands</p>
          </div>
          {r.processMinutes > 0 && (
            <div>
              <p className="text-3xl font-medium tabular-nums text-muted">
                {whole(perHour(net(r), r.chairMinutes))}
              </p>
              <p className="text-xs text-muted">per hour in the chair</p>
            </div>
          )}
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm shadow-sm">
          <Line label="Average paid" value={whole(avg(r.paidCents))} />
          <Line
            label="Product"
            sub="about · estimated"
            value={est?.averagePerMinuteCents ? `−${whole(avg(r.productCents))}` : "—"}
          />
          <Line label="Card fee" sub={feeRate ? `${(feeRate * 100).toFixed(1)}% on card visits` : undefined} value={`−${whole(avg(r.feeCents))}`} />
          <Line label="Left for you" value={whole(avg(net(r)))} strong />
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm shadow-sm">
          <Line
            label="Your hands on it"
            sub={
              r.processMinutes > 0
                ? `${Math.round(avg(r.startMinutes))} min before + ${Math.round(avg(r.finishMinutes))} min after`
                : undefined
            }
            value={hm(avg(r.handMinutes))}
          />
          {r.processMinutes > 0 && (
            <Line label="Processing" sub="free for another client" value={hm(avg(r.processMinutes))} />
          )}
        </div>

        {Math.abs(listGap) >= 0.15 && r.listCents && (
          <p className="mt-3 text-sm text-muted">
            Listed at {whole(r.listCents)}, but clients have paid {whole(avg(r.paidCents))} on
            average — add-ons, a discount, or the price in Services is out of date.
          </p>
        )}
      </div>
    );
  }

  // ---- The ranking ----------------------------------------------------------------
  return (
    <div className="max-w-xl">
      <p className="text-sm text-muted">What each service earns</p>
      <p className="text-[15px]">per hour of your hands, after product</p>

      {ranked.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Not enough paid visits yet.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          {ranked.map((x) => {
            const ph = perHour(net(x), x.handMinutes);
            const low = ph < lowBar;
            return (
              <button
                key={x.name}
                onClick={() => setOpen(x.name)}
                className="flex w-full items-center gap-3 border-t border-foreground/10 px-3 py-2.5 text-left first:border-t-0 hover:bg-foreground/[0.02]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">{x.name}</span>
                  <span className="block text-xs text-muted">
                    {x.visits} visits · avg {whole(x.paidCents / x.visits)}
                  </span>
                  <span
                    className={`mt-1 block h-1.5 rounded-r-full ${low ? "bg-red-400/70" : "bg-[#1D9E75]/55"}`}
                    style={{ width: `${Math.max(3, (ph / top) * 100)}%` }}
                  />
                </span>
                <span className={`shrink-0 text-base font-medium tabular-nums ${low ? "text-red-700" : ""}`}>
                  {whole(ph)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {few.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">
            {few.length} with only one visit so far
          </summary>
          <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
            {few
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((x) => (
                <button
                  key={x.name}
                  onClick={() => setOpen(x.name)}
                  className="flex w-full justify-between gap-3 border-t border-foreground/10 px-3 py-2 text-left first:border-t-0"
                >
                  <span className="min-w-0">{x.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {whole(perHour(net(x), x.handMinutes))}/h
                  </span>
                </button>
              ))}
          </div>
        </details>
      )}

      <button
        onClick={() => setShowMethod((s) => !s)}
        className="mt-5 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        How product cost is estimated
        <ChevronDown size={15} className={showMethod ? "rotate-180" : ""} />
      </button>
      {showMethod && est && (
        <div className="mt-2 space-y-2 text-xs text-muted">
          <p>
            Each product order since opening is spread over the visits it covered before
            the next order, by how long each visit took. {est.caveat}
          </p>
          <p>
            Every order is under &ldquo;Back bar and supplies&rdquo; at the moment. Putting
            colour orders under &ldquo;Colour and developer&rdquo; in Bank will let colour
            services carry their own cost later.
          </p>
          {est.windows.map((w) => (
            <p key={w.from}>
              {w.from} → {w.to ?? "now"}: {whole(w.spentCents)} over {w.appointments} visit
              {w.appointments === 1 ? "" : "s"}
              {w.open && " (still being used)"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({
  label,
  sub,
  value,
  strong,
}: {
  label: string;
  sub?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-foreground/10 px-4 py-2.5 first:border-t-0">
      <span className={strong ? "font-medium" : ""}>
        {label}
        {sub && <span className="block text-xs font-normal text-muted">{sub}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${strong ? "font-medium" : ""}`}>{value}</span>
    </div>
  );
}
