"use client";

import { useEffect, useState } from "react";
// 9am on 7 September 2026, Eastern — the salon's timezone, hardcoded rather than
// the visitor's, because opening day is a fact about Kettering and not about
// wherever they happen to be reading this.
import { OPENING } from "../lib/opening";

// The countdown to opening day, on the public hero.
//
// It replaced a flat "Coming soon", which says nothing a visitor can act on. A
// date they can put in their calendar, and a number that visibly moves, is the
// difference between a page that says it's coming and a page that feels like
// it's about to happen. Opening day has now passed, so in practice this renders
// "Now open" and the counting is history — kept because the component is what
// makes that transition happen on its own.
//
// There used to be a `compact` variant for the studio dashboard: the same
// countdown plus a daily line for Evelyn. It's gone. Once she opened, it was
// showing her "-1 days until you open" above a full progress bar every morning
// — the arithmetic assumed a date that had stopped being in the future. The
// daily line was the half of it worth keeping, so that moved to
// app/studio/DailyLine.tsx and stands on its own.

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

export default function OpeningCountdown() {
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

  // Open now, so say so and stop counting.
  if (openedAlready) {
    return (
      <p className="mb-6 text-sm uppercase tracking-[0.25em] text-accent">
        Now open
      </p>
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
