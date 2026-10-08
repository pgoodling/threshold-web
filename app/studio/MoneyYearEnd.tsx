"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { readableTxn } from "../../lib/bankNames";
import { yearEnd, compareTakings, toCsv, type YearRow, type CheckOuts } from "../../lib/yearEnd";

// The year on Schedule C lines, for her tax preparer. Opened from Money →
// Taxes. The arithmetic is lib/yearEnd.ts; this lays it out and lets each line
// open onto the transactions behind it.

const money = (c: number) =>
  `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Loaded = {
  rows: YearRow[];
  salesTaxCents: number;
  checkOuts: CheckOuts;
  stockCents: number;
  stockItems: number;
};

export default function MoneyYearEnd({ onBack }: { onBack: () => void }) {
  const thisYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric" }).format(new Date()));
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<Loaded | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;
    Promise.all([
      supabase
        .from("bank_transactions")
        .select("id,posted_on,amount_cents,merchant,description,expense_categories(name,kind,schedule_c_line)")
        .eq("is_business", true)
        .gte("posted_on", from)
        .lt("posted_on", to),
      supabase.from("retail_sales").select("tax_cents,total_cents,payment_method").gte("sold_on", from).lt("sold_on", to),
      supabase
        .from("appointments")
        .select("paid_cents,payment_method,starts_at")
        .in("status", ["checked_out", "completed"])
        .gte("starts_at", `${from}T05:00:00Z`)
        .lt("starts_at", `${to}T05:00:00Z`),
      supabase.from("product_stock").select("on_hand,unit_cost_cents").eq("active", true).eq("sells_retail", true),
    ]).then(([b, s, a, p]) => {
      if (!alive) return;
      if (b.error) return setError(b.error.message);
      const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
      const byMethod = new Map<string, number>();
      const add = (m: string | null, c: number) => byMethod.set(m ?? "other", (byMethod.get(m ?? "other") ?? 0) + c);
      for (const r of a.data ?? []) add(r.payment_method as string | null, Number(r.paid_cents) || 0);
      for (const r of s.data ?? []) add(r.payment_method as string | null, Number(r.total_cents) || 0);
      let stockCents = 0;
      let stockItems = 0;
      for (const r of p.data ?? []) {
        const n = Math.max(0, Number(r.on_hand) || 0);
        stockItems += n;
        stockCents += n * (Number(r.unit_cost_cents) || 0);
      }
      setData({
        rows: (b.data ?? []).map((r) => ({
          id: r.id as string,
          posted_on: r.posted_on as string,
          amount_cents: Number(r.amount_cents),
          merchant: r.merchant as string | null,
          description: r.description as string | null,
          category: one(r.expense_categories as unknown as YearRow["category"] | YearRow["category"][]),
        })),
        salesTaxCents: (s.data ?? []).reduce((t, r) => t + (Number(r.tax_cents) || 0), 0),
        checkOuts: [...byMethod.entries()].map(([method, cents]) => ({ method, cents })),
        stockCents,
        stockItems,
      });
    });
    return () => {
      alive = false;
    };
  }, [year]);

  const y = useMemo(() => (data ? yearEnd(data.rows, { salesTaxCents: data.salesTaxCents }) : null), [data]);
  const takings = useMemo(() => {
    if (!data || !y) return null;
    const card = y.receiptRows.filter((r) => r.category?.name === "Card revenue (Intuit)").reduce((t, r) => t + Math.abs(r.amount_cents), 0);
    return compareTakings(data.checkOuts, card, y.receiptsCents - card);
  }, [data, y]);

  function download() {
    if (!y) return;
    const blob = new Blob([toCsv(year, y)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `threshold-${year}-schedule-c.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const lastPosted = data?.rows.map((r) => r.posted_on).sort().slice(-1)[0];

  return (
    <div className="max-w-xl">
      <button onClick={onBack} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground">
        <ChevronLeft size={18} /> Taxes
      </button>

      <div className="mt-1 flex items-center justify-between gap-3">
        <h3 className="font-display text-2xl">{year} for your tax preparer</h3>
        <span className="flex items-center">
          <button
            onClick={() => setYear(year - 1)}
            aria-label="Previous year"
            className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-foreground"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setYear(year + 1)}
            disabled={year >= thisYear}
            aria-label="Next year"
            className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </span>
      </div>
      <p className="text-sm text-muted">
        Schedule C lines{lastPosted ? ` · bank statements through ${day(lastPosted)}` : ""}
        {year === thisYear ? " · the year isn't over" : ""}
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {!y || !data ? (
        !error && <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : (
        <>
          <Section title="Income">
            <Row
              line="1"
              label="Gross receipts"
              sub="card deposits, plus cash and other takings entered"
              value={money(y.receiptsCents)}
              open={open === "1"}
              onToggle={() => setOpen(open === "1" ? null : "1")}
              rows={y.receiptRows}
            />
            {y.salesTaxCents > 0 && <Row label="less sales tax collected" sub="it's the state's, not income" value={money(-y.salesTaxCents)} />}
            <Row label="Gross receipts, less sales tax" value={money(y.grossCents)} strong />
          </Section>

          <Section title="Expenses">
            {y.lines.length === 0 && <p className="px-4 py-3 text-sm text-muted">None recorded.</p>}
            {y.lines.map((l) => (
              <Row
                key={l.line}
                line={l.line}
                label={l.name}
                sub={
                  l.spentCents !== undefined
                    ? `${l.categories.join(", ")} · half of ${money(l.spentCents)} spent`
                    : l.categories.join(", ")
                }
                value={money(l.cents)}
                open={open === l.line}
                onToggle={() => setOpen(open === l.line ? null : l.line)}
                rows={l.rows}
              />
            ))}
            {y.setup.length > 0 && (
              <Row
                label="Setting up: furniture, equipment, decor"
                sub="each item listed; the preparer chooses the line"
                value={money(y.setupCents)}
                open={open === "setup"}
                onToggle={() => setOpen(open === "setup" ? null : "setup")}
                rows={y.setup}
              />
            )}
            <Row line="31" label="Net profit" sub="setting up counted in full, as on Taxes" value={money(y.netCents)} strong />
          </Section>

          <Section title="For the preparer">
            <Row
              label="Products for sale on the shelf, at cost"
              sub={`${data.stockItems} item${data.stockItems === 1 ? "" : "s"} today${year === thisYear ? " · count on Dec 31 for the real figure" : ""}`}
              value={money(data.stockCents)}
            />
            {takings && (
              <>
                <Row
                  label="Card taken at check-out"
                  // Card tips go through the reader but aren't recorded at
                  // check-out, so deposits run higher by the tips (Paul, 8 Oct).
                  sub={`card deposits in the bank: ${money(takings.cardDepositedCents)}${
                    takings.cardDepositedCents > takings.cardRecordedCents
                      ? ` · ${money(takings.cardDepositedCents - takings.cardRecordedCents)} more, from tips`
                      : ""
                  }`}
                  value={money(takings.cardRecordedCents)}
                />
                <Row
                  label="Cash, Venmo, Zelle and other at check-out"
                  sub={
                    takings.otherMissingCents > 0
                      ? `${money(takings.otherMissingCents)} of it isn't entered as income`
                      : "all entered as income"
                  }
                  value={money(takings.otherRecordedCents)}
                  warn={takings.otherMissingCents > 0}
                />
              </>
            )}
            <Row
              label="Bank rows still to sort"
              sub={y.toSort.length ? "sort them in Bank before handing this over" : undefined}
              value={String(y.toSort.length)}
              warn={y.toSort.length > 0}
            />
            {y.notOnForm.map((n) => (
              <Row key={n.name} label={n.name} sub="not on the form" value={money(n.cents)} />
            ))}
          </Section>

          <button
            onClick={download}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-foreground/20 px-4 text-sm hover:border-foreground/40"
          >
            <Download size={16} /> Download for preparer (CSV)
          </button>
          <p className="mt-2 text-xs text-muted">Tap a line to see every transaction in it.</p>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="text-xs uppercase tracking-[0.15em] text-muted">{title}</h4>
      <div className="mt-1.5 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm">{children}</div>
    </section>
  );
}

function Row({
  line,
  label,
  sub,
  value,
  strong,
  warn,
  open,
  onToggle,
  rows,
}: {
  line?: string;
  label: string;
  sub?: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
  open?: boolean;
  onToggle?: () => void;
  rows?: YearRow[];
}) {
  const body = (
    <>
      <span className={`min-w-0 ${strong ? "font-medium" : ""}`}>
        {line && <span className="mr-1.5 tabular-nums text-muted">{line}</span>}
        {label}
        {sub && <span className={`block text-xs font-normal ${warn ? "text-[#8f3f4a]" : "text-muted"}`}>{sub}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${strong ? "font-medium" : ""}`}>{value}</span>
    </>
  );
  return (
    <div className="border-t border-foreground/10 first:border-t-0" style={warn ? { boxShadow: "inset 3px 0 0 #8f3f4a" } : undefined}>
      {onToggle && rows && rows.length > 0 ? (
        <button onClick={onToggle} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left">
          {body}
        </button>
      ) : (
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">{body}</div>
      )}
      {open && rows && (
        <div className="border-t border-foreground/10 bg-foreground/[0.02] px-4 py-1.5">
          {[...rows]
            .sort((a, b) => a.posted_on.localeCompare(b.posted_on))
            .map((r) => (
              <div key={r.id} className="flex justify-between gap-3 py-1 text-xs">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-muted">{day(r.posted_on)}</span>
                  {readableTxn(r)}
                </span>
                <span className="shrink-0 tabular-nums">{money(Math.abs(r.amount_cents))}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
