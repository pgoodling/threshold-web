"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import Overview from "./Overview";
import Tasks from "./Tasks";
import Calendar from "./Calendar";
import Clients from "./Clients";
import Services from "./Services";
import Reports from "./Reports";
import Messages from "./Messages";
import ApptDetailModal from "./ApptDetailModal";
import {
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Calendar as CalendarIcon,
  List as ListIcon,
  Users,
  Scissors,
  BarChart3,
  Clock,
  CalendarOff,
  Menu,
  X,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { salonWallToISO, dayKey, dateLabel, timeLabel } from "../../lib/format";

const TZ = "America/New_York";
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const whenLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

export default function StudioPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <Shell>
        <p className="text-muted">Loading…</p>
      </Shell>
    );
  }

  return session ? <Dashboard /> : <Login />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <header className="border-b border-foreground/10 bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/" aria-label="Threshold home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/threshold-logos/threshold-wordmark-terracotta-transparent.svg"
              alt="Threshold — Studio by Evelyn"
              className="h-10 w-auto"
            />
          </a>
          <span className="text-sm text-muted">Studio</span>
        </nav>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-10">{children}</div>
    </main>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <Shell>
      <div className="mx-auto max-w-sm">
        <h1 className="font-display text-3xl">Studio sign in</h1>
        <p className="mt-2 text-muted">Evelyn&apos;s dashboard.</p>
        <form onSubmit={submit} className="mt-8 grid gap-4">
          <label className="block">
            <span className="mb-1 block text-sm">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-accent px-8 py-3 text-white transition hover:bg-accent-dark disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </Shell>
  );
}

type Tab =
  | "overview"
  | "tasks"
  | "messages"
  | "calendar"
  | "appointments"
  | "clients"
  | "services"
  | "reports"
  | "hours"
  | "timeoff";

const TABS: [Tab, string, LucideIcon][] = [
  ["overview", "Overview", LayoutDashboard],
  ["tasks", "Tasks", ListChecks],
  ["messages", "Messages", MessageSquare],
  ["calendar", "Calendar", CalendarIcon],
  ["appointments", "List", ListIcon],
  ["clients", "Clients", Users],
  ["services", "Services", Scissors],
  ["reports", "Reports", BarChart3],
  ["hours", "Hours", Clock],
  ["timeoff", "Time off", CalendarOff],
];

function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingClient, setPendingClient] = useState<string | null>(null);

  // Count of unread incoming texts, for the Messages tab badge. Refreshes on
  // tab change and every minute.
  useEffect(() => {
    let active = true;
    const loadUnread = () =>
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .is("read_at", null)
        .then(({ count }) => {
          if (active) setUnread(count ?? 0);
        });
    loadUnread();
    const t = setInterval(loadUnread, 60000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [tab]);
  const goToClient = (id: string) => {
    setPendingClient(id);
    setTab("clients");
  };
  const select = (key: Tab) => {
    setTab(key);
    setMenuOpen(false);
  };
  return (
    <div className="min-h-screen bg-background sm:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-foreground/10 bg-[#f4ede5] p-4 sm:flex">
        <a href="/" aria-label="Threshold home" className="mb-6 block px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/threshold-logos/threshold-wordmark-terracotta-transparent.svg"
            alt="Threshold — Studio by Evelyn"
            className="h-8 w-auto"
          />
        </a>
        <nav className="flex flex-col gap-0.5">
          {TABS.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                tab === key
                  ? "bg-accent/15 font-medium text-accent-dark"
                  : "text-muted hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="flex-1 text-left">{label}</span>
              {key === "messages" && unread > 0 && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </nav>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition hover:text-accent"
        >
          <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </button>
      </aside>

      {/* Mobile top bar + slide-down menu */}
      <div className="relative sm:hidden">
        <div className="flex items-center justify-between border-b border-foreground/10 bg-background/90 px-5 py-3 backdrop-blur">
          <a href="/" aria-label="Threshold home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/threshold-logos/threshold-wordmark-terracotta-transparent.svg"
              alt="Threshold — Studio by Evelyn"
              className="h-8 w-auto"
            />
          </a>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label="Menu"
            className="relative flex h-9 w-9 items-center justify-center text-foreground"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
            {unread > 0 && !menuOpen && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />
            )}
          </button>
        </div>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute left-0 right-0 z-20 overflow-hidden border-b border-foreground/10 bg-white shadow-lg">
              {TABS.map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => select(key)}
                  className={`flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition ${
                    tab === key
                      ? "bg-accent/10 font-medium text-accent-dark"
                      : "text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  {key === "messages" && unread > 0 && (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">
                      {unread}
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  supabase.auth.signOut();
                }}
                className="flex w-full items-center gap-3 border-t border-foreground/10 px-5 py-3 text-left text-sm text-muted"
              >
                <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      {/* Main content */}
      <main className="min-w-0 flex-1 px-5 py-6 sm:px-10 sm:py-10">
        <div className="mx-auto max-w-4xl">
          {tab === "overview" && (
            <Overview
              onOpenClient={goToClient}
              onGoto={(t) => setTab(t as Tab)}
              unread={unread}
            />
          )}
          {tab === "tasks" && <Tasks />}
          {tab === "messages" && <Messages />}
          {tab === "calendar" && <Calendar onOpenClient={goToClient} />}
          {tab === "appointments" && <Appointments onOpenClient={goToClient} />}
          {tab === "clients" && (
            <Clients
              initialClientId={pendingClient}
              onOpened={() => setPendingClient(null)}
            />
          )}
          {tab === "services" && <Services />}
          {tab === "reports" && <Reports />}
          {tab === "hours" && <Hours />}
          {tab === "timeoff" && <TimeOff />}
        </div>
      </main>
    </div>
  );
}

type Appt = {
  id: string;
  starts_at: string;
  clients: { full_name: string } | null;
  services: { name: string } | null;
};

function Appointments({
  onOpenClient,
}: {
  onOpenClient?: (clientId: string) => void;
}) {
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("appointments")
      .select("id,starts_at,clients(full_name),services(name)")
      .gte("starts_at", new Date().toISOString())
      .neq("status", "cancelled")
      .order("starts_at")
      .then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setAppts((data ?? []) as unknown as Appt[]);
      });
  }, []);

  useEffect(load, [load]);

  if (loading) return <p className="text-muted">Loading appointments…</p>;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (appts.length === 0)
    return <p className="text-muted">No upcoming appointments.</p>;

  return (
    <div className="grid gap-2">
      {appts.map((a) => (
        <button
          key={a.id}
          onClick={() => setOpenId(a.id)}
          className="flex w-full flex-wrap items-baseline justify-between gap-2 rounded-xl border border-foreground/10 bg-white px-4 py-3 text-left transition hover:border-accent"
        >
          <span className="font-medium">
            {a.clients?.full_name ?? "Unknown"}
            <span className="ml-2 text-sm font-normal text-muted">
              {a.services?.name}
            </span>
          </span>
          <span className="text-sm text-accent">{whenLabel(a.starts_at)}</span>
        </button>
      ))}
      {openId && (
        <ApptDetailModal
          appointmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
          onOpenClient={onOpenClient}
        />
      )}
    </div>
  );
}

type DayRow = { open: boolean; start: string; end: string };

function Hours() {
  const [rows, setRows] = useState<DayRow[]>(
    WEEKDAYS.map(() => ({ open: false, start: "09:00", end: "17:00" })),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("availability_rules")
      .select("weekday,start_time,end_time")
      .eq("active", true)
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          setError(error.message);
          return;
        }
        const next = WEEKDAYS.map(() => ({
          open: false,
          start: "09:00",
          end: "17:00",
        }));
        for (const r of data ?? []) {
          next[r.weekday] = {
            open: true,
            start: (r.start_time as string).slice(0, 5),
            end: (r.end_time as string).slice(0, 5),
          };
        }
        setRows(next);
      });
  }, []);

  function update(i: number, patch: Partial<DayRow>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    // Replace the whole weekly schedule with the current rows.
    const del = await supabase
      .from("availability_rules")
      .delete()
      .gte("weekday", 0);
    if (del.error) {
      setSaving(false);
      setError(del.error.message);
      return;
    }
    const toInsert = rows
      .map((r, weekday) => ({ ...r, weekday }))
      .filter((r) => r.open)
      .map((r) => ({
        weekday: r.weekday,
        start_time: r.start,
        end_time: r.end,
      }));
    if (toInsert.length) {
      const ins = await supabase.from("availability_rules").insert(toInsert);
      if (ins.error) {
        setSaving(false);
        setError(ins.error.message);
        return;
      }
    }
    setSaving(false);
    setMsg("Hours saved.");
  }

  if (loading) return <p className="text-muted">Loading hours…</p>;

  return (
    <div>
      <p className="text-muted">
        Set your weekly working hours. Clients can only book inside these times.
      </p>
      <div className="mt-6 grid gap-2">
        {rows.map((r, i) => (
          <div
            key={WEEKDAYS[i]}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 bg-white px-4 py-3"
          >
            <label className="flex w-32 items-center gap-2">
              <input
                type="checkbox"
                checked={r.open}
                onChange={(e) => update(i, { open: e.target.checked })}
              />
              <span>{WEEKDAYS[i]}</span>
            </label>
            {r.open ? (
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="time"
                  value={r.start}
                  onChange={(e) => update(i, { start: e.target.value })}
                  className="input w-auto"
                />
                <span className="text-muted">to</span>
                <input
                  type="time"
                  value={r.end}
                  onChange={(e) => update(i, { end: e.target.value })}
                  className="input w-auto"
                />
              </div>
            ) : (
              <span className="text-sm text-muted">Closed</span>
            )}
          </div>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-accent px-8 py-3 text-white transition hover:bg-accent-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save hours"}
        </button>
        {msg && <span className="text-sm text-accent">{msg}</span>}
      </div>
    </div>
  );
}

type Block = { id: string; starts_at: string; ends_at: string; reason: string | null };

function formatBlock(b: Block) {
  const sameDay = dayKey(b.starts_at) === dayKey(b.ends_at);
  if (!sameDay) return `${dateLabel(b.starts_at)} – ${dateLabel(b.ends_at)}`;
  const st = timeLabel(b.starts_at);
  const en = timeLabel(b.ends_at);
  if (st === "12:00 AM" && en === "11:59 PM")
    return `${dateLabel(b.starts_at)} · All day`;
  return `${dateLabel(b.starts_at)} · ${st} – ${en}`;
}

function TimeOff() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [allDay, setAllDay] = useState(true);
  const [reason, setReason] = useState("");
  const multiDay = Boolean(toDate && toDate > fromDate);

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("time_off")
      .select("id,starts_at,ends_at,reason")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at")
      .then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setBlocks((data ?? []) as Block[]);
      });
  }, []);

  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!fromDate) return;
    setError(null);
    const to = toDate && toDate >= fromDate ? toDate : fromDate;
    const fullDays = multiDay || allDay;
    // Interpret wall-clock as salon (Eastern) time regardless of browser tz.
    const startsISO = fullDays
      ? salonWallToISO(`${fromDate}T00:00`)
      : salonWallToISO(`${fromDate}T${start}`);
    const endsISO = fullDays
      ? salonWallToISO(`${to}T23:59`)
      : salonWallToISO(`${fromDate}T${end}`);
    const { error } = await supabase.from("time_off").insert({
      starts_at: startsISO,
      ends_at: endsISO,
      reason: reason.trim() || null,
    });
    if (error) setError(error.message);
    else {
      setFromDate("");
      setToDate("");
      setReason("");
      load();
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("time_off").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div>
      <p className="text-muted">
        Block off a single day or a whole stretch — e.g. closed until
        September. Clients can&apos;t book during blocked dates.
      </p>

      <form
        onSubmit={add}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-foreground/10 bg-white p-5"
      >
        <label className="block">
          <span className="mb-1 block text-sm">From</span>
          <input
            type="date"
            required
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="input w-auto"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">To (optional)</span>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className="input w-auto"
          />
        </label>
        {multiDay ? (
          <span className="pb-3 text-sm text-muted">Full days blocked</span>
        ) : (
          <>
            <label className="flex items-center gap-2 pb-3 text-sm">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              All day
            </label>
            {!allDay && (
              <div className="flex items-center gap-2 pb-1 text-sm">
                <input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="input w-auto"
                />
                <span className="text-muted">to</span>
                <input
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="input w-auto"
                />
              </div>
            )}
          </>
        )}
        <label className="block flex-1">
          <span className="mb-1 block text-sm">Reason (optional)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-accent px-6 py-3 text-white transition hover:bg-accent-dark"
        >
          Add
        </button>
      </form>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-6 grid gap-2">
        {loading && <p className="text-muted">Loading…</p>}
        {!loading && blocks.length === 0 && (
          <p className="text-muted">No time off scheduled.</p>
        )}
        {blocks.map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between rounded-xl border border-foreground/10 bg-white px-4 py-3"
          >
            <span className="text-sm">
              {formatBlock(b)}
              {b.reason && (
                <span className="ml-2 text-muted">· {b.reason}</span>
              )}
            </span>
            <button
              onClick={() => remove(b.id)}
              className="text-sm text-muted hover:text-accent-dark"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
      {children}
    </p>
  );
}
