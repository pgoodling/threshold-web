"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { dateLabel } from "../../lib/format";

export default function Tasks({
  onOpenClient,
}: {
  onOpenClient?: (clientId: string) => void;
}) {
  return (
    <div className="grid gap-10">
      <Reminders onOpenClient={onOpenClient} />
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

function Reminders({
  onOpenClient,
}: {
  onOpenClient?: (clientId: string) => void;
}) {
  const [rows, setRows] = useState<ApptRow[]>([]);
  const [snoozed, setSnoozed] = useState<Set<string>>(new Set());
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
    // Clients with an open follow-up task are "handled" — drop them off the
    // list until that task is done (added on the client card). Silently ignored
    // if tasks aren't migrated yet.
    supabase
      .from("tasks")
      .select("client_id")
      .eq("done", false)
      .not("client_id", "is", null)
      .then(({ data }) =>
        setSnoozed(
          new Set(
            (data ?? []).map((r) => (r as { client_id: string }).client_id),
          ),
        ),
      );
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
      if (e.hasUpcoming || e.lastVisit === null || snoozed.has(clientId)) continue;
      out.push({
        clientId,
        name: e.name,
        phone: e.phone,
        lastVisit: new Date(e.lastVisit).toISOString(),
        weeks: Math.round((now - e.lastVisit) / (7 * 86400000)),
      });
    }
    return out.sort((a, b) => b.weeks - a.weeks);
  }, [rows, snoozed]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg">Reach out</h3>
        {!loading && (
          <span className="text-sm text-muted">{reminders.length} to follow up</span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Clients with no next appointment booked. Tap one to open their card —
        call, text, add a note, book, or set a follow-up from there.
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
              <button
                key={r.clientId}
                onClick={() => onOpenClient?.(r.clientId)}
                className={`flex w-full flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left transition hover:border-accent ${
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
                <span className="ml-auto text-sm text-muted" aria-hidden="true">
                  Open →
                </span>
              </button>
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
  start_date: string | null;
  due_date: string | null;
  recurrence: string;
  done: boolean;
  client_id: string | null;
  clients: { full_name: string } | null;
};

type ClientOpt = { id: string; full_name: string };

const RECURRENCE: [string, string][] = [
  ["none", "One-off"],
  ["weekly", "Weekly"],
  ["biweekly", "Every 2 weeks"],
  ["monthly", "Monthly"],
];

const dayText = (d: string) => dateLabel(`${d}T12:00:00`);

// Compact date label for a task: a single day, a start→due range, or one side.
function taskDates(t: Task): string {
  if (t.start_date && t.due_date)
    return t.start_date === t.due_date
      ? dayText(t.due_date)
      : `${dayText(t.start_date)} → ${dayText(t.due_date)}`;
  if (t.due_date) return `due ${dayText(t.due_date)}`;
  if (t.start_date) return `from ${dayText(t.start_date)}`;
  return "";
}

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
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationMsg, setMigrationMsg] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [clientId, setClientId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("tasks")
      .select(
        "id,title,start_date,due_date,recurrence,done,client_id,clients(full_name)",
      )
      .eq("done", false)
      .order("due_date", { nullsFirst: false })
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          const m = error.message.toLowerCase();
          const tableMissing =
            error.code === "PGRST205" ||
            m.includes("schema cache") ||
            m.includes("could not find the table") ||
            (m.includes("relation") && m.includes("does not exist"));
          const columnMissing =
            m.includes("start_date") ||
            m.includes("client_id") ||
            (m.includes("column") && m.includes("does not exist"));
          if (tableMissing)
            setMigrationMsg("Run migration 0005_tasks.sql to enable your to-do list.");
          else if (columnMissing)
            setMigrationMsg(
              "Run migration 0008_tasks_client_and_range.sql to enable start dates and client links.",
            );
          else setError(error.message);
        } else setTasks((data ?? []) as unknown as Task[]);
      });
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("id,full_name")
      .order("full_name")
      .then(({ data }) => setClients((data ?? []) as ClientOpt[]));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      start_date: start || null,
      due_date: due || null,
      recurrence,
      client_id: clientId || null,
    });
    if (error) setError(error.message);
    else {
      setTitle("");
      setStart("");
      setDue("");
      setRecurrence("none");
      setClientId("");
      load();
    }
  }

  async function complete(t: Task) {
    // Recurring: spin up the next occurrence before marking this done, carrying
    // the client link and shifting both start + due dates by the interval.
    if (t.recurrence !== "none") {
      await supabase.from("tasks").insert({
        title: t.title,
        start_date: nextDue(t.start_date, t.recurrence),
        due_date: nextDue(t.due_date, t.recurrence),
        recurrence: t.recurrence,
        client_id: t.client_id,
      });
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
      {migrationMsg ? (
        <p className="mt-2 rounded-xl border border-foreground/10 bg-white px-4 py-3 text-sm text-muted">
          {migrationMsg}
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
              <span className="mb-1 block text-sm">Start</span>
              <input
                type="date"
                className="input w-auto"
                value={start}
                max={due || undefined}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm">Due</span>
              <input
                type="date"
                className="input w-auto"
                value={due}
                min={start || undefined}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm">Client (optional)</span>
              <select
                className="input w-auto"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">— none —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
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
                <span className="flex-1">
                  {t.title}
                  {t.clients && (
                    <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent-dark">
                      {t.clients.full_name}
                    </span>
                  )}
                </span>
                {t.recurrence !== "none" && (
                  <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-muted">
                    {RECURRENCE.find(([v]) => v === t.recurrence)?.[1]}
                  </span>
                )}
                {(t.start_date || t.due_date) && (
                  <span className="text-sm text-muted">{taskDates(t)}</span>
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
