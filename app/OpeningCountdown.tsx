"use client";

import { useEffect, useState } from "react";

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
  /** For the studio: one quiet line, not a hero. */
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

  if (openedAlready) {
    return compact ? null : (
      <p className="mb-6 text-sm uppercase tracking-[0.25em] text-accent">
        Now open
      </p>
    );
  }

  // In the studio this is a status line, not a hero. She doesn't need seconds
  // ticking at her while she works — she needs to know how many days are left
  // and to stop seeing it the moment it stops being true.
  if (compact) {
    const [d, h] = parts;
    return (
      <div className="mt-4 flex items-baseline gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
        <span className="font-display text-2xl leading-none tabular-nums text-accent-dark">
          {now === null ? "—" : d.value}
        </span>
        <span className="text-sm text-accent-dark">
          {d.value === 1 ? "day" : "days"} until opening
        </span>
        <span className="ml-auto text-xs text-muted">
          {now === null ? "" : `Mon 7 Sep · ${h.value}h to go today`}
        </span>
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
