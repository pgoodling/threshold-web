"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  salonWallToISO,
  dayKey,
  timeLabel,
  salonNow,
  statusBlockColor,
  liveStatus,
  serviceColors,
} from "../../lib/format";
import ApptDetailModal, { RebookForm } from "./ApptDetailModal";
import { saveClient } from "./Clients";

type Appt = {
  id: string;
  client_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  start_minutes: number | null; // per-appointment override; null = use service
  process_minutes: number | null;
  finish_minutes: number | null;
  block_processing: boolean | null;
  clients: { full_name: string; phone: string | null; email: string | null } | null;
  services: {
    name: string;
    duration_minutes: number;
    start_minutes: number | null;
    process_minutes: number | null;
    finish_minutes: number | null;
  } | null;
};

// The processing gap, in minutes from the appointment start, or null when she's
// busy the whole way through (no gap, or she's keeping it for herself).
function gapOf(a: Appt): { from: number; to: number } | null {
  if (a.block_processing) return null;
  const start = a.start_minutes ?? a.services?.start_minutes ?? 0;
  const process = a.process_minutes ?? a.services?.process_minutes ?? 0;
  if (process <= 0 || start <= 0) return null;
  return { from: start, to: start + process };
}

// Appointments can now legitimately overlap — that's the whole point of
// processing time — so they need side-by-side lanes or the client filling a gap
// renders hidden underneath the colour client. Greedy first-fit: one lane per
// concurrent appointment, widened across the whole day for simplicity (she's
// one stylist, so this is 1 or 2 in practice).
function layoutLanes<T extends { starts_at: string; ends_at: string }>(items: T[]) {
  const laneEnds: number[] = [];
  const placed = items.map((a) => {
    const s = salonMinutes(a.starts_at);
    const e = salonMinutes(a.ends_at);
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) {
      laneEnds.push(e);
      lane = laneEnds.length - 1;
    } else {
      laneEnds[lane] = e;
    }
    return { item: a, startMin: s, endMin: e, lane };
  });
  return { placed, laneCount: Math.max(1, laneEnds.length) };
}

type View = "month" | "week" | "day";

const HOUR_START = 8; // 8 AM
const HOUR_END = 20; // 8 PM
const HOUR_PX = 52;
const GRID_TOP_MIN = HOUR_START * 60;
const GRID_HEIGHT = (HOUR_END - HOUR_START) * HOUR_PX;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// pure date math on YYYY-MM-DD (UTC to avoid tz drift)
function parseKey(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return { y, m: m - 1, d };
}
function addDays(k: string, n: number) {
  const { y, m, d } = parseKey(k);
  const dt = new Date(Date.UTC(y, m, d + n));
  return key(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}
function dow(k: string) {
  const { y, m, d } = parseKey(k);
  return new Date(Date.UTC(y, m, d)).getUTCDay();
}
function weekStart(k: string) {
  return addDays(k, -dow(k));
}

// minutes since midnight in the salon timezone
function salonMinutes(iso: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === "hour")!.value);
  const m = Number(p.find((x) => x.type === "minute")!.value);
  return h * 60 + m;
}

const catColors = serviceColors;

const hourLabel = (h: number) =>
  h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`;

export default function Calendar({
  onOpenClient,
}: {
  onOpenClient?: (clientId: string) => void;
}) {
  const now = useMemo(salonNow, []);
  const todayKey = key(now.year, now.month, now.day);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(todayKey);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [selected, setSelected] = useState<Appt | null>(null);
  // What the new-appointment panel should start from. `time` is "" when only the
  // day is known (the "+ New" button) and set when she clicked a slot.
  const [newAppt, setNewAppt] = useState<{ date: string; time: string } | null>(
    null,
  );

  // Visible date range for the current view.
  const range = useMemo(() => {
    if (view === "day") return { start: anchor, days: 1 };
    if (view === "week") return { start: weekStart(anchor), days: 7 };
    const { y, m } = parseKey(anchor);
    return { start: weekStart(key(y, m, 1)), days: 42 };
  }, [view, anchor]);

  const load = useCallback(() => {
    const fromISO = salonWallToISO(`${range.start}T00:00`);
    const toISO = salonWallToISO(`${addDays(range.start, range.days)}T00:00`);
    supabase
      .from("appointments")
      .select(
        "id,client_id,starts_at,ends_at,status,notes,start_minutes,process_minutes,finish_minutes,block_processing,clients(full_name,phone,email),services(name,duration_minutes,start_minutes,process_minutes,finish_minutes)",
      )
      .gte("starts_at", fromISO)
      .lt("starts_at", toISO)
      .neq("status", "cancelled")
      .order("starts_at")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setAppts((data ?? []) as unknown as Appt[]);
      });
  }, [range.start, range.days]);

  useEffect(load, [load]);

  // Drag-and-drop landing: keep the appointment's length and just move its
  // start. The database's overlap constraint is the referee — if she drops onto
  // something, the update fails and `load()` snaps the block back where it was.
  const moveAppt = useCallback(
    async (a: Appt, day: string, startMin: number) => {
      const durMs =
        new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime();
      const startsISO = salonWallToISO(`${day}T${hhmm(startMin)}`);
      const endsISO = new Date(
        new Date(startsISO).getTime() + durMs,
      ).toISOString();
      setError(null);
      const { error } = await supabase
        .from("appointments")
        .update({ starts_at: startsISO, ends_at: endsISO })
        .eq("id", a.id);
      if (error)
        setError(
          error.message.includes("overlap") ||
            error.message.includes("exclusion")
            ? "That time overlaps another appointment — nothing was moved."
            : error.message,
        );
      load();
    },
    [load],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of appts) {
      const k = dayKey(a.starts_at);
      (m.get(k) ?? m.set(k, []).get(k)!).push(a);
    }
    return m;
  }, [appts]);

  function shift(dir: number) {
    setSelected(null);
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else {
      const { y, m } = parseKey(anchor);
      const dt = new Date(Date.UTC(y, m + dir, 1));
      setAnchor(key(dt.getUTCFullYear(), dt.getUTCMonth(), 1));
    }
  }

  const title = useMemo(() => {
    const { y, m, d } = parseKey(anchor);
    if (view === "month")
      return new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(new Date(y, m, 1));
    if (view === "day")
      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date(y, m, d));
    const ws = parseKey(weekStart(anchor));
    const we = parseKey(addDays(weekStart(anchor), 6));
    const f = (o: { y: number; m: number; d: number }, opt: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-US", opt).format(new Date(o.y, o.m, o.d));
    return `${f(ws, { month: "short", day: "numeric" })} – ${f(we, { month: "short", day: "numeric" })}`;
  }, [anchor, view]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shift(-1)}
            aria-label="Previous"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground/15 hover:border-accent"
          >
            ‹
          </button>
          <span className="min-w-[9rem] text-center font-display text-lg">
            {title}
          </span>
          <button
            onClick={() => shift(1)}
            aria-label="Next"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-foreground/15 hover:border-accent"
          >
            ›
          </button>
          <button
            onClick={() => {
              setAnchor(todayKey);
              setSelectedDay(todayKey);
            }}
            className="ml-1 rounded-full border border-foreground/15 px-3 py-1 text-xs hover:border-accent"
          >
            Today
          </button>
          <button
            onClick={() => {
              setSelected(null);
              // Whichever day she's looking at comes along; she fills in the
              // time. In month view that's the day she last selected.
              setNewAppt({
                date: view === "month" ? selectedDay : anchor,
                time: "",
              });
            }}
            className="ml-1 rounded-full bg-accent px-3 py-1 text-xs text-white transition hover:bg-accent-dark"
          >
            + New
          </button>
        </div>
        <div className="flex rounded-full border border-foreground/15 p-0.5 text-sm">
          {(["month", "week", "day"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1 capitalize transition ${
                view === v ? "bg-accent text-white" : "text-muted hover:text-accent"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
          {error}
        </p>
      )}

      <div className="mt-5">
        {view === "month" && (
          <MonthView
            anchor={anchor}
            todayKey={todayKey}
            byDay={byDay}
            selectedDay={selectedDay}
            onSelectDay={(k) => {
              setSelectedDay(k);
              setAnchor(k);
              setView("day");
              setSelected(null);
            }}
          />
        )}
        {view === "week" && (
          <TimeGrid
            days={Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i))}
            todayKey={todayKey}
            byDay={byDay}
            onSelect={setSelected}
            onNewAt={(date, time) => {
              setSelected(null);
              setNewAppt({ date, time });
            }}
            onMove={moveAppt}
          />
        )}
        {view === "day" && (
          <TimeGrid
            days={[anchor]}
            todayKey={todayKey}
            byDay={byDay}
            onSelect={setSelected}
            onNewAt={(date, time) => {
              setSelected(null);
              setNewAppt({ date, time });
            }}
            onMove={moveAppt}
            wide
          />
        )}
      </div>

      {newAppt && (
        <Modal onClose={() => setNewAppt(null)}>
          <NewAppointmentPanel
            date={newAppt.date}
            time={newAppt.time}
            onClose={() => setNewAppt(null)}
            onDone={() => {
              setNewAppt(null);
              load();
            }}
          />
        </Modal>
      )}

      {selected && (
        <ApptDetailModal
          appointmentId={selected.id}
          onClose={() => setSelected(null)}
          onChanged={load}
          onOpenClient={onOpenClient}
        />
      )}
    </div>
  );
}

function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-foreground/40"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function MonthView({
  anchor,
  todayKey,
  byDay,
  selectedDay,
  onSelectDay,
}: {
  anchor: string;
  todayKey: string;
  byDay: Map<string, Appt[]>;
  selectedDay: string;
  onSelectDay: (k: string) => void;
}) {
  const { m } = parseKey(anchor);
  const start = weekStart(key(parseKey(anchor).y, m, 1));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1.5">
        {days.map((k) => {
          const inMonth = parseKey(k).m === m;
          const list = byDay.get(k) ?? [];
          const isToday = k === todayKey;
          const isSel = k === selectedDay;
          return (
            <button
              key={k}
              onClick={() => onSelectDay(k)}
              className={`min-h-[76px] rounded-lg border p-1.5 text-left transition ${
                isSel
                  ? "border-accent"
                  : "border-foreground/10 hover:border-accent/50"
              } ${inMonth ? "bg-white" : "bg-transparent"}`}
            >
              <div
                className={`mb-1 text-xs ${
                  isToday
                    ? "font-medium text-accent"
                    : inMonth
                      ? "text-foreground"
                      : "text-foreground/30"
                }`}
              >
                {parseKey(k).d}
              </div>
              {list.slice(0, 3).map((a) => {
                const c =
                  statusBlockColor(liveStatus(a.status, a.starts_at)) ??
                  catColors(a.services?.name);
                return (
                  <div
                    key={a.id}
                    className="mb-0.5 truncate rounded px-1 py-0.5 text-[11px]"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {timeLabel(a.starts_at).replace(":00", "")}{" "}
                    {a.clients?.full_name?.split(" ")[0]}
                  </div>
                );
              })}
              {list.length > 3 && (
                <div className="text-[11px] text-muted">+{list.length - 3} more</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Clicking empty space in the grid should book at that spot, so the y offset
// has to become a wall-clock time. Snapped to the quarter hour — pixel-exact
// would hand her 10:37.
const SNAP_MIN = 15;
function minutesFromClickY(clientY: number, top: number) {
  const raw = GRID_TOP_MIN + ((clientY - top) / HOUR_PX) * 60;
  const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
  return Math.min(HOUR_END * 60 - SNAP_MIN, Math.max(GRID_TOP_MIN, snapped));
}
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
// 12-hour label for the block she's dragging, matching the rest of the grid.
const clockLabel = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
};

// Press and hold, then slide, to move an appointment to another time the same
// day. Long-press activation (rather than drag-on-touch) is what keeps a normal
// tap working — she taps far more often than she drags.
const LONG_PRESS_MS = 250;
// If the finger travels this far before the timer fires, she meant to scroll.
const DRAG_SLOP_PX = 8;

type DragState = {
  id: string;
  day: string;
  // Where in the block she grabbed it, so it doesn't jump under her finger.
  grabOffsetMin: number;
  durMin: number;
  startMin: number;
};

function TimeGrid({
  days,
  todayKey,
  byDay,
  onSelect,
  onNewAt,
  onMove,
  wide,
}: {
  days: string[];
  todayKey: string;
  byDay: Map<string, Appt[]>;
  onSelect: (a: Appt) => void;
  onNewAt?: (date: string, time: string) => void;
  onMove?: (a: Appt, day: string, startMin: number) => void;
  wide?: boolean;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Refs, not state: these are gesture bookkeeping and must not cause renders.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  };

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: wide ? undefined : days.length * 100 + 56 }}>
        {/* Day headers */}
        <div className="flex">
          <div className="w-14 shrink-0" />
          {days.map((k) => {
            const p = parseKey(k);
            const isToday = k === todayKey;
            return (
              <div
                key={k}
                className={`flex-1 pb-2 text-center text-sm ${
                  isToday ? "font-medium text-accent" : "text-muted"
                }`}
              >
                {WEEKDAYS[dow(k)]} {p.d}
              </div>
            );
          })}
        </div>
        {/* Grid body */}
        <div className="flex">
          <div className="w-14 shrink-0">
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
              <div
                key={i}
                style={{ height: HOUR_PX }}
                className="-translate-y-2 text-right pr-2 text-[11px] text-muted"
              >
                {hourLabel(HOUR_START + i)}
              </div>
            ))}
          </div>
          {days.map((k) => (
            <div
              key={k}
              onClick={(e) => {
                if (!onNewAt) return;
                const top = e.currentTarget.getBoundingClientRect().top;
                onNewAt(k, hhmm(minutesFromClickY(e.clientY, top)));
              }}
              className={`relative flex-1 border-l border-foreground/10 ${
                onNewAt ? "cursor-copy" : ""
              }`}
              style={{ height: GRID_HEIGHT }}
            >
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div
                  key={i}
                  style={{ height: HOUR_PX }}
                  className="border-t border-foreground/10"
                />
              ))}
              {(() => {
                const { placed, laneCount } = layoutLanes(byDay.get(k) ?? []);
                return placed.map(({ item: a, startMin, endMin, lane }) => {
                  // While she's dragging this one, draw it where her finger is
                  // rather than where the database still thinks it lives.
                  const isDragging = drag?.id === a.id;
                  const shownStart = isDragging ? drag.startMin : startMin;
                  const top = Math.max(
                    0,
                    ((shownStart - GRID_TOP_MIN) / 60) * HOUR_PX,
                  );
                  const h = Math.max(22, ((endMin - startMin) / 60) * HOUR_PX);
                  // Checked-in/out + running-late get their own status color;
                  // everything else keeps the service color. No-shows stay dimmed.
                  const c =
                    statusBlockColor(liveStatus(a.status, a.starts_at)) ??
                    catColors(a.services?.name);
                  const dim = a.status === "no_show";
                  const gap = gapOf(a);
                  const lanePct = 100 / laneCount;
                  return (
                    <button
                      key={a.id}
                      onClick={(e) => {
                        // Don't also fire the day column's book-at-this-time.
                        e.stopPropagation();
                        // A drag ends in a click too; that click isn't a tap.
                        if (dragged.current) {
                          dragged.current = false;
                          return;
                        }
                        onSelect(a);
                      }}
                      onPointerDown={(e) => {
                        if (!onMove) return;
                        const colTop = (
                          e.currentTarget.parentElement as HTMLElement
                        ).getBoundingClientRect().top;
                        const grabMin =
                          minutesFromClickY(e.clientY, colTop) - startMin;
                        pressOrigin.current = { x: e.clientX, y: e.clientY };
                        dragged.current = false;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        pressTimer.current = setTimeout(() => {
                          setDrag({
                            id: a.id,
                            day: k,
                            grabOffsetMin: grabMin,
                            durMin: endMin - startMin,
                            startMin,
                          });
                        }, LONG_PRESS_MS);
                      }}
                      onPointerMove={(e) => {
                        if (!onMove) return;
                        const o = pressOrigin.current;
                        // Still waiting on the long press: a real move this
                        // early means she's scrolling, so give up the gesture.
                        if (!drag && o) {
                          if (
                            Math.abs(e.clientY - o.y) > DRAG_SLOP_PX ||
                            Math.abs(e.clientX - o.x) > DRAG_SLOP_PX
                          ) {
                            clearPress();
                          }
                          return;
                        }
                        if (!drag || drag.id !== a.id) return;
                        dragged.current = true;
                        const colTop = (
                          e.currentTarget.parentElement as HTMLElement
                        ).getBoundingClientRect().top;
                        const raw =
                          minutesFromClickY(e.clientY, colTop) -
                          drag.grabOffsetMin;
                        const snapped =
                          Math.round(raw / SNAP_MIN) * SNAP_MIN;
                        // Keep the whole appointment inside the visible day.
                        const next = Math.min(
                          HOUR_END * 60 - drag.durMin,
                          Math.max(GRID_TOP_MIN, snapped),
                        );
                        if (next !== drag.startMin)
                          setDrag({ ...drag, startMin: next });
                      }}
                      onPointerUp={() => {
                        clearPress();
                        if (drag?.id === a.id) {
                          const moved = drag.startMin !== startMin;
                          const target = drag.startMin;
                          setDrag(null);
                          if (moved) onMove?.(a, k, target);
                          else dragged.current = false;
                        }
                      }}
                      onPointerCancel={() => {
                        clearPress();
                        if (drag?.id === a.id) setDrag(null);
                        dragged.current = false;
                      }}
                      style={{
                        position: "absolute",
                        top,
                        left: `calc(${lane * lanePct}% + 3px)`,
                        width: `calc(${lanePct}% - 6px)`,
                        height: h,
                        background: c.bg,
                        color: c.fg,
                        opacity: dim ? 0.6 : 1,
                        // The browser must not claim this gesture for scrolling,
                        // or the drag never gets its pointermove events. Cost:
                        // a swipe that starts on an appointment won't scroll —
                        // she scrolls from empty grid or the time gutter.
                        touchAction: onMove ? "none" : undefined,
                        zIndex: isDragging ? 20 : undefined,
                        boxShadow: isDragging
                          ? "0 8px 20px rgba(0,0,0,0.28)"
                          : undefined,
                        cursor: onMove ? "grab" : undefined,
                      }}
                      className="overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight"
                    >
                      {/* The processing window: she's free here, so it reads as
                          hollow rather than solid. This is what explains why
                          another appointment is allowed to sit alongside. */}
                      {gap && (
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: (gap.from / 60) * HOUR_PX,
                            height: ((gap.to - gap.from) / 60) * HOUR_PX,
                            background:
                              "repeating-linear-gradient(45deg, rgba(255,255,255,0.62) 0 5px, rgba(255,255,255,0.16) 5px 10px)",
                          }}
                        />
                      )}
                      <div className="relative font-medium">
                        {/* Mid-drag, show where she's about to drop it. */}
                        {isDragging
                          ? clockLabel(drag.startMin)
                          : timeLabel(a.starts_at)}{" "}
                        {a.clients?.full_name?.split(" ")[0]}
                      </div>
                      {h > 34 && (
                        <div className="relative truncate">
                          {a.services?.name}
                        </div>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ClientOpt = { id: string; full_name: string };

// Walk-ins and phone bookings are often people who aren't in the book yet, so
// this panel can either pick an existing client or create one on the spot —
// previously it could only pick, which dead-ended her at the calendar.
function NewAppointmentPanel({
  date,
  time,
  onClose,
  onDone,
}: {
  // Prefilled from wherever she started: a bare "+ New" knows only the day she
  // was looking at, a click into the time grid knows the exact slot.
  date: string;
  time: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientId, setClientId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id,full_name")
      .order("full_name")
      .then(({ data }) => setClients((data ?? []) as ClientOpt[]));
  }, []);

  return (
    <div className="rounded-2xl border border-accent/30 bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg">New appointment</p>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:text-accent"
        >
          ✕
        </button>
      </div>

      {adding ? (
        <NewClientForm
          onCancel={() => setAdding(false)}
          onCreated={(c) => {
            setClients((prev) =>
              [...prev, c].sort((a, b) => a.full_name.localeCompare(b.full_name)),
            );
            setClientId(c.id);
            setAdding(false);
          }}
        />
      ) : (
        <>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm">Client</span>
            <select
              className="input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 text-sm text-accent hover:text-accent-dark"
          >
            + Add a new client
          </button>
        </>
      )}

      {clientId && !adding && (
        <RebookForm
          clientId={clientId}
          heading="When?"
          defaultDate={date}
          defaultTime={time}
          onDone={onDone}
          onCancel={onClose}
        />
      )}
    </div>
  );
}

// Deliberately shorter than the full client form in Clients.tsx — she's in the
// middle of booking someone, so this asks only what a booking needs. The rest
// of the file (formula, birthday, notes) can be filled in later from Clients.
function NewClientForm({
  onCreated,
  onCancel,
}: {
  onCreated: (c: ClientOpt) => void;
  onCancel: () => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!first.trim() || !last.trim() || !phone.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await saveClient("insert", {
      full_name: `${first.trim()} ${last.trim()}`,
      phone: phone.trim(),
      email: email.trim() || null,
    });
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? "Couldn't add that client.");
      return;
    }
    const row = data as { id: string; full_name: string };
    onCreated({ id: row.id, full_name: row.full_name });
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3">
      <div className="flex flex-wrap gap-3">
        <label className="block flex-1">
          <span className="mb-1 block text-sm">
            First name <span className="text-accent">*</span>
          </span>
          <input
            className="input"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            required
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-sm">
            Last name <span className="text-accent">*</span>
          </span>
          <input
            className="input"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            required
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="block flex-1">
          <span className="mb-1 block text-sm">
            Phone <span className="text-accent">*</span>
          </span>
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-sm">Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      </div>
      {error && <p className="text-sm text-accent-dark">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add client"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted hover:text-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

