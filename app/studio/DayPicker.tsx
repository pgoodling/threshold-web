"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { salonWallToISO } from "../../lib/format";
import { layoutLanes, salonMinutes, freeGaps } from "../../lib/dayLayout";

// The day she's booking into, drawn under the date while she rebooks.
//
// Rebooking used to be a date box, a time box and a line saying whether that
// one time was free — she couldn't see the rest of the day without leaving the
// form. Now the day is here: who's in, what's blocked, and every gap long
// enough for this service outlined in green. Tapping a gap fills the time;
// tapping anywhere else picks that time (to the quarter hour), and the line
// underneath still says if it overlaps someone.
//
// Free is judged on busy blocks, not appointment spans, the same way the
// database judges it — so a colour client's processing gap shows as free when
// it's long enough.

type Appt = {
  id: string;
  starts_at: string;
  ends_at: string;
  clients: { full_name: string } | { full_name: string }[] | null;
  services: { name: string } | { name: string }[] | null;
};
type Span = { starts_at: string; ends_at: string };

const HOUR_PX = 40;
const SNAP = 15;
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const clock = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}` : `${h12}`;
};
const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export default function DayPicker({
  date,
  time,
  serviceId,
  ignoreAppointmentId,
  onDate,
  onTime,
}: {
  /** "YYYY-MM-DD", salon time. */
  date: string;
  /** "HH:MM" or "". */
  time: string;
  serviceId: string;
  ignoreAppointmentId?: string;
  onDate: (d: string) => void;
  onTime: (t: string) => void;
}) {
  const [data, setData] = useState<{
    key: string;
    appts: Appt[];
    busy: (Span & { appointment_id: string })[];
    off: (Span & { reason: string | null })[];
    hours: { start: number; end: number }[];
    duration: number;
  } | null>(null);
  const key = date && serviceId ? `${date}|${serviceId}` : "";

  useEffect(() => {
    if (!key) return;
    let live = true;
    const dayStart = salonWallToISO(`${date}T00:00`);
    const dayEnd = salonWallToISO(`${addDays(date, 1)}T00:00`);
    const [y, m, d] = date.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    Promise.all([
      supabase
        .from("appointments")
        .select("id,starts_at,ends_at,clients(full_name),services(name)")
        .lt("starts_at", dayEnd)
        .gt("ends_at", dayStart)
        .not("status", "in", "(cancelled,no_show)")
        .order("starts_at"),
      supabase
        .from("appointment_busy")
        .select("appointment_id,starts_at,ends_at")
        .lt("starts_at", dayEnd)
        .gt("ends_at", dayStart),
      supabase
        .from("time_off")
        .select("starts_at,ends_at,reason")
        .lt("starts_at", dayEnd)
        .gt("ends_at", dayStart),
      supabase
        .from("availability_rules")
        .select("start_time,end_time")
        .eq("weekday", weekday)
        .eq("active", true),
      supabase.from("services").select("*").eq("id", serviceId).maybeSingle(),
    ]).then(([a, b, o, h, s]) => {
      if (!live) return;
      const svc = s.data as {
        duration_minutes: number;
        start_minutes: number | null;
        process_minutes: number | null;
        finish_minutes: number | null;
      } | null;
      const segs = (svc?.start_minutes ?? 0) + (svc?.process_minutes ?? 0) + (svc?.finish_minutes ?? 0);
      setData({
        key,
        appts: ((a.data ?? []) as unknown as Appt[]).filter((x) => x.id !== ignoreAppointmentId),
        busy: ((b.data ?? []) as (Span & { appointment_id: string })[]).filter(
          (x) => x.appointment_id !== ignoreAppointmentId,
        ),
        off: (o.data ?? []) as (Span & { reason: string | null })[],
        hours: (h.data ?? []).map((r) => ({
          start: toMin(String(r.start_time).slice(0, 5)),
          end: toMin(String(r.end_time).slice(0, 5)),
        })),
        duration: segs > 0 ? segs : (svc?.duration_minutes ?? 60),
      });
    });
    return () => {
      live = false;
    };
  }, [key, date, serviceId, ignoreAppointmentId]);

  const ready = data && data.key === key ? data : null;

  // Clip a span to this day, in minutes. Blocks and appointments can start
  // before midnight or run past it.
  const clip = (sp: Span) => {
    const dayStart = +new Date(salonWallToISO(`${date}T00:00`));
    const dayEnd = +new Date(salonWallToISO(`${addDays(date, 1)}T00:00`));
    const s = +new Date(sp.starts_at);
    const e = +new Date(sp.ends_at);
    return {
      from: s <= dayStart ? 0 : salonMinutes(sp.starts_at),
      to: e >= dayEnd ? 24 * 60 : salonMinutes(sp.ends_at),
    };
  };

  const view = useMemo(() => {
    if (!ready) return null;
    const placed = layoutLanes(ready.appts);
    const off = ready.off.map((b) => ({ ...clip(b), reason: b.reason }));
    const busy = ready.busy.map(clip);
    // Free: inside her hours, clear of busy blocks and time off, long enough.
    const fitting = freeGaps(ready.hours, [...busy, ...off], ready.duration);
    const edges = [
      ...ready.hours.flatMap((h) => [h.start, h.end]),
      ...placed.flatMap((p) => [p.startMin, p.endMin]),
    ];
    const top = edges.length ? Math.floor(Math.min(...edges) / 60) * 60 : 9 * 60;
    const bottom = edges.length ? Math.ceil(Math.max(...edges) / 60) * 60 : 17 * 60;
    return { placed, off, fitting, top, bottom };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const label = date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "";

  if (!date) return null;

  const y = (min: number) => ((min - (view?.top ?? 0)) / 60) * HOUR_PX;
  const sel = time ? toMin(time) : null;

  return (
    <div className="rounded-xl border border-foreground/15 bg-white p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onDate(addDays(date, -1))}
          aria-label="Previous day"
          className="rounded-md p-1 text-muted hover:text-foreground"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium">{label}</span>
        <button
          type="button"
          onClick={() => onDate(addDays(date, 1))}
          aria-label="Next day"
          className="rounded-md p-1 text-muted hover:text-foreground"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {!serviceId ? (
        <p className="mt-2 text-xs text-muted">Choose a service to see where it fits.</p>
      ) : !view ? (
        <p className="mt-2 text-xs text-muted">Loading the day…</p>
      ) : (
        <>
          {view.fitting.length === 0 && (
            <p className="mt-1 text-xs text-muted">
              No gap long enough this day — tap a time anyway, or try another day.
            </p>
          )}
          <div
            className="relative mt-2 cursor-pointer select-none"
            style={{ height: ((view.bottom - view.top) / 60) * HOUR_PX }}
            onClick={(e) => {
              const top = e.currentTarget.getBoundingClientRect().top;
              const min = view.top + ((e.clientY - top) / HOUR_PX) * 60;
              const snapped = Math.max(view.top, Math.round(min / SNAP) * SNAP);
              onTime(hhmm(Math.min(snapped, view.bottom - SNAP)));
            }}
          >
            {/* Hour lines */}
            {Array.from({ length: (view.bottom - view.top) / 60 + 1 }, (_, i) => view.top + i * 60).map(
              (m) => (
                <div
                  key={m}
                  className="absolute inset-x-0 border-t border-foreground/10 text-[10px] text-muted"
                  style={{ top: y(m) }}
                >
                  <span className="relative -top-2 bg-white pr-1">{clock(m)}</span>
                </div>
              ),
            )}

            {/* Free gaps that fit — tap to take the start of one. */}
            {view.fitting.map((g) => (
              <button
                key={`${g.from}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTime(hhmm(g.from));
                }}
                className="absolute left-8 right-1 rounded border border-dashed border-[#1D9E75] bg-[#1D9E75]/[0.06] px-1.5 text-left text-[10px] text-[#0F6E56]"
                style={{ top: y(g.from) + 1, height: Math.max(14, y(g.to) - y(g.from) - 2) }}
              >
                Free {clock(g.from)}–{clock(g.to)}
              </button>
            ))}

            {/* Blocked time */}
            {view.off.map((b, i) => (
              <div
                key={`off${i}`}
                className="pointer-events-none absolute left-8 right-1 overflow-hidden px-1.5 text-[10px] italic text-muted"
                style={{
                  top: y(Math.max(b.from, view.top)),
                  height: Math.max(12, y(Math.min(b.to, view.bottom)) - y(Math.max(b.from, view.top))),
                  backgroundImage:
                    "repeating-linear-gradient(135deg, transparent 0 4px, rgba(189,143,69,.35) 4px 5px)",
                  borderLeft: "3px solid #bd8f45",
                }}
              >
                {b.reason || "Blocked"}
              </div>
            ))}

            {/* Who's in */}
            {view.placed.map(({ item: a, startMin, endMin, lane, laneCount }) => {
              const left = `calc(2rem + (100% - 2.25rem) * ${lane / laneCount})`;
              const width = `calc((100% - 2.25rem) / ${laneCount} - 2px)`;
              return (
                <div
                  key={a.id}
                  className="pointer-events-none absolute overflow-hidden rounded-sm px-1.5 text-[10px] leading-tight text-[#712B13]"
                  style={{
                    left,
                    width,
                    top: y(startMin) + 1,
                    height: Math.max(12, y(endMin) - y(startMin) - 2),
                    background: "#F5E3DB",
                    borderLeft: "3px solid #BD6B4D",
                  }}
                >
                  {one(a.clients)?.full_name?.split(" ")[0]} · {one(a.services)?.name}
                </div>
              );
            })}

            {/* Her pick, for this service's length. */}
            {sel !== null && ready && (
              <div
                className="pointer-events-none absolute left-8 right-1 rounded border-2 border-[#1D9E75] bg-[#1D9E75]/[0.12]"
                style={{ top: y(sel), height: Math.max(14, (ready.duration / 60) * HOUR_PX) }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
