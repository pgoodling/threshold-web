"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { dateLabel } from "../../lib/format";
import { completeTask } from "../../lib/tasks";
import ClientPicker from "./ClientPicker";

// Her to-do list, and only that.
//
// This tab used to lead with "Reach out" — a computed list of clients with no
// next appointment booked. It was never a task list, which is why sitting above
// "To-do" made no sense, and the Clients tab now answers the same question
// better: Due and Overdue are judged against each client's own rhythm rather
// than a flat week count, and the Overview banner surfaces the urgent ones
// without her going looking at all.
export default function Tasks() {
  return <ToDos />;
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

type ClientOpt = { id: string; full_name: string; phone?: string | null };

const RECURRENCE: [string, string][] = [
  ["none", "One-off"],
  ["weekly", "Weekly"],
  ["biweekly", "Every 2 weeks"],
  ["monthly", "Monthly"],
];

const dayText = (d: string) => dateLabel(`${d}T12:00:00`);

// Follow-ups first: something owed to a person outranks something owed to the
// stockroom.
const GROUPS: {
  key: string;
  label: string;
  blurb: string;
  match: (t: Task) => boolean;
}[] = [
  {
    key: "followups",
    label: "Follow-ups",
    blurb: "someone to get back to",
    match: (t) => !!t.client_id,
  },
  {
    key: "salon",
    label: "Salon",
    blurb: "everything else",
    match: (t) => !t.client_id,
  },
];

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
      .select("id,full_name,phone")
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
    const { error } = await completeTask(supabase, t);
    if (error) setError(error);
    else load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div>
      <h2 className="font-display text-2xl leading-none sm:text-3xl">To-do</h2>
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
            <div className="w-56">
              <ClientPicker
                clients={clients}
                value={clientId}
                onChange={setClientId}
                label="Client (optional)"
                placeholder="Leave blank, or start typing…"
              />
            </div>
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
              className="rounded-md bg-accent px-6 py-3 text-white transition hover:bg-accent-dark"
            >
              Add
            </button>
          </form>

          {error && <ErrorNote>{error}</ErrorNote>}

          {loading && <p className="mt-4 text-muted">Loading…</p>}
          {!loading && tasks.length === 0 && (
            <p className="mt-4 text-sm text-muted">Nothing on the list.</p>
          )}

          {/* Two groups, off client_id, with no category column behind them.
              A task either belongs to a person or it doesn't, and those two
              behave differently: one wants a name beside it and lives on her
              card, the other is a shopping list. A type field would ask her to
              answer a question the data already answers. */}
          {GROUPS.map(({ key, label, blurb, match }) => {
            const items = tasks.filter(match);
            if (items.length === 0) return null;
            return (
              <section key={key} className="mt-6">
                <div className="mb-2 flex items-baseline gap-2">
                  <h4 className="text-xs uppercase tracking-[0.15em] text-muted">
                    {label}
                  </h4>
                  <span className="text-xs tabular-nums text-muted">
                    {items.length}
                  </span>
                  <span className="text-xs text-muted/70">{blurb}</span>
                </div>
                <div className="overflow-hidden rounded-xl border border-foreground/15 bg-white">
                  {items.map((t, i) => (
                    <div
                      key={t.id}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        i > 0 ? "border-t border-foreground/10" : ""
                      }`}
                    >
                      <button
                        onClick={() => complete(t)}
                        aria-label="Mark done"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-foreground/25 text-xs transition hover:border-accent hover:text-accent"
                      >
                        ✓
                      </button>
                      <span className="min-w-0 flex-1">
                        {t.clients && (
                          <span className="mr-2 font-medium text-accent-dark">
                            {t.clients.full_name}
                          </span>
                        )}
                        {t.title}
                      </span>
                      {t.recurrence !== "none" && (
                        <span className="shrink-0 text-xs text-muted">
                          {RECURRENCE.find(([v]) => v === t.recurrence)?.[1]}
                        </span>
                      )}
                      {(t.start_date || t.due_date) && (
                        <span className="shrink-0 text-sm text-muted">
                          {taskDates(t)}
                        </span>
                      )}
                      <button
                        onClick={() => remove(t.id)}
                        aria-label="Delete"
                        className="shrink-0 text-sm text-muted transition hover:text-accent-dark"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
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
