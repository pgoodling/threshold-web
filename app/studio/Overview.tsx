"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  salonNow,
  salonWallToISO,
  timeLabel,
  statusLabel,
  liveStatus,
  statusBlockColor,
  serviceColors,
  money,
} from "../../lib/format";
import ApptDetailModal from "./ApptDetailModal";

type TodayAppt = {
  id: string;
  starts_at: string;
  status: string;
  paid_cents: number | null;
  clients: { full_name: string } | null;
  services: { name: string } | null;
};

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
        .select("id,starts_at,status,paid_cents,clients(full_name),services(name)")
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
    ]).then(([todayRes, upcomingRes, clientsRes]) => {
      setLoading(false);
      setToday((todayRes.data ?? []) as unknown as TodayAppt[]);
      setUpcomingCount(upcomingRes.count ?? 0);
      setClientCount(clientsRes.count ?? 0);
    });
  }, [tick]);

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

  const hasAttention = lateList.length > 0 || unread > 0;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl sm:text-3xl">
          {greeting()}, Evelyn
        </h1>
        <span className="text-sm text-muted">{dateLabel}</span>
      </div>

      {hasAttention && (
        <div className="mt-5 grid gap-2">
          {lateList.map((a) => (
            <button
              key={a.id}
              onClick={() => setOpenId(a.id)}
              className="flex items-center gap-3 rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-left text-sm text-accent-dark transition hover:bg-accent/10"
            >
              <span className="font-medium">
                {a.clients?.full_name ?? "A client"} is running late
              </span>
              <span className="ml-auto text-xs">
                {timeLabel(a.starts_at)} · {a.services?.name}
              </span>
            </button>
          ))}
          {unread > 0 && (
            <button
              onClick={() => onGoto?.("messages")}
              className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-left text-sm text-accent-dark transition hover:bg-accent/10"
            >
              <span className="font-medium">
                {unread} unread text{unread === 1 ? "" : "s"}
              </span>
              <span className="ml-auto text-xs">Open messages →</span>
            </button>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Today" value={loading ? "—" : String(today.length)} />
        <Stat
          label="Taken today"
          value={loading ? "—" : money(takenToday)}
        />
        <Stat
          label="Next 7 days"
          value={upcomingCount === null ? "—" : String(upcomingCount)}
        />
      </div>

      <h2 className="mt-8 font-display text-lg">Today&apos;s schedule</h2>
      {loading ? (
        <p className="mt-2 text-muted">Loading…</p>
      ) : today.length === 0 ? (
        <p className="mt-2 text-muted">Nothing booked today. Enjoy the breather.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {today.map((a) => {
            const eff = liveStatus(a.status, a.starts_at);
            const sc = statusBlockColor(eff);
            const svc = serviceColors(a.services?.name);
            const stripe = sc ? sc.bg : "#e8e0d6";
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
                style={{ borderLeftColor: stripe, borderLeftWidth: 4 }}
                className="flex items-stretch overflow-hidden rounded-xl border border-foreground/10 bg-white text-left transition hover:border-accent"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                  <span className="w-16 shrink-0 text-sm text-accent">
                    {timeLabel(a.starts_at)}
                  </span>
                  <span className="truncate font-medium">
                    {a.clients?.full_name ?? "—"}
                  </span>
                  {showStatus && (
                    <span
                      className="shrink-0 text-xs"
                      style={{ color: labelColor }}
                    >
                      {statusLabel(eff)}
                    </span>
                  )}
                </span>
                <span
                  className="flex w-28 shrink-0 items-center truncate px-3 text-xs sm:w-40"
                  style={{ background: svc.bg, color: svc.fg }}
                >
                  {a.services?.name}
                </span>
              </button>
            );
          })}
        </div>
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
