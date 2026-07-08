"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { salonNow, salonWallToISO, timeLabel } from "../../lib/format";
import ApptDetailModal from "./ApptDetailModal";

type TodayAppt = {
  id: string;
  starts_at: string;
  status: string;
  clients: { full_name: string } | null;
  services: { name: string } | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

export default function Overview({
  onOpenClient,
}: {
  onOpenClient?: (clientId: string) => void;
}) {
  const [today, setToday] = useState<TodayAppt[]>([]);
  const [upcomingCount, setUpcomingCount] = useState<number | null>(null);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const n = salonNow();
    const dayStart = salonWallToISO(`${n.year}-${pad(n.month + 1)}-${pad(n.day)}T00:00`);
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
        .select("id,starts_at,status,clients(full_name),services(name)")
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
    ]).then(([todayRes, weekRes, clientsRes]) => {
      setLoading(false);
      setToday((todayRes.data ?? []) as unknown as TodayAppt[]);
      setUpcomingCount(weekRes.count ?? 0);
      setClientCount(clientsRes.count ?? 0);
    });
  }, [tick]);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Today" value={loading ? "—" : String(today.length)} />
        <Stat
          label="Next 7 days"
          value={upcomingCount === null ? "—" : String(upcomingCount)}
        />
        <Stat
          label="Clients"
          value={clientCount === null ? "—" : String(clientCount)}
        />
      </div>

      <h3 className="mt-8 font-display text-lg">Today&apos;s schedule</h3>
      {loading ? (
        <p className="mt-2 text-muted">Loading…</p>
      ) : today.length === 0 ? (
        <p className="mt-2 text-muted">Nothing booked today. Enjoy the breather.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {today.map((a) => (
            <button
              key={a.id}
              onClick={() => setOpenId(a.id)}
              className="flex w-full items-center gap-4 rounded-xl border border-foreground/10 bg-white px-4 py-3 text-left transition hover:border-accent"
            >
              <span className="w-20 shrink-0 text-sm text-accent">
                {timeLabel(a.starts_at)}
              </span>
              <span className="font-medium">{a.clients?.full_name ?? "—"}</span>
              <span className="ml-auto text-sm text-muted">
                {a.services?.name}
              </span>
            </button>
          ))}
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
    <div className="rounded-2xl border border-foreground/10 bg-white p-5 text-center">
      <div className="font-display text-3xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted">
        {label}
      </div>
    </div>
  );
}
