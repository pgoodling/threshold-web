"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { checkSlot, type SlotReport } from "../../lib/slotCheck";
import { BLOCK_INK, timeLabel } from "../../lib/format";

// One line under the date and time, answering "is this free?" as she types.
//
// Written for the moment a Salon Lofts email or a text arrives asking for a
// time: she opens the form, puts in the service and the time they asked for,
// and knows what to reply before she's committed to anything.
//
// Only one outcome stops the booking — a clash with another client's busy
// time, which the database refuses regardless. Time off and working hours are
// warnings: it's her calendar, and a regular asking for 7:30 on a Tuesday is
// hers to say yes to.

const WEEKDAYS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
};

function Line({
  color,
  hatch,
  children,
}: {
  color: string;
  hatch?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p
      className="py-1 pl-3 text-sm leading-snug"
      style={{
        borderLeft: `3px solid ${color}`,
        backgroundImage: hatch
          ? "repeating-linear-gradient(135deg, transparent 0 5px, rgba(189,143,69,.18) 5px 6px)"
          : undefined,
      }}
    >
      {children}
    </p>
  );
}

export default function SlotStatus({
  serviceId,
  local,
  ignoreAppointmentId,
}: {
  serviceId: string;
  /** "YYYY-MM-DDTHH:MM", salon wall-clock time. */
  local: string;
  ignoreAppointmentId?: string;
}) {
  // Keyed by what was asked, so a slow answer for 2pm can never be shown
  // after she's already changed the time to 3pm.
  const key = serviceId && /T\d\d:\d\d/.test(local) ? `${serviceId}|${local}` : "";
  const [result, setResult] = useState<{ key: string; report: SlotReport | null }>({
    key: "",
    report: null,
  });

  useEffect(() => {
    if (!key) return;
    let live = true;
    checkSlot(supabase, { serviceId, local, ignoreAppointmentId }).then(
      (report) => {
        if (live) setResult({ key, report });
      },
    );
    return () => {
      live = false;
    };
  }, [key, serviceId, local, ignoreAppointmentId]);

  if (!key) return null;
  if (result.key !== key) {
    return <p className="text-sm text-muted">Checking that time…</p>;
  }
  const r = result.report;
  if (!r) return null;

  const span = `${timeLabel(r.startsAt)} – ${timeLabel(r.endsAt)}`;
  const weekday = WEEKDAYS[new Date(`${local.slice(0, 10)}T12:00:00Z`).getUTCDay()];
  const clean =
    r.clashes.length === 0 &&
    r.blocks.length === 0 &&
    !r.closed &&
    !r.outsideHours;

  return (
    <div className="grid gap-1.5" aria-live="polite">
      {r.clashes.map((c) => (
        <Line key={c.id} color="#8f3f4a">
          <span className="font-medium text-[#8f3f4a]">Taken.</span>{" "}
          {c.who} is booked for {c.service}, {timeLabel(c.startsAt)} –{" "}
          {timeLabel(c.endsAt)}.
        </Line>
      ))}

      {r.blocks.map((b, i) => (
        <Line key={i} color={BLOCK_INK} hatch>
          <span className="font-medium">You&apos;ve blocked this</span>
          {b.reason ? ` — ${b.reason}` : ""}. It will still book if you go
          ahead.
        </Line>
      ))}

      {r.closed && (
        <Line color={BLOCK_INK}>
          You don&apos;t normally work {weekday}. It will still book.
        </Line>
      )}

      {r.outsideHours && (
        <Line color={BLOCK_INK}>
          Runs outside your hours (
          {r.hours.map((h) => `${clock(h.start)}–${clock(h.end)}`).join(", ")}
          ). It will still book.
        </Line>
      )}

      {clean && (
        <Line color="#5d8a6a">
          <span className="font-medium text-[#3f6b4c]">Free</span> · {span}
        </Line>
      )}

      {/* Worth saying even when it's clean: "free" alone would look wrong to
          her when she can see a client on the calendar at that time. */}
      {r.clashes.length === 0 &&
        r.inGapOf.map((c) => (
          <p key={c.id} className="pl-3 text-xs text-muted">
            Fits inside {c.who}&apos;s processing time.
          </p>
        ))}
    </div>
  );
}
