"use client";

import { useEffect, useState } from "react";
import MoneyYearEnd from "./MoneyYearEnd";
import { offBankTakings } from "../../lib/takings";
import { yearEnd, type YearRow } from "../../lib/yearEnd";
import { PiggyBank, CircleAlert, ExternalLink, CalendarClock, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  estimateTax,
  nextQuarterlyDue,
  penaltyNotes,
  municipalDuties,
  type RateRow,
  type TaxEstimate,
  type FilingStatus,
} from "../../lib/tax";

// What she should put by.
//
// One number at the top, because four form-shaped answers is how tax software
// makes people feel stupid. The breakdown is underneath so the number can be
// argued with, not so it has to be read.
//
// Two figures, deliberately not one. The ESTIMATE is what the arithmetic says.
// The SUGGESTION is what to actually move, rounded up and never below a
// quarter. Padding the estimate itself would quietly make it a worse estimate;
// keeping them apart means the cushion is visible and can be disagreed with.
//
// And it compares against what she has already moved to savings, because a
// percentage on a screen doesn't put anything aside. She has been transferring
// to Business Savings since before anyone built this — the app's job is to say
// whether it's enough.

type Totals = { revenueCents: number; costCents: number; savedCents: number };

/** Sales tax collected on product sales (migration 0047). Ohio's, never hers. */
type SalesTax = { monthName: string; monthCents: number; yearCents: number };

const money = (c: number) =>
  `$${Math.round(c / 100).toLocaleString("en-US")}`;

const exact = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MoneyTax() {
  const [est, setEst] = useState<TaxEstimate | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [status, setStatus] = useState<FilingStatus | "">("");
  const [other, setOther] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [showWorking, setShowWorking] = useState(false);
  const [salesTax, setSalesTax] = useState<SalesTax>({ monthName: "", monthCents: 0, yearCents: 0 });
  // The year laid out on Schedule C lines, for her preparer.
  const [yearEndOpen, setYearEndOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const yearStart = `${new Date().getFullYear()}-01-01`;

    Promise.all([
      supabase.from("tax_rates").select("*"),
      supabase
        .from("bank_transactions")
        // Everything up to now, not just this year: costs from before she
        // opened are claimed in the opening year (lib/yearEnd.ts).
        .select("id,posted_on,amount_cents,merchant,description,expense_categories(name,kind,schedule_c_line)")
        .eq("is_business", true),
      supabase.from("salon_settings").select("filing_status,other_income_cents,opened_on").limit(1).maybeSingle(),
      // Shown by month and for the year until we know how often she files.
      supabase.from("retail_sales").select("sold_on,tax_cents,total_cents,payment_method").gte("sold_on", yearStart),
      // Cash taken at check-out never reaches the bank; it's counted from here.
      supabase
        .from("appointments")
        .select("paid_cents,payment_method")
        .in("status", ["checked_out", "completed"])
        .gte("starts_at", `${yearStart}T05:00:00Z`),
    ]).then(([r, t, s, st, ap]) => {
      if (!alive) return;

      const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" })
        .format(new Date())
        .slice(0, 7);
      let monthCents = 0;
      let yearCents = 0;
      for (const row of st.data ?? []) {
        const c = Number(row.tax_cents) || 0;
        yearCents += c;
        if (String(row.sold_on).startsWith(thisMonth)) monthCents += c;
      }
      setSalesTax({
        monthName: new Date(`${thisMonth}-15T12:00:00Z`).toLocaleDateString("en-US", {
          month: "long",
          timeZone: "UTC",
        }),
        monthCents,
        yearCents,
      });

      const rateRows = (r.data ?? []) as RateRow[];
      setRates(rateRows);

      // Profit is worked out exactly as the year-end summary does it -- the same
      // function -- so the estimate and the summary can't drift apart: sales tax
      // out of income, cash from check-outs in, setting-up counted in full, and
      // pre-opening spending split three ways with startup costs per § 195.
      const one = <X,>(x: X | X[] | null): X | null => (Array.isArray(x) ? (x[0] ?? null) : x);
      const rows: YearRow[] = (t.data ?? []).map((row) => ({
        id: row.id as string,
        posted_on: row.posted_on as string,
        amount_cents: Number(row.amount_cents),
        merchant: row.merchant as string | null,
        description: row.description as string | null,
        category: one(row.expense_categories as unknown as YearRow["category"] | YearRow["category"][]),
      }));
      const year = Number(yearStart.slice(0, 4));
      const y = yearEnd(rows, {
        salesTaxCents: yearCents,
        offBankCents: offBankTakings(
          (ap.data ?? []) as { paid_cents: number | null; payment_method: string | null }[],
          (st.data ?? []) as { total_cents: number | null; payment_method: string | null }[],
        ).cents,
        year,
        openedOn: (s.data?.opened_on as string | null) ?? null,
      });
      const revenueCents = y.grossCents;
      const costCents = y.grossCents - y.netCents;
      // Money moved into savings this year, as a proxy for "put by". Imperfect
      // -- she might be saving for something else -- so it's shown, not assumed.
      const savedCents = rows
        .filter((r) => r.posted_on >= yearStart && r.category?.name === "Transfer between accounts" && r.amount_cents < 0)
        .reduce((t2, r) => t2 + Math.abs(r.amount_cents), 0);

      setTotals({ revenueCents, costCents, savedCents });

      const filing = (s.data?.filing_status as FilingStatus | null) ?? null;
      setStatus(filing ?? "");
      const oi = s.data?.other_income_cents as number | null;
      setOther(oi === null || oi === undefined ? "" : String(Math.round(oi / 100)));

      setEst(
        estimateTax({
          profitCents: revenueCents - costCents,
          rates: rateRows,
          filingStatus: filing,
          otherIncomeCents: oi ?? null,
        }),
      );
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [reloadKey]);

  async function saveSetting(change: Record<string, unknown>) {
    await supabase.from("salon_settings").update(change).eq("id", true);
    setReloadKey((k) => k + 1);
  }

  if (yearEndOpen) return <MoneyYearEnd onBack={() => setYearEndOpen(false)} />;
  if (loading) return <p className="mt-6 text-sm text-muted">Loading…</p>;
  if (!est || !totals) return null;

  const profit = totals.revenueCents - totals.costCents;
  const due = nextQuarterlyDue();
  const federalOwed = est.lines
    .filter((l) => l.key.startsWith("federal"))
    .reduce((t, l) => t + l.cents, 0);
  const penalties = penaltyNotes(federalOwed);
  const duties = municipalDuties(est);
  const shouldSave = Math.round(profit * est.suggestedRate);
  const behind = shouldSave - totals.savedCents;

  const byPlace = (prefix: string) =>
    est.lines.filter((l) => l.key.startsWith(prefix)).reduce((t, l) => t + l.cents, 0);
  const places: { name: string; cents: number; quiet: boolean }[] = [
    { name: "Federal", cents: byPlace("federal"), quiet: false },
    { name: "Kettering", cents: byPlace("kettering"), quiet: false },
    { name: "Oakwood", cents: byPlace("oakwood"), quiet: false },
    // Ohio's first $250,000 of business income is exempt, so this is $0 on
    // purpose. Greyed so a zero doesn't read as broken.
    { name: "Ohio", cents: byPlace("ohio"), quiet: byPlace("ohio") === 0 },
  ];
  const dueDate = new Date(`${due.dueOn}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="max-w-xl">
      <button
        onClick={() => setYearEndOpen(true)}
        className="mb-4 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-foreground/15 bg-white px-4 text-left text-sm hover:border-foreground/30"
      >
        <span>
          Year-end summary
          <span className="block text-xs text-muted">Schedule C lines and a download, for your tax preparer</span>
        </span>
        <span className="text-muted" aria-hidden="true">›</span>
      </button>

      {/* ---- Income tax: one number, then where it goes ---------------------- */}
      <p className="text-sm text-muted">Set aside for income tax so far</p>
      <p className="mt-0.5 text-3xl font-medium tabular-nums">
        {profit > 0 ? money(shouldSave) : "$0"}
      </p>
      {/* Without this the headline and the lines below disagree, and she'd
          reasonably wonder which is wrong. Neither: one has a cushion. */}
      {profit > 0 && shouldSave > est.totalCents && (
        <p className="text-sm text-muted">
          Estimate {money(est.totalCents)}, rounded up to be safe
        </p>
      )}

      {profit <= 0 ? (
        <p className="mt-2 text-sm text-muted">
          {est.missing[0] ??
            "Spending is ahead of income so far this year, so there's nothing to tax yet. That's normal in the first few months."}
        </p>
      ) : (
        <>
          <div className="mt-3 flex overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
            <span
              className={`w-1 shrink-0 ${behind > 0 ? "bg-amber-400" : "bg-accent"}`}
              aria-hidden
            />
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <PiggyBank size={17} className="shrink-0 text-muted" />
              <div>
                <p className="font-medium">
                  {behind > 0 ? `${money(behind)} short` : `Ahead by ${money(-behind)}`}
                </p>
                <p className="text-muted">
                  {totals.savedCents > 0
                    ? `${money(totals.savedCents)} moved to savings so far`
                    : "Nothing moved to savings yet"}
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 text-sm text-muted">Next payment</p>
          <p className="mt-0.5 flex items-center gap-2 text-[15px]">
            <CalendarClock size={16} className="text-muted" />
            Federal · {dueDate}
            <span className="text-sm text-muted">
              {due.daysAway} day{due.daysAway === 1 ? "" : "s"} away
            </span>
          </p>

          <div className="mt-4 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
            {places.map((p) => (
              <div
                key={p.name}
                className={`flex justify-between border-t border-foreground/10 px-4 py-2.5 text-sm first:border-t-0 ${
                  p.quiet ? "text-muted" : ""
                }`}
              >
                <span>{p.name}</span>
                <span className="tabular-nums">{money(p.cents)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---- Sales tax: collected for Ohio, never hers ----------------------- */}
      <p className="mt-7 text-sm text-muted">Sales tax on products · owed to Ohio</p>
      <div className="mt-1.5 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
        {salesTax.yearCents === 0 ? (
          <p className="px-4 py-2.5 text-sm text-muted">None collected yet.</p>
        ) : (
          <>
            <div className="flex justify-between px-4 py-2.5 text-sm">
              <span>{salesTax.monthName}</span>
              <span className="tabular-nums">{exact(salesTax.monthCents)}</span>
            </div>
            <div className="flex justify-between border-t border-foreground/10 px-4 py-2.5 text-sm">
              <span>This year</span>
              <span className="tabular-nums">{exact(salesTax.yearCents)}</span>
            </div>
          </>
        )}
      </div>

      {/* ---- Everything else, out of the way --------------------------------- */}
      <button
        onClick={() => setShowWorking((s) => !s)}
        className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted transition hover:text-foreground"
      >
        How this is worked out
        <ChevronDown size={15} className={showWorking ? "rotate-180" : ""} />
      </button>

      {showWorking && (
        <div className="mt-3 space-y-4">
          {profit > 0 && (
            <div className="text-sm text-muted">
              <p>
                Profit so far this year is {money(profit)}. The arithmetic says{" "}
                {(est.effectiveRate * 100).toFixed(1)}&cent; of each profit dollar goes in
                tax; the amount above sets aside {Math.round(est.suggestedRate * 100)}&cent;,
                rounded up and never below a quarter. Too much only costs her the use of
                her own money; too little costs a penalty in April.
              </p>
            </div>
          )}

          {profit > 0 && (
            <div className="overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
              {est.lines.map((l) => (
                <div
                  key={l.key}
                  className="flex items-baseline justify-between gap-4 border-t border-foreground/10 px-4 py-2.5 text-sm first:border-t-0"
                >
                  <div className="min-w-0">
                    <span className={l.expectedZero ? "text-muted" : ""}>{l.label}</span>
                    <span className="ml-2 text-xs text-muted">{l.detail}</span>
                  </div>
                  <span className="shrink-0 tabular-nums">{exact(l.cents)}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 border-t border-foreground/15 bg-foreground/[0.03] px-4 py-2.5 text-sm">
                <span className="font-medium">Estimated for the year so far</span>
                <span className="font-medium tabular-nums">{exact(est.totalCents)}</span>
              </div>
            </div>
          )}

          {profit > 0 && (
            <div className="space-y-2 text-xs text-muted">
              <p>
                &ldquo;Moved to savings&rdquo; counts transfers out to her other accounts. If
                some of that was for something other than tax, it reads high.
              </p>
              {penalties.map((p) => (
                <p key={p.who}>
                  <span className="text-foreground">{p.who}</span> — {p.what}{" "}
                  <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    source
                  </a>
                </p>
              ))}
              {duties.map((d) => (
                <p key={d.city}>
                  <span className="text-foreground">{d.city}</span> —{" "}
                  {d.mustPrepay ? (
                    <>
                      {exact(d.owedCents)} so far, past the $200 mark, so Ohio wants this paid
                      across the year rather than settled at the end.
                    </>
                  ) : (
                    <>
                      {exact(d.owedCents)} so far. Ohio only requires payments through the year
                      once a city&rsquo;s tax reaches $200
                      {d.profitAtThresholdCents !== null && (
                        <> — about {money(d.profitAtThresholdCents)} of profit here</>
                      )}
                      , so this can wait until she files.
                    </>
                  )}
                </p>
              ))}
              <p>
                The $200 rule is Ohio-wide (ORC 718.08), but Kettering and Oakwood set their
                own due dates and neither publishes them: (937) 296-2502 and (937) 298-0531.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-foreground/15 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CircleAlert
                size={15}
                className={est.missing.length > 0 ? "text-amber-600" : "text-muted"}
              />
              What this had to assume
            </p>
            {(est.missing.length > 0 || est.assumptions.length > 0) && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {est.missing.map((m) => (
                  <li key={m} className="text-foreground">
                    {m}
                  </li>
                ))}
                {est.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-muted">
                How she files
                <select
                  value={status}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStatus(v as FilingStatus | "");
                    void saveSetting({ filing_status: v === "" ? null : v });
                  }}
                  className="mt-1 w-full rounded-lg border border-foreground/15 bg-white px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="">Not said</option>
                  <option value="single">Single</option>
                  <option value="married_jointly">Married, filing jointly</option>
                </select>
              </label>
              <label className="text-xs text-muted">
                Other household income this year
                <input
                  inputMode="numeric"
                  value={other}
                  placeholder="0"
                  onChange={(e) => setOther(e.target.value)}
                  onBlur={() => {
                    const raw = other.replace(/[$,\s]/g, "");
                    const cents = raw === "" ? null : Math.round(Number(raw) * 100);
                    if (cents !== null && !Number.isFinite(cents)) return;
                    void saveSetting({ other_income_cents: cents });
                  }}
                  className="mt-1 w-full rounded-lg border border-foreground/15 px-2 py-1.5 text-sm text-foreground tabular-nums"
                />
              </label>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-muted">
            {rates
              .filter((r) => r.bracket_floor_cents === null)
              .map((r) => (
                <p key={`${r.jurisdiction}-${r.filing_status ?? ""}`}>
                  <span className="text-foreground">{r.label}</span>
                  {r.filing_status ? ` (${r.filing_status.replace("_", " ")})` : ""} — checked{" "}
                  {r.checked_on}{" "}
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline"
                  >
                    source <ExternalLink size={10} />
                  </a>
                </p>
              ))}
            <p className="pt-1">
              This estimates. It never files, and it is not advice — a rate can be right and
              still be the wrong rate for her.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
