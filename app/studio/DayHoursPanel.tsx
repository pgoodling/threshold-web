"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { salonWallToISO, timeLabel } from "../../lib/format";
import { salonMinutes } from "../../lib/dayLayout";
import {
  resolveHours,
  hoursLabel,
  outsideWindows,
  weekdayOf,
  type Window,
  type WeeklyRule,
  type DayOverride,
} from "../../lib/dayHours";

// Hours for one day, without touching the week (0049).
//
// Three choices: her usual hours, different hours, or closed. Online booking
// follows whatever this day says; every other week stays as it was. Choosing
// something that matches the week removes the row rather than storing a copy,
// so changing the week later still reaches that day.
//
// Shortening a day or closing it over a booked client is a warning that names
// them, not a refusal -- same as Block time. Nothing is cancelled.

type Mode = "usual" | "different" | "closed";
type Booked = { id: string; starts_at: string; ends_at: string; clients: { full_name: string } | null };

const short = (t: string) => t.slice(0, 5);

const dayTitle = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(
    new Date(y, m - 1, d),
  );
};
const weekdayName = (day: string) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekdayOf(day)];

const addDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

export default function DayHoursPanel({
  date,
  onClose,
  onDone,
}: {
  date: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [weekly, setWeekly] = useState<Window[] | null>(null);
  const [mode, setMode] = useState<Mode>("usual");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [stranded, setStranded] = useState<Booked[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from("availability_rules").select("weekday,start_time,end_time").eq("active", true),
      supabase.from("day_hours").select("day,start_time,end_time").eq("day", date),
    ]).then(([w, o]) => {
      if (!live) return;
      const rules = (w.data ?? []) as WeeklyRule[];
      const usual = resolveHours(date, rules, []).windows;
      setWeekly(usual);
      const own = ((o.data ?? []) as DayOverride[])[0];
      const first = usual[0];
      if (own && own.start_time && own.end_time) {
        setMode("different");
        setStart(short(own.start_time));
        setEnd(short(own.end_time));
      } else {
        if (own) setMode("closed");
        if (first) {
          setStart(short(first.start_time));
          setEnd(short(first.end_time));
        }
      }
    });
    return () => {
      live = false;
    };
  }, [date]);

  const windowsFor = (m: Mode): Window[] =>
    m === "usual" ? (weekly ?? []) : m === "closed" ? [] : [{ start_time: start, end_time: end }];

  async function save(anyway = false) {
    if (weekly === null) return;
    if (mode === "different" && end <= start) return setError("The closing time should be after the opening time.");
    setError(null);
    setBusy(true);

    if (!anyway) {
      // Clients who were inside her hours and wouldn't be any more.
      const { data } = await supabase
        .from("appointments")
        .select("id,starts_at,ends_at,clients(full_name)")
        .gte("starts_at", salonWallToISO(`${date}T00:00`))
        .lt("starts_at", salonWallToISO(`${addDay(date)}T00:00`))
        .not("status", "in", "(cancelled,no_show)")
        .order("starts_at");
      const rows = ((data ?? []) as unknown as Booked[]).map((a) => ({
        a,
        startMin: salonMinutes(a.starts_at),
        endMin: salonMinutes(a.starts_at) + (Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000,
      }));
      const before = new Set(outsideWindows(rows, await currentWindows()).map((r) => r.a.id));
      const left = outsideWindows(rows, windowsFor(mode)).filter((r) => !before.has(r.a.id));
      if (left.length > 0) {
        setStranded(left.map((r) => r.a));
        setBusy(false);
        return;
      }
    }

    // Same as the week = no row, so the week stays in charge of this day.
    const sameAsWeek =
      mode === "usual" ||
      (mode === "closed" && weekly.length === 0) ||
      (mode === "different" &&
        weekly.length === 1 &&
        short(weekly[0].start_time) === start &&
        short(weekly[0].end_time) === end);

    const { error: e } = sameAsWeek
      ? await supabase.from("day_hours").delete().eq("day", date)
      : await supabase.from("day_hours").upsert(
          mode === "closed"
            ? { day: date, start_time: null, end_time: null }
            : { day: date, start_time: start, end_time: end },
        );
    setBusy(false);
    if (e) return setError(e.message);
    onDone();
  }

  // What the day is right now, before this save.
  async function currentWindows(): Promise<Window[]> {
    const { data } = await supabase.from("day_hours").select("day,start_time,end_time").eq("day", date);
    const rules = (weekly ?? []).map((w) => ({ ...w, weekday: weekdayOf(date) }));
    return resolveHours(date, rules, (data ?? []) as DayOverride[]).windows;
  }

  const pick = (m: Mode) => {
    setMode(m);
    setStranded(null);
  };
  const option = (m: Mode) =>
    `block w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${
      mode === m ? "border-accent ring-1 ring-accent" : "border-foreground/15 hover:border-foreground/30"
    }`;

  const until = windowsFor(mode);
  const summary =
    mode === "usual"
      ? null
      : until.length === 0
        ? `Nobody can book online that day. Every other ${weekdayName(date)} stays ${hoursLabel(weekly ?? [])}.`
        : `Online booking follows ${hoursLabel(until)} that day. Every other ${weekdayName(date)} stays ${hoursLabel(weekly ?? [])}.`;

  return (
    <div className="rounded-2xl border border-accent/30 bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg">Hours for {dayTitle(date)}</p>
        <button
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center -my-2 -mr-2.5 text-muted hover:text-accent"
        >
          ✕
        </button>
      </div>

      {weekly === null ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-4 grid gap-2">
          <button onClick={() => pick("usual")} className={option("usual")}>
            Usual hours
            <span className="block text-xs text-muted">
              {weekly.length ? `${hoursLabel(weekly)}, every ${weekdayName(date)}` : `Closed every ${weekdayName(date)}`}
            </span>
          </button>
          <div className={option("different")} onClick={() => mode !== "different" && pick("different")}>
            <button onClick={() => pick("different")} className="min-h-11 inline-flex items-center w-full text-left">
              Different hours
            </button>
            {mode === "different" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="time"
                  aria-label="Opens"
                  className="input w-auto"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setStranded(null);
                  }}
                />
                <span className="text-muted">to</span>
                <input
                  type="time"
                  aria-label="Closes"
                  className="input w-auto"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setStranded(null);
                  }}
                />
              </div>
            )}
          </div>
          <button onClick={() => pick("closed")} className={option("closed")}>
            Closed
          </button>

          {summary && <p className="mt-1 text-sm text-muted">{summary}</p>}

          {stranded && stranded.length > 0 && (
            <div className="py-1 pl-3 text-sm leading-snug" style={{ borderLeft: "3px solid #E0A33A" }}>
              {stranded.map((c) => (
                <p key={c.id}>
                  <span className="font-medium text-[#854F0B]">{c.clients?.full_name ?? "A client"}</span> is booked at{" "}
                  {timeLabel(c.starts_at)}.
                </p>
              ))}
              <p className="text-muted">This won&rsquo;t cancel them.</p>
            </div>
          )}

          {error && <p className="text-sm text-accent-dark">{error}</p>}

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <button
              onClick={() => save(Boolean(stranded && stranded.length))}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-accent px-5 text-sm text-white transition hover:bg-accent-dark disabled:opacity-60"
            >
              {busy ? "Saving…" : stranded && stranded.length ? "Save anyway" : "Save"}
            </button>
            <button onClick={onClose} className="inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-accent">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The one-off days still to come, under the weekly hours in Settings › Hours.
export function DayHoursList({ onEdit }: { onEdit: (day: string) => void }) {
  const [rows, setRows] = useState<DayOverride[] | null>(null);
  const [weekly, setWeekly] = useState<WeeklyRule[]>([]);

  const load = useCallback(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    Promise.all([
      supabase.from("day_hours").select("day,start_time,end_time").gte("day", today).order("day"),
      supabase.from("availability_rules").select("weekday,start_time,end_time").eq("active", true),
    ]).then(([o, w]) => {
      // No table yet (0049 not run): show nothing rather than an error.
      setRows(o.error ? [] : ((o.data ?? []) as DayOverride[]));
      setWeekly((w.data ?? []) as WeeklyRule[]);
    });
  }, []);

  useEffect(load, [load]);

  async function remove(day: string) {
    await supabase.from("day_hours").delete().eq("day", day);
    load();
  }

  if (rows === null) return null;

  return (
    <div className="mt-8">
      <div className="flex items-baseline gap-3">
        <h3 className="text-xs uppercase tracking-[0.15em] text-muted">Just these days</h3>
        <span className="h-px flex-1 bg-foreground/10" />
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white">
        {rows.length === 0 && (
          <p className="px-4 py-4 text-sm text-muted">
            None. To change one day, open it on the calendar and tap its hours.
          </p>
        )}
        {rows.map((r, i) => {
          const own = resolveHours(r.day, weekly, [r]).windows;
          const usual = resolveHours(r.day, weekly, []).windows;
          return (
            <div
              key={r.day}
              style={{ boxShadow: "inset 4px 0 0 #bd8f45" }}
              className={`flex items-center justify-between gap-3 py-2 pl-5 pr-3 ${i > 0 ? "border-t border-foreground/10" : ""}`}
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium">{dayTitle(r.day)}</span>
                <span className="ml-2">{hoursLabel(own)}</span>
                <span className="block text-xs text-muted">
                  {usual.length ? `usually ${hoursLabel(usual)}` : "usually closed"}
                </span>
              </span>
              <span className="flex shrink-0 items-center">
                <button onClick={() => onEdit(r.day)} className="inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-accent-dark">
                  Change
                </button>
                <button onClick={() => remove(r.day)} className="inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-accent-dark">
                  Remove
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
