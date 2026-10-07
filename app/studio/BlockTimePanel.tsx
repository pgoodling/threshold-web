"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { salonWallToISO, dayKey, timeLabel, dateLabel } from "../../lib/format";

// Blocking time from the calendar — a dentist appointment, a school run, a
// week away — without going to the Time off tab.
//
// Same rows and the same rules as Time off: a `time_off` range that online
// booking won't book across. A block over a booked client is a warning, not a
// refusal (she may be about to move them), and it names who. Editing updates
// the row in place, so the time is never briefly open to a client.

export type BlockRow = { id: string; starts_at: string; ends_at: string; reason: string | null };

type Clash = { id: string; starts_at: string; clients: { full_name: string } | { full_name: string }[] | null };

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** Plus one hour, for a sensible default "To". */
const plusHour = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export default function BlockTimePanel({
  date,
  time,
  block,
  onClose,
  onDone,
}: {
  /** A new block: the day, and the time she tapped ("" from + New). */
  date?: string;
  time?: string;
  /** An existing block, opened from the calendar to change or remove. */
  block?: BlockRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const startDay = block ? dayKey(block.starts_at) : (date ?? "");
  const endDay = block ? dayKey(block.ends_at) : startDay;
  const wasAllDay =
    !!block && hhmm(block.starts_at) === "00:00" && ["23:59", "00:00"].includes(hhmm(block.ends_at));

  const [fromDate, setFromDate] = useState(startDay);
  const [toDate, setToDate] = useState(block && endDay !== startDay ? endDay : "");
  const [allDay, setAllDay] = useState(block ? wasAllDay : !time);
  const [start, setStart] = useState(block && !wasAllDay ? hhmm(block.starts_at) : time || "09:00");
  const [end, setEnd] = useState(block && !wasAllDay ? hhmm(block.ends_at) : plusHour(time || "09:00"));
  const [reason, setReason] = useState(block?.reason ?? "");
  const [clashes, setClashes] = useState<Clash[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const multiDay = Boolean(toDate && toDate > fromDate);

  function range() {
    const to = toDate && toDate >= fromDate ? toDate : fromDate;
    const fullDays = multiDay || allDay;
    return {
      startsISO: salonWallToISO(`${fromDate}T${fullDays ? "00:00" : start}`),
      endsISO: salonWallToISO(`${fullDays ? to : fromDate}T${fullDays ? "23:59" : end}`),
    };
  }

  async function save(anyway = false) {
    if (!fromDate) return setError("Pick a date.");
    if (!(multiDay || allDay) && end <= start) return setError("“To” should be after “From”.");
    setError(null);
    setBusy(true);
    const { startsISO, endsISO } = range();

    if (!anyway) {
      // Who's booked in that time. Cancelled and no-shows aren't coming.
      const { data } = await supabase
        .from("appointments")
        .select("id,starts_at,clients(full_name)")
        .lt("starts_at", endsISO)
        .gt("ends_at", startsISO)
        .not("status", "in", "(cancelled,no_show)")
        .order("starts_at");
      const found = (data ?? []) as unknown as Clash[];
      if (found.length > 0) {
        setClashes(found);
        setBusy(false);
        return;
      }
    }

    const row = { starts_at: startsISO, ends_at: endsISO, reason: reason.trim() || null };
    const { error: e } = block
      ? await supabase.from("time_off").update(row).eq("id", block.id)
      : await supabase.from("time_off").insert(row);
    setBusy(false);
    if (e) return setError(e.message);
    onDone();
  }

  async function unblock() {
    if (!block) return;
    setBusy(true);
    const { error: e } = await supabase.from("time_off").delete().eq("id", block.id);
    setBusy(false);
    if (e) return setError(e.message);
    onDone();
  }

  const field = "input w-full";
  const who = (c: Clash) =>
    (Array.isArray(c.clients) ? c.clients[0]?.full_name : c.clients?.full_name) ?? "A client";

  return (
    <div className="rounded-2xl border border-accent/30 bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg">{block ? "Blocked time" : "Block time"}</p>
        <button onClick={onClose} aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center -my-2 -mr-2.5 text-muted hover:text-accent">
          ✕
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">Date</span>
          <input
            type="date"
            className={field}
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setClashes(null);
            }}
          />
        </label>

        {!multiDay && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => {
                setAllDay(e.target.checked);
                setClashes(null);
              }}
            />
            All day
          </label>
        )}

        {!multiDay && !allDay && (
          <div className="flex gap-3">
            <label className="block flex-1 text-sm">
              <span className="mb-1 block text-xs text-muted">From</span>
              <input
                type="time"
                className={field}
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setClashes(null);
                }}
              />
            </label>
            <label className="block flex-1 text-sm">
              <span className="mb-1 block text-xs text-muted">To</span>
              <input
                type="time"
                className={field}
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setClashes(null);
                }}
              />
            </label>
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">Until (for more than one day)</span>
          <input
            type="date"
            className={field}
            value={toDate}
            min={fromDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setClashes(null);
            }}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted">Reason (optional)</span>
          <input
            className={field}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="School pickup"
          />
        </label>

        {clashes && clashes.length > 0 && (
          <div className="py-1 pl-3 text-sm leading-snug" style={{ borderLeft: "3px solid #E0A33A" }}>
            {clashes.map((c) => (
              <p key={c.id}>
                <span className="font-medium text-[#854F0B]">{who(c)}</span> is booked at{" "}
                {timeLabel(c.starts_at)}
                {multiDay || allDay ? ` on ${dateLabel(c.starts_at)}` : ""}.
              </p>
            ))}
            <p className="text-muted">Blocking won&rsquo;t cancel them.</p>
          </div>
        )}

        {error && <p className="text-sm text-accent-dark">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => save(Boolean(clashes && clashes.length))}
            disabled={busy}
            className="rounded-md bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-60"
          >
            {busy ? "Saving…" : clashes && clashes.length ? "Block anyway" : block ? "Save" : "Block it"}
          </button>
          {block && (
            <button
              onClick={unblock}
              disabled={busy}
              className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Unblock
            </button>
          )}
          <button onClick={onClose} className="inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-accent">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
