"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { money } from "../../lib/format";
import {
  bucketAhead,
  completionRate,
  isAhead,
  monthToDate,
  value,
  MIN_DECIDED_FOR_RATE,
  type ApptLike,
} from "../../lib/projection";
import Button from "./Button";

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
// The target rule. Honey rather than a dash: a dashed line is visual noise and
// the guidance is right that it reads as "threshold" even when it isn't one —
// here it IS one, so it earns a colour and a label instead.
const TARGET = "#bd8f45";

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

  // ── The monthly target ──────────────────────────────────────────────────
  const [target, setTarget] = useState<number | null>(null);
  const [noTable, setNoTable] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const loadTarget = useCallback(() => {
    supabase
      .from("salon_settings")
      .select("monthly_revenue_target_cents")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setNoTable(true);
          return;
        }
        setTarget(data?.monthly_revenue_target_cents ?? null);
      });
  }, []);

  useEffect(loadTarget, [loadTarget]);

  async function saveTarget() {
    // She types dollars; the column is cents, like every other money column.
    const dollars = Number(draft.replace(/[^0-9.]/g, ""));
    const cents =
      draft.trim() === "" || !Number.isFinite(dollars)
        ? null
        : Math.round(dollars * 100);
    setTarget(cents);
    setEditing(false);
    await supabase
      .from("salon_settings")
      .update({
        monthly_revenue_target_cents: cents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
  }

  const mtd = useMemo(() => monthToDate(rows), [rows]);

  // The rule has to be inside the plot to be read as a threshold, so the scale
  // stretches to include it. Without this a target above every bar would sit
  // off the top of the chart, which is exactly when she most needs to see it.
  //
  // The headroom is not cosmetic. When the target is higher than every bar it
  // becomes the maximum, lands at exactly 100%, and its label renders outside
  // the container and over whatever sits above — which is the normal case for
  // a salon that isn't hitting target, i.e. precisely when she's looking.
  const showRule = grain === "month" && target !== null && target > 0;
  const tallestBar = Math.max(...buckets.map((b) => b.booked), 1);
  const max = showRule
    ? Math.max(tallestBar, target! * 1.12)
    : tallestBar;
  const rulePct = showRule ? (target! / max) * 100 : 0;

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

      {/* ── This month against target ──────────────────────────────────── */}
      {!noTable && (
        <div className="mt-5 rounded-xl border border-foreground/15 bg-white px-4 py-3">
          {editing ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
                  Monthly target
                </span>
                <input
                  className="input w-32"
                  autoFocus
                  inputMode="decimal"
                  placeholder="6000"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveTarget()}
                />
              </label>
              <Button onClick={saveTarget}>Save</Button>
              <button
                onClick={() => setEditing(false)}
                className="pb-2 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <p className="w-full text-xs text-muted">
                Leave it empty to stop tracking against a target.
              </p>
            </div>
          ) : target === null ? (
            <p className="text-sm text-muted">
              <button
                onClick={() => {
                  setDraft("");
                  setEditing(true);
                }}
                className="font-medium text-accent-dark underline decoration-accent underline-offset-4"
              >
                Set a monthly target
              </button>{" "}
              and this will tell you where the month stands against it.
            </p>
          ) : (
            <MonthProgress
              mtd={mtd}
              target={target}
              onEdit={() => {
                setDraft(String(Math.round(target / 100)));
                setEditing(true);
              }}
            />
          )}
        </div>
      )}

      {/* Bars for the shape; the table below carries every figure, so nothing
          here is readable only by hovering. */}
      <div className="relative mt-6 flex h-40 items-end gap-[2px]">
        {/* The target, drawn only where a monthly figure means something. */}
        {showRule && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10"
            style={{ bottom: `${rulePct}%` }}
          >
            <div className="h-px w-full" style={{ background: TARGET }} />
            {/* Below the line when there's no room above it, so the label can
                never be clipped or land on top of the card above. */}
            <span
              className={`absolute right-0 text-[10px] ${
                rulePct > 85 ? "top-0.5" : "-top-4"
              }`}
              style={{ color: TARGET }}
            >
              target {money(target!)}
            </span>
          </div>
        )}
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

// Where the month stands, in the order she'd ask it: how much, against what,
// and what the gap is.
//
// The gap is the whole point, so it's the sentence and not a percentage. "72%
// of target" needs arithmetic before it becomes an action; "$1,680 short with
// 11 days left" already is one.
function MonthProgress({
  mtd,
  target,
  onEdit,
}: {
  mtd: ReturnType<typeof monthToDate>;
  target: number;
  onEdit: () => void;
}) {
  const gap = target - mtd.projected;
  const pct = Math.min((mtd.projected / target) * 100, 100);
  // Taken and booked are different kinds of certainty, so the bar shows where
  // one ends and the other begins rather than presenting a single confident
  // block.
  const takenPct = Math.min((mtd.taken / target) * 100, 100);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">This month</span>
        <span className="tabular-nums">
          {money(mtd.projected)} of {money(target)}
        </span>
        <button
          onClick={onEdit}
          className="ml-auto text-xs text-muted underline underline-offset-4 hover:text-foreground"
        >
          Change target
        </button>
      </div>

      {/* Square-ish ends on purpose. A fully rounded meter is a pill, and the
          9999px radius is retired everywhere in this UI except avatars. */}
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-[2px] bg-foreground/10">
        <div style={{ width: `${takenPct}%`, background: BAR }} />
        {/* The booked remainder, lighter — money that hasn't arrived yet and
            shouldn't look as solid as money that has. */}
        <div
          style={{
            width: `${Math.max(pct - takenPct, 0)}%`,
            background: BAR,
            opacity: 0.4,
          }}
        />
      </div>

      <p className="mt-2 text-sm text-muted">
        {money(mtd.taken)} taken
        {mtd.booked > 0 && <> · {money(mtd.booked)} still booked in</>} ·{" "}
        {gap > 0 ? (
          <span className="text-foreground">
            {money(gap)} short with {mtd.daysLeft}{" "}
            {mtd.daysLeft === 1 ? "day" : "days"} left
          </span>
        ) : (
          <span className="text-foreground">
            {money(-gap)} clear of target
          </span>
        )}
      </p>
    </div>
  );
}
