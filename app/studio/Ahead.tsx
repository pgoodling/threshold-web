"use client";

import { useMemo, useState } from "react";
import { money } from "../../lib/format";
import {
  bucketAhead,
  completionRate,
  isAhead,
  value,
  MIN_DECIDED_FOR_RATE,
  type ApptLike,
} from "../../lib/projection";

// What's coming, in money.
//
// Everything else in Reports looks backwards. This looks forwards, which makes
// it the only screen that can change an outcome rather than record one: a week
// with nothing in it is still fillable three weeks out, and is not fillable on
// the Friday.
//
// The honesty problem is the whole design. "On the books" is a ceiling — it
// assumes every appointment happens and everyone pays — and if it's labelled
// "projected revenue" she'll plan against a number that has never once been
// correct. So the gross figure is named for what it is, and the adjusted one
// only appears when there's enough history for the adjustment to mean anything.

// Her brand sage. It fails the chroma floor a categorical palette has to meet —
// it reads closer to grey than to green — and a greener step would pass. That
// check exists so several hues stay tellable apart, and there is one series
// here; identity is carried by position and by the table underneath, never by
// colour alone. A louder green would also undo the soft palette this whole UI
// was deliberately built around.
const BAR = "#647f5a";

type Grain = "day" | "week" | "month";
const GRAINS: [Grain, number, string][] = [
  ["day", 14, "14 days"],
  ["week", 12, "12 weeks"],
  ["month", 12, "12 months"],
];

export default function Ahead({ rows }: { rows: ApptLike[] }) {
  const [grain, setGrain] = useState<Grain>("week");
  const span = GRAINS.find(([g]) => g === grain)![1];
  const spanLabel = GRAINS.find(([g]) => g === grain)![2];

  const buckets = useMemo(
    () => bucketAhead(rows, grain, span),
    [rows, grain, span],
  );

  const total = buckets.reduce((s, b) => s + b.booked, 0);
  const appts = buckets.reduce((s, b) => s + b.count, 0);
  const max = Math.max(...buckets.map((b) => b.booked), 1);

  const { rate, sample } = useMemo(() => completionRate(rows), [rows]);
  const expected = rate === null ? null : Math.round(total * rate);

  // Everything on the books, however far out — the window is a lens, not the
  // whole book, and she'd notice if the two disagreed with no explanation.
  const beyond = useMemo(() => {
    const all = rows.filter((r) => isAhead(r)).reduce((s, r) => s + value(r), 0);
    return all - total;
  }, [rows, total]);

  // The actionable bit, in words. A chart shows the dip; a sentence says which
  // week it is. Skipped for the day view, where an empty Sunday is just Sunday.
  const gap = useMemo(() => {
    if (grain === "day") return null;
    const empties = buckets.filter((b) => b.booked === 0);
    if (empties.length === 0) return null;
    return { first: empties[0], count: empties.length };
  }, [buckets, grain]);

  const peak = buckets.reduce((a, b) => (b.booked > a.booked ? b : a), buckets[0]);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="font-display text-lg">On the books</h3>
        {/* One control row, above everything it scopes. */}
        <div className="flex gap-4 text-sm">
          {GRAINS.map(([g, , label]) => (
            <button
              key={g}
              onClick={() => setGrain(g)}
              className={`border-b-2 pb-0.5 transition ${
                grain === g
                  ? "border-accent font-medium text-accent-dark"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero figure: same sans as everything else, proportional figures. It's
          a headline, not a column to be aligned. */}
      <p className="mt-4 text-4xl leading-none">{money(total)}</p>
      <p className="mt-1.5 text-sm text-muted">
        Booked over the next {spanLabel} · {appts}{" "}
        {appts === 1 ? "appointment" : "appointments"}
        {beyond > 0 && <> · {money(beyond)} further out</>}
      </p>

      <p className="mt-3 max-w-prose text-sm">
        {expected === null ? (
          <span className="text-muted">
            That&apos;s everything booked, before anyone cancels — a ceiling,
            not a forecast. Once {MIN_DECIDED_FOR_RATE} appointments have been
            through the books, this will show what usually lands.{" "}
            {sample > 0 && <>({sample} so far.)</>}
          </span>
        ) : (
          <>
            <span className="font-medium">{money(expected)} likely to land.</span>{" "}
            <span className="text-muted">
              {Math.round(rate! * 100)}% of what you book gets paid for, across{" "}
              {sample}
              {" past appointments. The rest cancels or doesn't show."}
            </span>
          </>
        )}
      </p>

      {/* Bars for the shape; the table below carries every figure, so nothing
          here is readable only by hovering. */}
      <div className="mt-6 flex h-40 items-end gap-[2px]">
        {buckets.map((b) => (
          <div
            key={b.start.toISOString()}
            className="group relative flex h-full flex-1 flex-col justify-end"
          >
            <span className="pointer-events-none absolute inset-x-0 bottom-full mb-1 text-center text-[10px] text-muted opacity-0 transition group-hover:opacity-100">
              {money(b.booked)}
            </span>
            {b.booked > 0 ? (
              <div
                className="rounded-t"
                style={{
                  height: `${Math.max((b.booked / max) * 100, 2)}%`,
                  background: BAR,
                }}
              />
            ) : (
              // An empty week is the point of the chart, so it gets a mark of
              // its own rather than being drawn as nothing at all.
              <div className="h-px bg-foreground/20" />
            )}
          </div>
        ))}
      </div>
      {/* Solid hairline baseline, one shade off the surface. */}
      <div className="h-px bg-foreground/15" />
      <div className="mt-1.5 flex gap-[2px]">
        {buckets.map((b) => (
          <span
            key={b.start.toISOString()}
            className="flex-1 text-center text-[10px] text-muted"
          >
            {b.label}
          </span>
        ))}
      </div>

      {/* Direct labels, selectively: the two buckets worth acting on. */}
      <div className="mt-4 grid gap-2 text-sm">
        {peak && peak.booked > 0 && (
          <p className="text-muted">
            Busiest is {peak.fullLabel} at{" "}
            <span className="text-foreground">{money(peak.booked)}</span>.
          </p>
        )}
        {gap && (
          <p
            className="rounded-xl border border-foreground/15 bg-white px-4 py-3"
            style={{ boxShadow: "inset 4px 0 0 #bd8f45" }}
          >
            <span className="font-medium">
              {gap.count === 1
                ? `Nothing booked for ${gap.first.fullLabel}.`
                : `${gap.count} ${grain === "week" ? "weeks" : "months"} with nothing booked, from ${gap.first.fullLabel}.`}
            </span>{" "}
            <span className="text-muted">
              Far enough out to still fill — Outreach is the fastest way.
            </span>
          </p>
        )}
      </div>

      {/* The table twin. Every value here is readable without hovering
          anything, which is what makes the chart above safe to keep sparse. */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted hover:text-foreground">
          Show the figures
        </summary>
        <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white">
          {buckets.map((b, i) => (
            <div
              key={b.start.toISOString()}
              className={`flex items-baseline gap-3 px-4 py-2 text-sm ${
                i > 0 ? "border-t border-foreground/10" : ""
              }`}
            >
              <span className="w-28 shrink-0 text-muted">{b.fullLabel}</span>
              <span className="text-muted">
                {b.count} {b.count === 1 ? "appt" : "appts"}
              </span>
              <span className="ml-auto tabular-nums">{money(b.booked)}</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
