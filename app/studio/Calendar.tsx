"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { salonWallToISO, dayKey, timeLabel, salonNow } from "../../lib/format";
import ApptDetailModal from "./ApptDetailModal";

type Appt = {
  id: string;
  client_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  clients: { full_name: string; phone: string | null; email: string | null } | null;
  services: { name: string; duration_minutes: number } | null;
};

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

function catColors(name: string | undefined) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("color") || n.includes("highlight"))
    return { bg: "#FAECE7", fg: "#712B13" };
  if (n.includes("cut")) return { bg: "#E1F5EE", fg: "#085041" };
  return { bg: "#FAEEDA", fg: "#633806" };
}

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
  const [newAppt, setNewAppt] = useState(false);

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
        "id,client_id,starts_at,ends_at,status,notes,clients(full_name,phone,email),services(name,duration_minutes)",
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
              setNewAppt(true);
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
          />
        )}
        {view === "day" && (
          <TimeGrid
            days={[anchor]}
            todayKey={todayKey}
            byDay={byDay}
            onSelect={setSelected}
            wide
          />
        )}
      </div>

      {newAppt && (
        <Modal onClose={() => setNewAppt(false)}>
          <NewAppointmentPanel
            onClose={() => setNewAppt(false)}
            onDone={() => {
              setNewAppt(false);
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
                const c = catColors(a.services?.name);
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

function TimeGrid({
  days,
  todayKey,
  byDay,
  onSelect,
  wide,
}: {
  days: string[];
  todayKey: string;
  byDay: Map<string, Appt[]>;
  onSelect: (a: Appt) => void;
  wide?: boolean;
}) {
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
              className="relative flex-1 border-l border-foreground/10"
              style={{ height: GRID_HEIGHT }}
            >
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div
                  key={i}
                  style={{ height: HOUR_PX }}
                  className="border-t border-foreground/10"
                />
              ))}
              {(byDay.get(k) ?? []).map((a) => {
                const startMin = salonMinutes(a.starts_at);
                const endMin = salonMinutes(a.ends_at);
                const top = Math.max(0, ((startMin - GRID_TOP_MIN) / 60) * HOUR_PX);
                const h = Math.max(22, ((endMin - startMin) / 60) * HOUR_PX);
                const c = catColors(a.services?.name);
                const dim = a.status === "no_show" || a.status === "completed";
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelect(a)}
                    style={{
                      position: "absolute",
                      top,
                      left: 3,
                      right: 3,
                      height: h,
                      background: c.bg,
                      color: c.fg,
                      opacity: dim ? 0.6 : 1,
                    }}
                    className="overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight"
                  >
                    <div className="font-medium">
                      {timeLabel(a.starts_at)} {a.clients?.full_name?.split(" ")[0]}
                    </div>
                    {h > 34 && <div className="truncate">{a.services?.name}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type SvcOpt = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
};

function RebookForm({
  clientId,
  onDone,
  onCancel,
}: {
  clientId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [services, setServices] = useState<SvcOpt[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("services")
      .select("id,name,duration_minutes,price_cents")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setServices((data ?? []) as SvcOpt[]));
  }, []);

  async function submit() {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc || !when) return;
    setBusy(true);
    setError(null);
    const startsISO = salonWallToISO(when);
    const endsISO = new Date(
      new Date(startsISO).getTime() + svc.duration_minutes * 60000,
    ).toISOString();
    const { error } = await supabase.from("appointments").insert({
      client_id: clientId,
      service_id: svc.id,
      starts_at: startsISO,
      ends_at: endsISO,
      price_cents: svc.price_cents,
      status: "booked",
    });
    setBusy(false);
    if (error)
      setError(
        error.message.includes("overlap") || error.message.includes("exclusion")
          ? "That time overlaps another appointment."
          : error.message,
      );
    else onDone();
  }

  return (
    <div className="mt-4 grid gap-3">
      <p className="text-sm text-muted">Book their next visit:</p>
      <select
        className="input"
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value)}
      >
        <option value="">Choose a service…</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        className="input w-auto"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />
      {error && <p className="text-sm text-accent-dark">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-60"
        >
          {busy ? "Booking…" : "Book it"}
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-muted hover:text-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type ClientOpt = { id: string; full_name: string };

function NewAppointmentPanel({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientId, setClientId] = useState("");

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
      {clientId && (
        <RebookForm clientId={clientId} onDone={onDone} onCancel={onClose} />
      )}
    </div>
  );
}

