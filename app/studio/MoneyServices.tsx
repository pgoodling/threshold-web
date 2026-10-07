"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  cardFeeRate,
  serviceRows,
  sumVisits as sum,
  perHour,
  handRate,
  type EarningsAppt,
  type ServiceRow,
} from "../../lib/serviceEarnings";

// Services: what each one earns per hour of her hands.
//
// PER HOUR OF HER HANDS, NOT OF THE BOOKING. A highlight holds the chair for
// three hours, but forty-five minutes of that is processing, when she can take
// another client. So the headline divides by the time she's actually working
// on that head, and the chair figure sits beside it for days the gap goes
// unfilled. Blocked processing counts in full. Timing comes from the visit
// where she set its own (a blowout stretched to two hours earned what it
// earned), otherwise from the service.
//
// BEFORE PRODUCT, for now. The first version spread every product order since
// opening across every visit by length, and Paul was right that it's the wrong
// model: an order isn't used up the month it arrives, and a two-oz tube of
// colour doesn't touch a blowout. The honest cost of a service is what goes on
// the head — so many ml from a bottle whose price she knows — and that needs
// her list of what she uses for each service. Until it exists, no product
// figure is better than an invented one.
//
// CARD FEES come from her own statement: what Intuit charged over what it
// deposited, applied to card visits only.
//
// Every figure can be checked: a service lists the visits behind it.

type Row = ServiceRow;

const MIN_VISITS = 2;

const whole = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const exact = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hm = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${h} h${r ? ` ${r}` : ""}` : `${r} min`;
};

export default function MoneyServices() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [feeRate, setFeeRate] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase
        .from("appointments")
        .select(
          "id,starts_at,paid_cents,payment_method,status,start_minutes,process_minutes,finish_minutes,block_processing,services(name,price_cents,start_minutes,process_minutes,finish_minutes,duration_minutes)",
        )
        .in("status", ["checked_out", "completed"]),
      supabase
        .from("bank_transactions")
        .select("amount_cents,expense_categories(name)")
        .eq("is_business", true)
        .not("reviewed_at", "is", null),
    ]).then(([a, t]) => {
      if (!alive) return;
      if (a.error || t.error) setError((a.error ?? t.error)!.message);
      const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

      const rate = cardFeeRate(
        (t.data ?? []).map((r) => ({
          amount_cents: Number(r.amount_cents),
          category: one(r.expense_categories as unknown as { name: string } | null)?.name ?? "",
        })),
      );
      setRows(serviceRows((a.data ?? []) as unknown as EarningsAppt[], rate));
      setFeeRate(rate);
    });
    return () => {
      alive = false;
    };
  }, []);

  const ranked = useMemo(
    () => (rows ?? []).filter((r) => r.visits.length >= MIN_VISITS).sort((a, b) => handRate(b) - handRate(a)),
    [rows],
  );
  const few = (rows ?? []).filter((r) => r.visits.length < MIN_VISITS);
  const top = ranked[0] ? handRate(ranked[0]) : 1;
  const lowBar = top * 0.5;

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (rows === null) return <p className="text-sm text-muted">Loading…</p>;

  // ---- One service, opened, with its working ----------------------------------
  const r = open ? (rows.find((x) => x.name === open) ?? null) : null;
  if (r) {
    const n = r.visits.length;
    const paid = sum(r.visits, "paidCents");
    const fee = sum(r.visits, "feeCents");
    const hands = sum(r.visits, "handMinutes");
    const chair = sum(r.visits, "chairMinutes");
    const proc = sum(r.visits, "processMinutes");
    const listGap = r.listCents && r.listCents > 0 ? paid / n / r.listCents - 1 : 0;

    return (
      <div className="max-w-xl">
        <button
          onClick={() => setOpen(null)}
          className="-ml-1 inline-flex items-center gap-1 text-left font-display text-xl"
        >
          <ChevronLeft size={20} className="shrink-0" /> {r.name}
        </button>
        <p className="mt-1 text-sm text-muted">
          {n} paid visit{n === 1 ? "" : "s"}
        </p>

        <div className="mt-4 flex gap-8">
          <div>
            <p className="text-3xl font-medium tabular-nums">{whole(perHour(paid - fee, hands))}</p>
            <p className="text-xs text-muted">per hour of your hands</p>
          </div>
          {proc > 0 && (
            <div>
              <p className="text-3xl font-medium tabular-nums text-muted">
                {whole(perHour(paid - fee, chair))}
              </p>
              <p className="text-xs text-muted">per hour in the chair</p>
            </div>
          )}
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm shadow-sm">
          <Line label="Average paid" value={exact(paid / n)} />
          <Line
            label="Card fee"
            sub={feeRate ? `${(feeRate * 100).toFixed(1)}% on card visits` : undefined}
            value={`−${exact(fee / n)}`}
          />
          <Line label="Product" sub="not set yet — needs her product list" value="—" />
          <Line label="Left, before product" value={exact((paid - fee) / n)} strong />
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm shadow-sm">
          <Line
            label="Your hands on it"
            sub={
              proc > 0
                ? `${Math.round(sum(r.visits, "startMinutes") / n)} min before + ${Math.round(sum(r.visits, "finishMinutes") / n)} min after`
                : undefined
            }
            value={hm(hands / n)}
          />
          {proc > 0 && <Line label="Processing" sub="free for another client" value={hm(proc / n)} />}
        </div>

        {Math.abs(listGap) >= 0.15 && r.listCents && (
          <p className="mt-3 text-sm text-muted">
            Listed at {whole(r.listCents)}, but clients have paid {whole(paid / n)} on average —
            add-ons, a discount, or the price in Services is out of date.
          </p>
        )}

        {/* The working, visit by visit, so the arithmetic can be checked by
            hand: (total paid − total fees) ÷ total hands minutes × 60. */}
        <h4 className="mt-6 text-sm text-muted">Every visit behind this</h4>
        <div className="mt-1.5 overflow-x-auto rounded-xl border border-foreground/15 bg-white shadow-sm">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted">
              <tr className="text-left">
                <th className="px-3 py-2 font-normal">Date</th>
                <th className="px-2 py-2 text-right font-normal">Paid</th>
                <th className="px-2 py-2 text-right font-normal">Fee</th>
                <th className="px-3 py-2 text-right font-normal">Hands</th>
              </tr>
            </thead>
            <tbody>
              {r.visits
                .slice()
                .sort((a, b) => b.day.localeCompare(a.day))
                .map((v) => (
                  <tr key={v.id} className="border-t border-foreground/10">
                    <td className="px-3 py-1.5">
                      {new Date(`${v.day}T12:00:00Z`).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                      {!v.card && <span className="ml-1 text-xs text-muted">not card</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">{exact(v.paidCents)}</td>
                    <td className="px-2 py-1.5 text-right">{v.feeCents ? exact(v.feeCents) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{v.handMinutes} min</td>
                  </tr>
                ))}
              <tr className="border-t border-foreground/20 font-medium">
                <td className="px-3 py-1.5">Total</td>
                <td className="px-2 py-1.5 text-right">{exact(paid)}</td>
                <td className="px-2 py-1.5 text-right">{exact(fee)}</td>
                <td className="px-3 py-1.5 text-right">{hands} min</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          ({exact(paid)} − {exact(fee)}) ÷ {hands} min × 60 = {exact(perHour(paid - fee, hands))} an
          hour
        </p>
      </div>
    );
  }

  // ---- The ranking --------------------------------------------------------------
  return (
    <div className="max-w-xl">
      <p className="text-sm text-muted">What each service earns</p>
      <p className="text-[15px]">per hour of your hands, before product</p>

      {ranked.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Not enough paid visits yet.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          {ranked.map((x) => {
            const ph = handRate(x);
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
                    {x.visits.length} visits · avg {whole(sum(x.visits, "paidCents") / x.visits.length)}
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
          <summary className="cursor-pointer text-muted">{few.length} with only one visit so far</summary>
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
                  <span className="shrink-0 tabular-nums text-muted">{whole(handRate(x))}/h</span>
                </button>
              ))}
          </div>
        </details>
      )}

      <p className="mt-4 text-xs text-muted">
        Product isn&rsquo;t taken off yet. It will be once each service has its list of what
        goes on the head.
      </p>
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
