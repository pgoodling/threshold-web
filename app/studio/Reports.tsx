"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { dateLabel, money } from "../../lib/format";

type Row = {
  id: string;
  starts_at: string;
  status: string;
  price_cents: number | null;
  client_id: string;
  service_id: string;
  services: { name: string } | null;
  clients: { full_name: string } | null;
};

type Range = "30" | "90" | "365" | "all";
const RANGES: [Range, string][] = [
  ["30", "30 days"],
  ["90", "90 days"],
  ["365", "12 months"],
  ["all", "All time"],
];

export default function Reports() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("90");

  useEffect(() => {
    supabase
      .from("appointments")
      .select(
        "id,starts_at,status,price_cents,client_id,service_id,services(name),clients(full_name)",
      )
      .order("starts_at", { ascending: false })
      .then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setRows((data ?? []) as unknown as Row[]);
      });
  }, []);

  const inRange = useMemo(() => {
    if (range === "all") return rows;
    const cutoff = Date.now() - Number(range) * 86400000;
    return rows.filter((r) => new Date(r.starts_at).getTime() >= cutoff);
  }, [rows, range]);

  const stats = useMemo(() => {
    const completed = inRange.filter((r) => r.status === "completed");
    const noShow = inRange.filter((r) => r.status === "no_show");
    const revenue = completed.reduce((s, r) => s + (r.price_cents ?? 0), 0);
    const decided = completed.length + noShow.length;
    return {
      revenue,
      completedCount: completed.length,
      avgTicket: completed.length ? Math.round(revenue / completed.length) : 0,
      noShowRate: decided ? Math.round((noShow.length / decided) * 100) : null,
    };
  }, [inRange]);

  const byService = useMemo(() => {
    const m = new Map<
      string,
      { name: string; total: number; completed: number; revenue: number; noShow: number }
    >();
    for (const r of inRange) {
      const key = r.service_id;
      const name = r.services?.name ?? "Unknown";
      const e =
        m.get(key) ?? { name, total: 0, completed: 0, revenue: 0, noShow: 0 };
      e.total += 1;
      if (r.status === "completed") {
        e.completed += 1;
        e.revenue += r.price_cents ?? 0;
      }
      if (r.status === "no_show") e.noShow += 1;
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [inRange]);

  const byClient = useMemo(() => {
    const m = new Map<
      string,
      { name: string; visits: number; spent: number; last: string | null; noShow: number }
    >();
    for (const r of inRange) {
      const key = r.client_id;
      const name = r.clients?.full_name ?? "Unknown";
      const e = m.get(key) ?? { name, visits: 0, spent: 0, last: null, noShow: 0 };
      if (r.status === "completed") {
        e.visits += 1;
        e.spent += r.price_cents ?? 0;
        if (!e.last || new Date(r.starts_at) > new Date(e.last))
          e.last = r.starts_at;
      }
      if (r.status === "no_show") e.noShow += 1;
      m.set(key, e);
    }
    return [...m.values()]
      .filter((c) => c.visits > 0 || c.noShow > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 15);
  }, [inRange]);

  if (loading) return <p className="text-muted">Loading reports…</p>;
  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">Revenue counts completed appointments.</p>
        <div className="flex gap-1 text-xs">
          {RANGES.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`rounded-full border px-3 py-1 transition ${
                range === key
                  ? "border-accent bg-accent text-white"
                  : "border-foreground/15 hover:border-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Revenue" value={money(stats.revenue)} />
        <Stat label="Completed" value={String(stats.completedCount)} />
        <Stat label="Avg ticket" value={money(stats.avgTicket)} />
        <Stat
          label="No-show rate"
          value={stats.noShowRate === null ? "—" : `${stats.noShowRate}%`}
        />
      </div>

      <h3 className="mt-8 font-display text-lg">By service</h3>
      {byService.length === 0 ? (
        <p className="mt-2 text-muted">No data in this range yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4 text-right">Booked</th>
                <th className="py-2 pr-4 text-right">Completed</th>
                <th className="py-2 pr-4 text-right">Revenue</th>
                <th className="py-2 text-right">No-shows</th>
              </tr>
            </thead>
            <tbody>
              {byService.map((s) => (
                <tr key={s.name} className="border-b border-foreground/5">
                  <td className="py-2 pr-4">{s.name}</td>
                  <td className="py-2 pr-4 text-right">{s.total}</td>
                  <td className="py-2 pr-4 text-right">{s.completed}</td>
                  <td className="py-2 pr-4 text-right text-accent">
                    {money(s.revenue)}
                  </td>
                  <td className="py-2 text-right">{s.noShow || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-8 font-display text-lg">Top clients</h3>
      {byClient.length === 0 ? (
        <p className="mt-2 text-muted">No data in this range yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4">Client</th>
                <th className="py-2 pr-4 text-right">Visits</th>
                <th className="py-2 pr-4 text-right">Spent</th>
                <th className="py-2 pr-4 text-right">Last visit</th>
                <th className="py-2 text-right">No-shows</th>
              </tr>
            </thead>
            <tbody>
              {byClient.map((c) => (
                <tr key={c.name} className="border-b border-foreground/5">
                  <td className="py-2 pr-4">{c.name}</td>
                  <td className="py-2 pr-4 text-right">{c.visits}</td>
                  <td className="py-2 pr-4 text-right text-accent">
                    {money(c.spent)}
                  </td>
                  <td className="py-2 pr-4 text-right text-muted">
                    {c.last ? dateLabel(c.last) : "—"}
                  </td>
                  <td className="py-2 text-right">{c.noShow || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-white p-4 text-center">
      <div className="font-display text-2xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted">
        {label}
      </div>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
      {children}
    </p>
  );
}
