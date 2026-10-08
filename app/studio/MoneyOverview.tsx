"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Segments, BackHeader } from "./ui";
import { readableTxn } from "../../lib/bankNames";
import {
  salonDay,
  utc,
  visiblePeriods,
  periodLabel,
  bucketTotals,
  breakdown,
  type Grain,
  type OverviewAppt,
  type OverviewSale,
  type OverviewTxn,
} from "../../lib/overview";

// Overview: revenue against expenses, by week, month, quarter or year.
//
// Two sources, on purpose:
//
//   Revenue   what clients paid her — check-outs and product sales, dated the
//             day of the work. Not bank deposits: those miss cash, arrive a
//             day or two late, and land after Intuit's fee. Product sales are
//             before tax; the tax is Ohio's.
//   Expenses  sorted business bank transactions, including anything she
//             entered by hand. Transfers to savings, owner draws and personal
//             spending never appear — none of them is the business spending.
//
// Setting-up costs (categories of kind 'capital': furniture, equipment,
// decor) are shown apart. They are real expenses and count in the profit,
// but September's $1,700 of chairs and mirrors isn't what a normal month
// costs, and folding it in would make her first month look like a problem.
// So the bar shows it as a lighter block on top, and the summary gives profit
// both with it and before it.

type Appt = OverviewAppt;
type Sale = OverviewSale;
type Txn = OverviewTxn;

const whole = (c: number) =>
  `${c < 0 ? "−" : ""}$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;
/** Under a bar there's room for "+$1.6k", not "+$1,648". */
const compact = (c: number) => {
  const d = Math.abs(c) / 100;
  const s = d >= 1000 ? `$${(d / 1000).toFixed(d >= 10000 ? 0 : 1)}k` : `$${Math.round(d)}`;
  return `${c < 0 ? "−" : "+"}${s}`;
};
const exact = (c: number) =>
  `$${(Math.abs(c) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const today = () => salonDay(new Date().toISOString());
const label = periodLabel;

// ---- The page ----------------------------------------------------------------

export default function MoneyOverview() {
  const [grain, setGrain] = useState<Grain>("month");
  const [picked, setPicked] = useState<string | null>(null);
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openRevenue, setOpenRevenue] = useState(false);
  const [openExpenses, setOpenExpenses] = useState(true);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase
        .from("appointments")
        .select("starts_at,paid_cents,services(name)")
        .in("status", ["checked_out", "completed"]),
      supabase.from("retail_sales").select("sold_on,subtotal_cents"),
      supabase
        .from("bank_transactions")
        .select("id,posted_on,amount_cents,merchant,description,expense_categories(name,kind)")
        .eq("is_business", true)
        .not("reviewed_at", "is", null),
    ]).then(([a, s, t]) => {
      if (!alive) return;
      const e = a.error ?? t.error;
      if (e) setError(e.message);
      const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
      setAppts(
        ((a.data ?? []) as unknown as Appt[]).map((r) => ({ ...r, services: one(r.services) })),
      );
      // retail_sales arrives with 0047; before that this is simply empty.
      setSales((s.data ?? []) as Sale[]);
      setTxns(
        ((t.data ?? []) as unknown as Txn[]).map((r) => ({
          ...r,
          expense_categories: one(r.expense_categories),
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  // Months before the salon had any money moving are just empty bars — the
  // chart starts at the first period with anything in it (lib/overview).
  const periods = useMemo(
    () => visiblePeriods(grain, today(), appts ?? [], sales, txns),
    [grain, appts, sales, txns],
  );
  const current = periods[periods.length - 1];
  const selected = picked && periods.includes(picked) ? picked : current;

  // Everything bucketed by period, once per grain.
  const buckets = useMemo(
    () => bucketTotals(periods, grain, appts ?? [], sales, txns),
    [appts, sales, txns, grain, periods],
  );

  // The selected period, broken down.
  const detail = useMemo(
    () => breakdown(selected, grain, appts ?? [], sales, txns),
    [appts, sales, txns, grain, selected],
  );

  const sel = buckets.get(selected) ?? { revenue: 0, expenses: 0, setup: 0 };
  const profit = sel.revenue - sel.expenses - sel.setup;
  const profitBeforeSetup = sel.revenue - sel.expenses;

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (appts === null) return <p className="text-sm text-muted">Loading…</p>;

  // ---- A category, opened to its transactions -------------------------------
  if (category) {
    const c = detail.cats.get(category);
    return (
      <div className="max-w-xl">
        <BackHeader onBack={() => setCategory(null)} backLabel="Overview" title={category} />
        <p className="mt-1 text-sm text-muted">
          {label(selected, grain, true)} · {whole(c?.cents ?? 0)}
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          {(c?.rows ?? [])
            .slice()
            .sort((a, b) => b.posted_on.localeCompare(a.posted_on))
            .map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 border-t border-foreground/10 px-3 py-2.5 text-sm first:border-t-0"
              >
                <span className="min-w-0">
                  <span className="block text-[15px]">{readableTxn(t)}</span>
                  <span className="block text-xs text-muted">
                    {utc(t.posted_on).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {t.amount_cents < 0 ? "−" : "+"}
                  {exact(t.amount_cents)}
                </span>
              </div>
            ))}
        </div>
      </div>
    );
  }

  // ---- The chart and the breakdown -----------------------------------------
  const GRAINS: [Grain, string][] = [
    ["week", "Week"],
    ["month", "Month"],
    ["quarter", "Quarter"],
    ["year", "Year"],
  ];
  const max = Math.max(1, ...periods.map((p) => {
    const b = buckets.get(p)!;
    return Math.max(b.revenue, b.expenses + b.setup);
  }));
  const W = 100 / periods.length;
  const H = 120;
  const h = (c: number) => (c / max) * (H - 10);
  const runningMax = detail.running[0]?.[1].cents ?? 1;

  return (
    <div className="max-w-xl">
      <Segments
        label="Period"
        options={GRAINS.map(([g, l]) => [g, l] as const)}
        value={grain}
        onChange={(g) => {
          setGrain(g);
          setPicked(null);
        }}
      />

      {/* Bars: revenue green, expenses terracotta with setting-up lighter on
          top. Tap a period to see it below. The current one is faded and says
          "so far", so half a month doesn't read as a bad month. */}
      <div className="mt-4 flex items-end" style={{ height: H + 34 }}>
        {periods.map((p) => {
          const b = buckets.get(p)!;
          const isCurrent = p === current;
          const isSel = p === selected;
          const pr = b.revenue - b.expenses - b.setup;
          const empty = b.revenue === 0 && b.expenses === 0 && b.setup === 0;
          return (
            <button
              key={p}
              onClick={() => setPicked(p)}
              style={{ width: `${W}%` }}
              className={`flex h-full flex-col items-center justify-end rounded-lg pb-0.5 ${
                isSel ? "bg-foreground/[0.05]" : ""
              }`}
              aria-label={`${label(p, grain, true)}: revenue ${whole(b.revenue)}, expenses ${whole(b.expenses + b.setup)}`}
            >
              <span className={`flex items-end gap-0.5 ${isCurrent ? "opacity-55" : ""}`} style={{ height: H }}>
                <span className="w-3 rounded-t-sm bg-[#1D9E75] sm:w-4" style={{ height: Math.max(b.revenue ? 2 : 0, h(b.revenue)) }} />
                <span className="flex w-3 flex-col sm:w-4">
                  <span className="rounded-t-sm bg-accent/40" style={{ height: h(b.setup) }} />
                  <span
                    className={`bg-accent ${b.setup ? "" : "rounded-t-sm"}`}
                    style={{ height: Math.max(b.expenses ? 2 : 0, h(b.expenses)) }}
                  />
                </span>
              </span>
              <span className={`mt-1 whitespace-nowrap text-xs ${isSel ? "font-medium" : "text-muted"}`}>
                {label(p, grain)}
              </span>
              <span
                className={`whitespace-nowrap text-xs tabular-nums ${
                  isCurrent || empty ? "text-muted" : pr >= 0 ? "text-green-800" : "text-red-700"
                }`}
              >
                {isCurrent ? "so far" : empty ? "—" : compact(pr)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#1D9E75]" />Revenue</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent" />Expenses</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent/40" />Setting up</span>
      </p>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-display text-lg">
          {label(selected, grain, true)}
          {selected === current && <span className="ml-1.5 font-sans text-sm text-muted">so far</span>}
        </h3>
        <p className="text-sm">
          Profit{" "}
          <span className={`font-medium tabular-nums ${profit >= 0 ? "text-green-800" : "text-red-700"}`}>
            {whole(profit)}
          </span>
        </p>
      </div>
      {sel.setup > 0 && (
        <p className="text-right text-xs text-muted">{whole(profitBeforeSetup)} before setting up</p>
      )}

      {/* Revenue */}
      <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
        <button
          onClick={() => setOpenRevenue((o) => !o)}
          className="flex w-full items-center gap-2 px-3 py-3 text-left text-[15px]"
        >
          {openRevenue ? <ChevronDown size={16} /> : <ChevronRight size={16} className="text-muted" />}
          <span className={`flex-1 ${openRevenue ? "font-medium" : ""}`}>Revenue</span>
          <span className="tabular-nums text-green-800">{whole(sel.revenue)}</span>
        </button>
        {openRevenue && (
          <div className="border-t border-foreground/10 px-3 pb-2 pl-9">
            {detail.services.map(([name, v]) => (
              <div key={name} className="flex justify-between border-b border-foreground/10 py-2 text-sm last:border-b-0">
                <span>
                  {name}
                  <span className="block text-xs text-muted">
                    {v.visits} visit{v.visits === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="tabular-nums">{whole(v.cents)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 text-sm">
              <span>
                Product sales<span className="block text-xs text-muted">before sales tax</span>
              </span>
              <span className="tabular-nums">{whole(detail.productCents)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
        <button
          onClick={() => setOpenExpenses((o) => !o)}
          className="flex w-full items-center gap-2 px-3 py-3 text-left text-[15px]"
        >
          {openExpenses ? <ChevronDown size={16} /> : <ChevronRight size={16} className="text-muted" />}
          <span className={`flex-1 ${openExpenses ? "font-medium" : ""}`}>Expenses</span>
          <span className="tabular-nums">{whole(sel.expenses)}</span>
        </button>
        {openExpenses && (
          <div className="border-t border-foreground/10 px-3 pb-2 pl-9">
            {detail.running.length === 0 && <p className="py-2 text-sm text-muted">None.</p>}
            {detail.running.map(([name, v]) => (
              <button
                key={name}
                onClick={() => setCategory(name)}
                className="min-h-11 inline-flex items-center block w-full border-b border-foreground/10 text-left text-sm last:border-b-0"
              >
                <span className="flex justify-between gap-3">
                  <span className="min-w-0">{name}</span>
                  <span className="shrink-0 tabular-nums">{whole(v.cents)}</span>
                </span>
                <span
                  className="mt-1 block h-1.5 rounded-r-full bg-accent/50"
                  style={{ width: `${Math.max(2, (v.cents / runningMax) * 100)}%` }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Setting up — counted, but apart */}
      {detail.setup.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          <p className="flex justify-between px-3 pb-1 pt-3 text-[15px]">
            <span>
              Setting up<span className="ml-2 text-xs text-muted">one-off</span>
            </span>
            <span className="tabular-nums">{whole(sel.setup)}</span>
          </p>
          <div className="px-3 pb-2 pl-9">
            {detail.setup.map(([name, v]) => (
              <button
                key={name}
                onClick={() => setCategory(name)}
                className="min-h-11 flex w-full justify-between gap-3 border-b border-foreground/10 text-left text-sm last:border-b-0"
              >
                <span className="min-w-0">{name}</span>
                <span className="shrink-0 tabular-nums">{whole(v.cents)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
