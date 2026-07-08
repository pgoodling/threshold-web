"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { dateLabel } from "../../lib/format";

export default function Tasks() {
  return (
    <div className="grid gap-10">
      <Reminders />
      <ToDos />
    </div>
  );
}

/* ---------- Auto reminders (computed, no storage) ---------- */

type ApptRow = {
  client_id: string;
  starts_at: string;
  status: string;
  clients: { full_name: string; phone: string | null } | null;
};

type Reminder = {
  clientId: string;
  name: string;
  phone: string | null;
  lastVisit: string;
  weeks: number;
};

const winBackHref = (name: string, phone: string) =>
  `sms:${phone}?&body=${encodeURIComponent(
    `Hi ${name.split(" ")[0]}, it's Evelyn at Threshold! It's been a while — I'd love to get you back in the chair. Want me to save you a spot?`,
  )}`;

function Reminders() {
  const [rows, setRows] = useState<ApptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("appointments")
      .select("client_id,starts_at,status,clients(full_name,phone)")
      .neq("status", "cancelled")
      .then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setRows((data ?? []) as unknown as ApptRow[]);
      });
  }, []);

  const reminders = useMemo(() => {
    const now = Date.now();
    const byClient = new Map<
      string,
      { name: string; phone: string | null; lastVisit: number | null; hasUpcoming: boolean }
    >();
    for (const r of rows) {
      const t = new Date(r.starts_at).getTime();
      const e =
        byClient.get(r.client_id) ??
        {
          name: r.clients?.full_name ?? "Unknown",
          phone: r.clients?.phone ?? null,
          lastVisit: null as number | null,
          hasUpcoming: false,
        };
      if (t >= now) e.hasUpcoming = true;
      else if (r.status !== "no_show" && (e.lastVisit === null || t > e.lastVisit))
        e.lastVisit = t;
      byClient.set(r.client_id, e);
    }
    const out: Reminder[] = [];
    for (const [clientId, e] of byClient) {
      if (e.hasUpcoming || e.lastVisit === null) continue;
      out.push({
        clientId,
        name: e.name,
        phone: e.phone,
        lastVisit: new Date(e.lastVisit).toISOString(),
        weeks: Math.round((now - e.lastVisit) / (7 * 86400000)),
      });
    }
    return out.sort((a, b) => b.weeks - a.weeks);
  }, [rows]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg">Reach out</h3>
        {!loading && (
          <span className="text-sm text-muted">{reminders.length} to follow up</span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Clients with no next appointment booked. Overdue ones first.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}
      {loading ? (
        <p className="mt-4 text-muted">Loading…</p>
      ) : reminders.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Everyone&apos;s got a next visit booked. Nice.
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {reminders.map((r) => {
            const lapsed = r.weeks >= 8;
            return (
              <div
                key={r.clientId}
                className={`flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3 ${
                  lapsed ? "border-accent/40" : "border-foreground/10"
                }`}
              >
                <span className="font-medium">{r.name}</span>
                <span className="text-sm text-muted">
                  last visit {r.weeks} wk{r.weeks === 1 ? "" : "s"} ago
                  {lapsed && (
                    <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent-dark">
                      lapsed
                    </span>
                  )}
                </span>
                {r.phone && (
                  <div className="ml-auto flex gap-2 text-xs">
                    <a
                      href={`tel:${r.phone}`}
                      className="rounded-full border border-foreground/15 px-3 py-1 hover:border-accent hover:text-accent"
                    >
                      Call
                    </a>
                    <a
                      href={winBackHref(r.name, r.phone)}
                      className="rounded-full bg-accent px-3 py-1 text-white hover:bg-accent-dark"
                    >
                      Text
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Manual to-dos (tasks table) ---------- */

type Task = {
  id: string;
  title: string;
  due_date: string | null;
  recurrence: string;
  done: boolean;
};

const RECURRENCE: [string, string][] = [
  ["none", "One-off"],
  ["weekly", "Weekly"],
  ["biweekly", "Every 2 weeks"],
  ["monthly", "Monthly"],
];

function nextDue(from: string | null, recurrence: string): string | null {
  const base = from ? new Date(`${from}T12:00:00`) : new Date();
  if (recurrence === "weekly") base.setDate(base.getDate() + 7);
  else if (recurrence === "biweekly") base.setDate(base.getDate() + 14);
  else if (recurrence === "monthly") base.setMonth(base.getMonth() + 1);
  else return null;
  return base.toISOString().slice(0, 10);
}

function ToDos() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [recurrence, setRecurrence] = useState("none");

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("tasks")
      .select("id,title,due_date,recurrence,done")
      .eq("done", false)
      .order("due_date", { nullsFirst: false })
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          const m = error.message.toLowerCase();
          if (
            error.code === "PGRST205" ||
            m.includes("does not exist") ||
            m.includes("schema cache") ||
            m.includes("could not find the table")
          )
            setNeedsMigration(true);
          else setError(error.message);
        } else setTasks((data ?? []) as Task[]);
      });
  }, []);

  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      due_date: due || null,
      recurrence,
    });
    if (error) setError(error.message);
    else {
      setTitle("");
      setDue("");
      setRecurrence("none");
      load();
    }
  }

  async function complete(t: Task) {
    // Recurring: spin up the next occurrence before marking this done.
    if (t.recurrence !== "none") {
      const nd = nextDue(t.due_date, t.recurrence);
      await supabase
        .from("tasks")
        .insert({ title: t.title, due_date: nd, recurrence: t.recurrence });
    }
    const { error } = await supabase
      .from("tasks")
      .update({ done: true, done_at: new Date().toISOString() })
      .eq("id", t.id);
    if (error) setError(error.message);
    else load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div>
      <h3 className="font-display text-lg">To-do</h3>
      {needsMigration ? (
        <p className="mt-2 rounded-xl border border-foreground/10 bg-white px-4 py-3 text-sm text-muted">
          Run migration <code>0005_tasks.sql</code> to enable your to-do list.
        </p>
      ) : (
        <>
          <form
            onSubmit={add}
            className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-foreground/10 bg-white p-4"
          >
            <label className="block flex-1">
              <span className="mb-1 block text-sm">Task</span>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Restock developer, order toner…"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm">Due</span>
              <input
                type="date"
                className="input w-auto"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm">Repeat</span>
              <select
                className="input w-auto"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
              >
                {RECURRENCE.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-accent px-6 py-3 text-white transition hover:bg-accent-dark"
            >
              Add
            </button>
          </form>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="mt-4 grid gap-2">
            {loading && <p className="text-muted">Loading…</p>}
            {!loading && tasks.length === 0 && (
              <p className="text-sm text-muted">Nothing on the list.</p>
            )}
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-white px-4 py-3"
              >
                <button
                  onClick={() => complete(t)}
                  aria-label="Mark done"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-foreground/25 text-xs hover:border-accent hover:text-accent"
                >
                  ✓
                </button>
                <span className="flex-1">{t.title}</span>
                {t.recurrence !== "none" && (
                  <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-muted">
                    {RECURRENCE.find(([v]) => v === t.recurrence)?.[1]}
                  </span>
                )}
                {t.due_date && (
                  <span className="text-sm text-muted">{dateLabel(`${t.due_date}T12:00:00`)}</span>
                )}
                <button
                  onClick={() => remove(t.id)}
                  className="text-sm text-muted hover:text-accent-dark"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}
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
