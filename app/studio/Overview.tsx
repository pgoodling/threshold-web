"use client";

import { useEffect, useState } from "react";
import { Mic, PhoneMissed } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  salonNow,
  salonWallToISO,
  timeLabel,
  shortWhen,
  statusLabel,
  liveStatus,
  statusBlockColor,
  serviceEdge,
  money,
} from "../../lib/format";
import ApptDetailModal from "./ApptDetailModal";
import OpeningCountdown from "../OpeningCountdown";
import { completeTask } from "../../lib/tasks";

type TodayAppt = {
  id: string;
  starts_at: string;
  status: string;
  paid_cents: number | null;
  clients: { full_name: string } | null;
  services: { name: string } | null;
};

// Something a client sent that she hasn't seen: a text, a voicemail, or a call
// that rang out. Shown by name and opening words on the banner.
type Waiting = {
  id: string;
  body: string;
  created_at: string;
  kind: "sms" | "voicemail" | "missed_call" | null;
  from_number: string | null;
  clients: { full_name: string } | null;
};

// A to-do that has started or is due — today or earlier — and isn't ticked.
// recurrence and client_id ride along so ticking it here can spin up the next
// occurrence exactly as the To-do tab does.
type DueTask = {
  id: string;
  title: string;
  start_date: string | null;
  due_date: string | null;
  recurrence: string | null;
  client_id: string | null;
  clients: { full_name: string } | null;
};

// How many unread messages the banner names individually before collapsing the
// rest into a count. Past a few, the detail stops helping and the banner starts
// burying today's schedule.
const NAMED_UNREAD = 3;

const pad = (n: number) => String(n).padStart(2, "0");
const TZ = "America/New_York";

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Overview({
  onOpenClient,
  onGoto,
  unread = 0,
}: {
  onOpenClient?: (clientId: string) => void;
  onGoto?: (tab: string) => void;
  unread?: number;
}) {
  const [today, setToday] = useState<TodayAppt[]>([]);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [dueTasks, setDueTasks] = useState<DueTask[]>([]);
  const [upcomingCount, setUpcomingCount] = useState<number | null>(null);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Re-render every minute so a passed start time flips to "running late".
  const [, setMinute] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMinute((m) => m + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Today in the salon's own timezone, as YYYY-MM-DD — task dates are plain
  // dates, so comparing them against a UTC clock would flip a day early or late
  // depending on the hour.
  const salonToday = salonNow();
  const todayKey = `${salonToday.year}-${pad(salonToday.month + 1)}-${pad(salonToday.day)}`;

  useEffect(() => {
    const n = salonNow();
    const dayStart = salonWallToISO(
      `${n.year}-${pad(n.month + 1)}-${pad(n.day)}T00:00`,
    );
    const dayEnd = new Date(
      new Date(dayStart).getTime() + 24 * 60 * 60 * 1000,
    ).toISOString();
    const weekEnd = new Date(
      new Date(dayStart).getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const nowISO = new Date().toISOString();

    Promise.all([
      supabase
        .from("appointments")
        .select(
          "id,starts_at,status,paid_cents,clients(full_name),services(name)",
        )
        .gte("starts_at", dayStart)
        .lt("starts_at", dayEnd)
        .neq("status", "cancelled")
        .order("starts_at"),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .gte("starts_at", nowISO)
        .lt("starts_at", weekEnd)
        .neq("status", "cancelled"),
      supabase.from("clients").select("id", { count: "exact", head: true }),
      supabase
        .from("messages")
        .select("id,body,created_at,kind,from_number,clients(full_name)")
        .eq("direction", "inbound")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(NAMED_UNREAD),
      // Anything she meant to do by today and hasn't. A to-do that only exists
      // on its own tab is a to-do she'll miss — it has to come to her.
      supabase
        .from("tasks")
        .select(
          "id,title,start_date,due_date,recurrence,client_id,clients(full_name)",
        )
        .eq("done", false)
        .or(
          `start_date.lte.${todayKey},due_date.lte.${todayKey}`,
        )
        .order("due_date", { nullsFirst: false })
        .limit(NAMED_UNREAD),
    ]).then(([todayRes, upcomingRes, clientsRes, waitingRes, tasksRes]) => {
      setLoading(false);
      setToday((todayRes.data ?? []) as unknown as TodayAppt[]);
      setUpcomingCount(upcomingRes.count ?? 0);
      setClientCount(clientsRes.count ?? 0);
      setWaiting((waitingRes.data ?? []) as unknown as Waiting[]);
      // Silently empty if migration 0005/0008 hasn't run — the banner simply
      // shows no to-dos rather than an error she can't act on.
      setDueTasks((tasksRes.data ?? []) as unknown as DueTask[]);
    });
  }, [tick, todayKey]);

  // Drop it from the list immediately, then reconcile — a tick that appears to
  // do nothing for a second gets tapped twice.
  async function markDone(t: DueTask) {
    setDueTasks((list) => list.filter((x) => x.id !== t.id));
    const { error } = await completeTask(supabase, t);
    if (error) setTick((n) => n + 1);
  }

  const takenToday = today
    .filter((a) => a.status === "checked_out" || a.status === "completed")
    .reduce((s, a) => s + (a.paid_cents ?? 0), 0);
  const lateList = today.filter(
    (a) => liveStatus(a.status, a.starts_at) === "late",
  );
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());

  // `unread` (from the tab badge) and `waiting` refresh on different clocks, so
  // trust either one to open the banner rather than letting a stale count hide
  // messages that are demonstrably there.
  // To-dos deliberately don't open the banner any more — they have their own
  // section below the schedule. This is for people waiting on her.
  const hasAttention =
    lateList.length > 0 || unread > 0 || waiting.length > 0;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl sm:text-3xl">
          {greeting()}, Evelyn
        </h1>
        <span className="text-sm text-muted">{dateLabel}</span>
      </div>

      <OpeningCountdown compact />

      {hasAttention && (
        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            Needs attention
          </p>
          <div className="overflow-hidden rounded-xl border border-accent/30 bg-accent/5">
            {lateList.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setOpenId(a.id)}
                className={`flex w-full items-stretch text-left text-sm text-accent-dark transition hover:bg-accent/10 ${
                  i > 0 ? "border-t border-accent/20" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className="w-1 shrink-0 self-stretch"
                  style={{ background: "#8f3f4a" }}
                />
                <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                  <span className="truncate font-medium">
                    {a.clients?.full_name ?? "A client"} is running late
                  </span>
                  <span className="ml-auto shrink-0 whitespace-nowrap text-xs">
                    {timeLabel(a.starts_at)} · {a.services?.name}
                  </span>
                </span>
              </button>
            ))}
            {/* One row per unread message, not a count. A bare "3 unread" makes
              her open the Messages tab to find out whether it's urgent; the
              name and the first words usually settle that from here. */}
            {waiting.map((m, i) => (
              <button
                key={m.id}
                onClick={() => onGoto?.("messages")}
                className={`flex w-full items-stretch text-left text-sm text-accent-dark transition hover:bg-accent/10 ${
                  i > 0 || lateList.length > 0 ? "border-t border-accent/20" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className="w-1 shrink-0 self-stretch bg-accent"
                />
                <span className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3">
                  {m.kind === "voicemail" && <Mic className="h-4 w-4 shrink-0" />}
                  {m.kind === "missed_call" && (
                    <PhoneMissed className="h-4 w-4 shrink-0" />
                  )}
                  <span className="shrink-0 font-medium">
                    {m.clients?.full_name ?? m.from_number ?? "Unknown number"}
                  </span>
                  <span className="truncate text-xs opacity-80">{m.body}</span>
                  <span className="ml-auto shrink-0 whitespace-nowrap text-xs">
                    {shortWhen(m.created_at)}
                  </span>
                </span>
              </button>
            ))}
            {unread > waiting.length && (
              <button
                onClick={() => onGoto?.("messages")}
                className="w-full border-t border-accent/20 px-5 py-2.5 text-left text-xs text-accent-dark transition hover:bg-accent/10"
              >
                {unread - waiting.length} more unread → open messages
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Today" value={loading ? "—" : String(today.length)} />
        <Stat label="Taken today" value={loading ? "—" : money(takenToday)} />
        <Stat
          label="Next 7 days"
          value={upcomingCount === null ? "—" : String(upcomingCount)}
        />
      </div>

      <h2 className="mt-8 font-display text-lg">Today&apos;s schedule</h2>
      {loading ? (
        <p className="mt-2 text-muted">Loading…</p>
      ) : today.length === 0 ? (
        <p className="mt-2 text-muted">
          Nothing booked today. Enjoy the breather.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white">
          {today.map((a, i) => {
            const eff = liveStatus(a.status, a.starts_at);
            const sc = statusBlockColor(eff);
            const stripe = sc ? sc.bg : "#cfc3b6";
            const showStatus = eff !== "booked" && eff !== "confirmed";
            const labelColor = sc
              ? sc.bg
              : eff === "no_show"
                ? "#99523a"
                : "#6f5c52";
            return (
              <button
                key={a.id}
                onClick={() => setOpenId(a.id)}
                className={`flex w-full items-stretch text-left transition hover:bg-background/60 ${
                  i > 0 ? "border-t border-foreground/10" : ""
                }`}
                style={{
                  // Status on the left edge, service on the right — the same
                  // two signals the calendar carries, so a day reads the same
                  // whichever screen she's on.
                  boxShadow: `inset 4px 0 0 ${stripe}, inset -3px 0 0 ${serviceEdge(a.services?.name)}`,
                }}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-5 pr-4">
                  <span className="w-16 shrink-0 text-sm tabular-nums text-accent">
                    {timeLabel(a.starts_at)}
                  </span>
                  <span className="truncate font-medium">
                    {a.clients?.full_name ?? "—"}
                  </span>
                  {showStatus && (
                    <span
                      className="shrink-0 text-[11px] uppercase tracking-wider"
                      style={{ color: labelColor }}
                    >
                      {statusLabel(eff)}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 truncate pl-2 text-xs text-muted">
                    {a.services?.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Below the schedule, not in the banner above it. Two different kinds of
          thing were sharing one box: someone waiting on her right now, and work
          she planned for herself. The first interrupts the day; the second fits
          around it, so it belongs after she's seen the day. */}
      {dueTasks.length > 0 && (
        <>
          <h2 className="mt-8 font-display text-lg">To-do today</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white">
            {dueTasks.map((t, i) => {
              const overdue = !!t.due_date && t.due_date < todayKey;
              return (
                <div
                  key={t.id}
                  style={{
                    boxShadow: `inset 4px 0 0 ${overdue ? "#8f3f4a" : "#bd8f45"}`,
                  }}
                  className={`flex w-full items-center gap-3 py-3 pl-5 pr-4 text-sm transition hover:bg-background/60 ${
                    i > 0 ? "border-t border-foreground/10" : ""
                  }`}
                >
                  {/* Tick it here rather than making her go to the To-do tab to
                      do the one thing she came here knowing she'd done. */}
                  <button
                    onClick={() => markDone(t)}
                    aria-label={`Mark "${t.title}" done`}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-foreground/25 text-xs transition hover:border-accent hover:text-accent"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => onGoto?.("tasks")}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="truncate font-medium">{t.title}</span>
                    {t.clients?.full_name && (
                      <span className="shrink-0 truncate text-xs text-accent-dark">
                        {t.clients.full_name}
                      </span>
                    )}
                    <span
                      className="ml-auto shrink-0 whitespace-nowrap text-[11px] uppercase tracking-wider"
                      style={{ color: overdue ? "#8f3f4a" : "#bd8f45" }}
                    >
                      {overdue ? "overdue" : "today"}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {openId && (
        <ApptDetailModal
          appointmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => setTick((t) => t + 1)}
          onOpenClient={onOpenClient}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-white p-4 text-center sm:p-5">
      <div className="font-display text-2xl sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted">
        {label}
      </div>
    </div>
  );
}
