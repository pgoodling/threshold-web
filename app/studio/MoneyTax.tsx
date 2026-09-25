"use client";

import { useEffect, useState } from "react";
import { PiggyBank, CircleAlert, ExternalLink, CalendarClock } from "lucide-react";
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

  useEffect(() => {
    let alive = true;
    const yearStart = `${new Date().getFullYear()}-01-01`;

    Promise.all([
      supabase.from("tax_rates").select("*"),
      supabase
        .from("bank_transactions")
        .select("amount_cents,expense_categories(name,kind)")
        .eq("is_business", true)
        .gte("posted_on", yearStart),
      supabase.from("salon_settings").select("filing_status,other_income_cents").limit(1).maybeSingle(),
    ]).then(([r, t, s]) => {
      if (!alive) return;

      const rateRows = (r.data ?? []) as RateRow[];
      setRates(rateRows);

      let revenueCents = 0;
      let costCents = 0;
      let savedCents = 0;

      for (const row of t.data ?? []) {
        const c = row.expense_categories as unknown as { name?: string; kind?: string } | null;
        const kind = c?.kind ?? null;
        const amt = Number(row.amount_cents);
        if (kind === "revenue") revenueCents += Math.abs(amt);
        // Capital counts as deductible on the assumption she makes the de
        // minimis election, which at her amounts is near-automatic. Owner
        // draws, contributions and personal spending never touch profit.
        else if (["fixed", "product", "variable", "resale", "capital"].includes(kind ?? ""))
          costCents += Math.abs(amt);
        // Money moved into savings, as a proxy for "put by". Imperfect — she
        // might be saving for something else — so it's shown, not assumed.
        if ((c?.name ?? "") === "Transfer between accounts" && amt < 0)
          savedCents += Math.abs(amt);
      }

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

  return (
    <div className="mt-10 border-t border-foreground/15 pt-8">
      <h3 className="font-display text-lg">What she owes on it</h3>

      {profit <= 0 ? (
        <p className="mt-2 max-w-prose text-sm text-muted">
          {est.missing[0] ??
            "Spending outruns income so far this year, so there's nothing to tax yet. That's normal in a first few months."}
        </p>
      ) : (
        <>
          <p className="mt-3 text-3xl font-medium tabular-nums">
            Put by {Math.round(est.suggestedRate * 100)}&cent;
            <span className="ml-2 align-middle text-sm font-normal text-muted">
              of every dollar of profit
            </span>
          </p>
          <p className="mt-1 max-w-prose text-sm text-muted">
            The arithmetic says {(est.effectiveRate * 100).toFixed(1)}&cent;. This rounds
            up and never goes below a quarter — putting too much in her own savings
            account costs her the use of it; putting too little costs a penalty and a
            scramble in April.
          </p>

          {/* Against what she has actually moved. */}
          <div className="mt-4 max-w-prose overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
            <div className="flex items-center gap-3 px-4 py-3">
              <span
                className={`-my-3 -ml-4 mr-1 w-1 self-stretch ${
                  behind > 0 ? "bg-amber-400" : "bg-accent/50"
                }`}
                aria-hidden
              />
              <PiggyBank size={17} className="shrink-0 text-muted" />
              <div className="flex-1 text-sm">
                {behind > 0 ? (
                  <>
                    <p className="font-medium">{money(behind)} short so far</p>
                    <p className="mt-0.5 text-muted">
                      {money(totals.savedCents)} moved to savings against{" "}
                      {money(shouldSave)} on profit of {money(profit)}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Ahead by {money(-behind)}</p>
                    <p className="mt-0.5 text-muted">
                      {money(totals.savedCents)} moved to savings, against{" "}
                      {money(shouldSave)} needed.
                    </p>
                  </>
                )}
              </div>
            </div>
            <p className="border-t border-foreground/10 px-4 py-2.5 text-xs text-muted">
              &ldquo;Moved to savings&rdquo; counts transfers out to her other accounts.
              If some of that was for something other than tax, this reads high.
            </p>
          </div>

          {/* The working. */}
          <div className="mt-4 max-w-prose overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
            {est.lines.map((l) => (
              <div
                key={l.key}
                className="flex items-baseline justify-between gap-4 border-t border-foreground/10 px-4 py-2.5 text-sm first:border-t-0"
              >
                <div className="min-w-0">
                  <span className={l.expectedZero ? "text-muted" : ""}>{l.label}</span>
                  <span className="ml-2 text-xs text-muted">{l.detail}</span>
                </div>
                <span
                  className={`shrink-0 font-medium tabular-nums ${
                    l.expectedZero ? "text-muted" : ""
                  }`}
                >
                  {exact(l.cents)}
                </span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 border-t border-foreground/15 bg-foreground/[0.03] px-4 py-2.5 text-sm">
              <span className="font-medium">Estimated for the year so far</span>
              <span className="font-medium tabular-nums">{exact(est.totalCents)}</span>
            </div>
          </div>
        </>
      )}

      {/* When, and what being late costs. */}
      {profit > 0 && (
        <div className="mt-4 max-w-prose overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-foreground/10 px-4 py-3">
            <CalendarClock size={16} className="shrink-0 text-muted" />
            <p className="text-sm">
              <span className="font-medium">
                Next federal payment {new Date(`${due.dueOn}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
              </span>
              <span className="ml-2 text-muted">
                {due.label}, {due.daysAway} day{due.daysAway === 1 ? "" : "s"} away
              </span>
            </p>
          </div>
          {penalties.map((p) => (
            <p key={p.who} className="border-t border-foreground/10 px-4 py-2.5 text-xs text-muted first:border-t-0">
              <span className="text-foreground">{p.who}</span> — {p.what}{" "}
              <a
                href={p.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                source
              </a>
            </p>
          ))}
          {duties.map((d) => (
            <p key={d.city} className="border-t border-foreground/10 px-4 py-2.5 text-xs text-muted">
              <span className="text-foreground">{d.city}</span> —{" "}
              {d.mustPrepay ? (
                <>
                  {exact(d.owedCents)} so far, past the $200 mark, so Ohio wants this
                  paid across the year rather than settled at the end.
                </>
              ) : (
                <>
                  {exact(d.owedCents)} so far. Ohio only requires payments through the
                  year once a city&rsquo;s tax reaches $200
                  {d.profitAtThresholdCents !== null && (
                    <> — about {money(d.profitAtThresholdCents)} of profit here</>
                  )}
                  , so this can wait until she files.
                </>
              )}
            </p>
          ))}
          <p className="border-t border-foreground/10 bg-amber-50/60 px-4 py-2.5 text-xs text-muted">
            The $200 rule is Ohio-wide (ORC 718.08), but Kettering and Oakwood set their
            own due dates and neither publishes them. Two phone calls: (937) 296-2502
            and (937) 298-0531.
          </p>
        </div>
      )}

      {/* Anything the salon's books can't know. */}
      {(est.missing.length > 0 || est.assumptions.length > 0) && (
        <div className="mt-4 max-w-prose rounded-xl border border-foreground/15 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleAlert size={15} className={est.missing.length > 0 ? "text-amber-600" : "text-muted"} />
            What this had to assume
          </p>
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
      )}

      <button
        onClick={() => setShowWorking((s) => !s)}
        className="mt-4 text-xs text-muted transition hover:text-foreground"
      >
        {showWorking ? "Hide where these rates came from" : "Where did these rates come from?"}
      </button>

      {showWorking && (
        <div className="mt-2 max-w-prose space-y-1.5 text-xs text-muted">
          {rates
            .filter((r) => r.bracket_floor_cents === null)
            .map((r) => (
              <p key={`${r.jurisdiction}-${r.filing_status ?? ""}`}>
                <span className="text-foreground">{r.label}</span>
                {r.filing_status ? ` (${r.filing_status.replace("_", " ")})` : ""} —{" "}
                checked {r.checked_on}{" "}
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
            This estimates. It never files, and it is not advice — a rate can be right
            and still be the wrong rate for her.
          </p>
        </div>
      )}
    </div>
  );
}
