"use client";

import { useEffect, useState } from "react";
import { pepLine } from "../lib/pep";

// The countdown to opening day, on the hero.
//
// It replaces a flat "Coming soon", which says nothing a visitor can act on. A
// date they can put in their calendar, and a number that visibly moves, is the
// difference between a page that says it's coming and a page that feels like
// it's about to happen.
//
// 9am on 7 September 2026, Eastern — the salon's timezone, hardcoded rather than
// the visitor's, because opening day is a fact about Kettering and not about
// wherever they happen to be reading this.
const OPENING = new Date("2026-09-07T09:00:00-04:00");

// How far out the studio progress bar starts filling from.
const RUN_UP_DAYS = 30;

const UNITS = [
  { key: "days", label: "days", ms: 86400000 },
  { key: "hours", label: "hours", ms: 3600000 },
  { key: "minutes", label: "minutes", ms: 60000 },
  { key: "seconds", label: "seconds", ms: 1000 },
] as const;

function split(remaining: number) {
  let left = Math.max(0, remaining);
  return UNITS.map((u) => {
    const value = Math.floor(left / u.ms);
    left -= value * u.ms;
    return { ...u, value };
  });
}

export default function OpeningCountdown({
  compact = false,
}: {
  /** The studio band: days left, a filling bar, and a line meant for her. */
  compact?: boolean;
}) {
  // Null until mounted: the server has no idea what time it is where the
  // visitor is, and rendering a number that immediately changes would flash a
  // wrong value on first paint.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    // The first read is scheduled rather than run inline: reading the clock
    // during render or straight from an effect body makes the component impure,
    // and the timer is a subscription like any other.
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  const remaining = OPENING.getTime() - (now ?? OPENING.getTime());
  const openedAlready = now !== null && remaining <= 0;
  const parts = split(remaining);

  // Once she's open the public hero says so and stops counting; the studio band
  // keeps going, because the daily line is the point and it outlasts the
  // countdown.
  if (openedAlready && !compact) {
    return (
      <p className="mb-6 text-sm uppercase tracking-[0.25em] text-accent">
        Now open
      </p>
    );
  }

  // In the studio it's the first thing she sees each morning, so it does two
  // jobs: the number, and a line meant for her. Seconds are left off — she
  // doesn't need a clock ticking at her while she works.
  if (compact) {
    const [d, h] = parts;
    const days = now === null ? null : openedAlready ? -1 : d.value;
    // Same key all day, so the line doesn't change while she's looking at it.
    const dayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    }).format(now === null ? OPENING : new Date(now));

    // How far through the run-up she is, from a month out. A number alone gives
    // no sense of movement; a bar that's visibly filling does.
    const progress =
      days === null ? 0 : Math.max(0, Math.min(1, (RUN_UP_DAYS - days) / RUN_UP_DAYS));

    return (
      <div className="mt-5 overflow-hidden rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-accent/[0.03]">
        <div className="flex items-end gap-4 px-5 pt-5">
          <span className="font-display text-5xl leading-none tabular-nums text-accent-dark sm:text-6xl">
            {days === null ? "—" : days}
          </span>
          <span className="pb-1">
            <span className="block text-sm font-medium text-accent-dark">
              {days === 1 ? "day" : "days"} until you open
            </span>
            <span className="block text-xs text-muted">
              Monday 7 September
              {days !== null && days > 0 && ` · ${h.value}h left today`}
            </span>
          </span>
        </div>

        <div className="mx-5 mt-4 h-1 overflow-hidden rounded-full bg-accent/15">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-1000"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        {/* Held back until the clock has been read — otherwise it flashes the
            opening-day line for a frame before settling on today's. */}
        <p className="px-5 pb-5 pt-3 font-display text-base italic text-foreground/80">
          {days === null ? " " : pepLine(days, dayKey)}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <p className="mb-4 text-sm uppercase tracking-[0.25em] text-accent">
        Opening Monday 7 September
      </p>

      <div
        className="mx-auto flex max-w-md items-stretch justify-center"
        // Announced once as a whole rather than shouting every passing second.
        role="timer"
        aria-live="off"
        aria-label={`Opening in ${parts[0].value} days`}
      >
        {parts.map((p, i) => (
          <div
            key={p.key}
            className={`flex-1 px-2 py-3 sm:px-4 ${
              i > 0 ? "border-l border-foreground/10" : ""
            }`}
          >
            <div
              className={`font-display text-3xl leading-none tabular-nums sm:text-5xl ${
                // Seconds tick constantly; letting them sit quieter stops the
                // eye being dragged to the least meaningful number on the page.
                p.key === "seconds" ? "text-muted" : "text-foreground"
              }`}
            >
              {now === null ? "—" : String(p.value).padStart(2, "0")}
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-muted">
              {p.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
