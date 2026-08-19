"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  salonWallToISO,
  salonNow,
  whenLabel,
  dateLabel,
  money,
  statusLabel,
  statusBlockColor,
  serviceEdge,
} from "../../lib/format";
import {
  clientState,
  usualGapWeeks,
  stateCaption,
  railColor,
  STATE_LABEL,
  type ClientState,
} from "../../lib/clientState";
import { formulaName } from "../../lib/hair";
import ApptDetailModal from "./ApptDetailModal";
import ClientMessages from "./ClientMessages";
import Rail from "./Rail";
import Button from "./Button";
import ActionStrip, { type Action } from "./ActionStrip";

type Client = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  birthday: string | null; // YYYY-MM-DD
  hair_formula: string | null; // e.g. "9G" — what she mixes
  /** Suppresses Due/Overdue nagging until this date passes. */
  snoozed_until: string | null;
  created_at: string;
};

// "Not yet" without pretending the client isn't overdue.
//
// The old reach-out list hid anyone with an open task, which was a side effect
// rather than a decision — she couldn't say "leave her alone until March"
// without inventing a task. This is explicit and dated, and her underlying
// state is untouched: the snooze hides the nag, not the truth.
function isSnoozed(c: { snoozed_until?: string | null }, todayKey: string) {
  return !!c.snoozed_until && c.snoozed_until > todayKey;
}

// Per-client rollup from her appointment history, used to place her on the
// lifecycle and pick her regrowth + strand color.
type Agg = {
  lastAttended: number | null;
  upcomingCount: number;
  pastCount: number;
  service: string | null; // most recent service, for the default color
  nextStart: number | null;
  /** Every attended visit, for working out her own rhythm. */
  visitTimes: number[];
};

const EMPTY_AGG: Agg = {
  lastAttended: null,
  upcomingCount: 0,
  pastCount: 0,
  service: null,
  nextStart: null,
  visitTimes: [],
};

type View = {
  c: Client;
  agg: Agg;
  state: ClientState;
  weeks: number | null;
  gap: number | null;
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        background: "#f1e7dd",
        color: "#7a4a34",
        fontSize: Math.round(size * 0.34),
      }}
    >
      {initials(name)}
    </span>
  );
}

// The summary strip above the list, doubling as the filter. Ordered by how much
// it wants her attention, not alphabetically — overdue first.
const BOOK_TILES: { key: string; label: string; state: ClientState | null }[] = [
  { key: "all", label: "All", state: null },
  { key: "overdue", label: "Overdue", state: "overdue" },
  { key: "due", label: "Due", state: "due" },
  { key: "fine", label: "Fine", state: "fine" },
  { key: "new", label: "New", state: "new" },
];

function viewFor(c: Client, agg: Agg | undefined): View {
  const a = agg ?? EMPTY_AGG;
  const weeks =
    a.lastAttended != null
      ? (Date.now() - a.lastAttended) / (7 * 86400000)
      : null;
  const gap = usualGapWeeks(a.visitTimes);
  return {
    c,
    agg: a,
    weeks,
    gap,
    state: clientState({
      pastCount: a.pastCount,
      upcomingCount: a.upcomingCount,
      weeksSinceLast: weeks,
      gapWeeks: gap,
    }),
  };
}

export default function Clients({
  initialClientId,
  onOpened,
  cameFrom,
  onGoBack,
}: {
  initialClientId?: string | null;
  onOpened?: () => void;
  /** Where she was when she tapped through — "Messages", "Tasks", "Calendar". */
  cameFrom?: string | null;
  onGoBack?: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [aggs, setAggs] = useState<Map<string, Agg>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selected, setSelected] = useState<Client | null>(null);
  const [adding, setAdding] = useState(false);
  // Today in the salon's timezone, for comparing against plain snooze dates.
  const [todayKey] = useState(() => {
    const n = salonNow();
    const p = (x: number) => String(x).padStart(2, "0");
    return `${n.year}-${p(n.month + 1)}-${p(n.day)}`;
  });

  const load = useCallback(() => {
    setLoading(true);
    // `*` so hair_formula is tolerated even before migration 0009 runs.
    supabase
      .from("clients")
      .select("*")
      .order("full_name")
      .then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setClients((data ?? []) as Client[]);
      });
  }, []);

  useEffect(load, [load]);

  // Roll up appointment history per client for lifecycle + regrowth.
  useEffect(() => {
    supabase
      .from("appointments")
      .select("client_id,starts_at,status,services(name)")
      .neq("status", "cancelled")
      .then(({ data }) => {
        const now = Date.now();
        const m = new Map<string, Agg>();
        const recent = new Map<string, number>();
        for (const r of (data ?? []) as unknown as {
          client_id: string;
          starts_at: string;
          status: string;
          services: { name: string } | null;
        }[]) {
          const t = new Date(r.starts_at).getTime();
          // Fresh visitTimes array per client — spreading EMPTY_AGG would share
          // one array between everyone.
          const e = m.get(r.client_id) ?? { ...EMPTY_AGG, visitTimes: [] };
          if (t >= now) {
            e.upcomingCount += 1;
            if (e.nextStart === null || t < e.nextStart) e.nextStart = t;
          } else if (r.status !== "no_show") {
            e.pastCount += 1;
            e.visitTimes.push(t);
            if (e.lastAttended === null || t > e.lastAttended) e.lastAttended = t;
          }
          if (t > (recent.get(r.client_id) ?? -1)) {
            recent.set(r.client_id, t);
            e.service = r.services?.name ?? e.service;
          }
          m.set(r.client_id, e);
        }
        setAggs(m);
      });
  }, []);

  // Open a specific client when navigated here from an appointment.
  useEffect(() => {
    if (!initialClientId || clients.length === 0) return;
    const c = clients.find((x) => x.id === initialClientId);
    if (c) {
      setSelected(c);
      onOpened?.();
    }
  }, [initialClientId, clients, onOpened]);

  const views = useMemo(
    () => clients.map((c) => viewFor(c, aggs.get(c.id))),
    [clients, aggs],
  );

  // A snoozed client counts as handled for Due and Overdue — that's what the
  // snooze is for — but still counts in All, because she hasn't gone anywhere.
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: views.length };
    for (const v of views) {
      if (
        isSnoozed(v.c, todayKey) &&
        (v.state === "due" || v.state === "overdue")
      )
        continue;
      m[v.state] = (m[v.state] ?? 0) + 1;
    }
    return m;
  }, [views, todayKey]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return views.filter((v) => {
      if (
        (stageFilter === "due" || stageFilter === "overdue") &&
        isSnoozed(v.c, todayKey)
      )
        return false;
      if (stageFilter !== "all" && v.state !== stageFilter) return false;
      if (!s) return true;
      return [v.c.full_name, v.c.email, v.c.phone]
        .filter(Boolean)
        .some((x) => x!.toLowerCase().includes(s));
    });
  }, [views, q, stageFilter, todayKey]);

  if (selected) {
    return (
      <ClientDetail
        client={selected}
        backLabel={cameFrom ?? undefined}
        onBack={() => {
          setSelected(null);
          load();
          // Send her back where she came from, not to a list she never saw.
          if (cameFrom && onGoBack) onGoBack();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl leading-none sm:text-3xl">
            The book
          </h2>
          <p className="mt-2 text-sm text-muted">
            {clients.length} client{clients.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="quiet" onClick={() => setAdding(true)}>
          + Add client
        </Button>
      </div>

      {/* Three jobs, three groups, with air between them: narrow the book,
          find one person, read the book. Rows within each group share a surface
          — it's identical rows as separate cards that read as a pile of
          lozenges, not distinct sections separated by whitespace. */}
      {!loading && views.length > 0 && (
        <div className="mt-5 grid grid-cols-5 overflow-hidden rounded-xl border border-foreground/15 bg-white">
          {BOOK_TILES.map((t) => (
            <button
              key={t.key}
              onClick={() => setStageFilter(t.key)}
              className={`flex items-stretch border-l border-foreground/10 text-left transition first:border-l-0 ${
                stageFilter === t.key ? "bg-accent/5" : "hover:bg-background/60"
              }`}
            >
              {t.state ? (
                <Rail state={t.state} width={3} />
              ) : (
                <span className="w-[3px] shrink-0 self-stretch bg-foreground/15" />
              )}
              <span className="min-w-0 px-2 py-2.5 sm:px-3">
                <span className="block text-lg font-medium leading-none tabular-nums sm:text-xl">
                  {counts[t.key] ?? 0}
                </span>
                <span className="mt-1 block truncate text-[10px] uppercase tracking-wider text-muted">
                  {t.label}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <input
        className="input mt-4"
        placeholder="Search by name, email, or phone…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {adding && (
          <div className="mt-4 rounded-xl border border-foreground/15 bg-white p-5">
            <p className="mb-4 font-medium">New client</p>
            <ClientForm
              initial={{
                full_name: "",
                email: "",
                phone: "",
                birthday: "",
                hair_formula: "",
                notes: "",
              }}
              serviceName={null}
              submitLabel="Add client"
              onCancel={() => setAdding(false)}
              onSubmit={async (vals) => {
                const { error } = await saveClient("insert", vals);
                if (error) {
                  setError(error.message);
                  return false;
                }
                setAdding(false);
                load();
                return true;
              }}
            />
          </div>
        )}

      {error && (
        <p className="mt-4 text-sm text-accent-dark">{error}</p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-foreground/15 bg-white">
        {loading ? (
          <p className="px-4 py-6 text-muted">Loading clients…</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-6 text-muted">
            {clients.length === 0 ? "No clients yet." : "No matches."}
          </p>
        ) : (
          <div>
          {shown.map((v) => {
            const meta =
              v.agg.upcomingCount > 0 && v.agg.nextStart
                ? `next ${dateLabel(new Date(v.agg.nextStart).toISOString())}`
                : v.agg.lastAttended
                  ? "nothing booked"
                  : "no visits yet";
            return (
              <button
                key={v.c.id}
                onClick={() => setSelected(v.c)}
                className="flex w-full items-stretch border-t border-foreground/10 text-left transition first:border-t-0 hover:bg-background/60"
              >
                <Rail
                  state={v.state}
                  color={railColor(v.state, v.weeks, v.gap)}
                  width={5}
                />
                <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                  <Avatar name={v.c.full_name} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {v.c.full_name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] uppercase tracking-wider text-muted">
                      {STATE_LABEL[v.state]}
                      {v.weeks != null && ` · ${Math.round(v.weeks)}w`}
                    </span>
                  </span>
                  <span className="ml-auto whitespace-nowrap pl-2 text-sm text-muted">
                    {meta}
                  </span>
                </span>
              </button>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}

// Resilient write: retries without hair_formula if migration 0009 hasn't run.
// Exported because the calendar's "add a new client" flow writes clients too,
// and the friendly error mapping below is worth having in both places.
export async function saveClient(
  op: "insert" | "update",
  vals: Record<string, unknown>,
  id?: string,
) {
  const run = (payload: Record<string, unknown>) =>
    op === "insert"
      ? supabase.from("clients").insert(payload).select().single()
      : supabase.from("clients").update(payload).eq("id", id!).select().single();
  let res = await run(vals);
  if (res.error && /hair_formula|column/i.test(res.error.message)) {
    const rest = { ...vals };
    delete rest.hair_formula;
    res = await run(rest);
  }
  // Migration 0010 blocks a second row with the same phone + first name, and
  // email is still unique. Raw Postgres index errors mean nothing to Evelyn.
  if (res.error) res.error.message = friendlyClientError(res.error.message);
  return res;
}

function friendlyClientError(message: string) {
  if (/clients_phone_name_idx/.test(message))
    return "Someone with that first name and phone number is already in your clients — open their file instead of adding a second one.";
  if (/clients_email_lower_idx/.test(message))
    return "That email address is already on another client's file.";
  return message;
}

type Visit = {
  id: string;
  starts_at: string;
  status: string;
  paid_cents: number | null;
  price_cents: number | null;
  services: { name: string } | null;
};

function ClientDetail({
  client,
  onBack,
  backLabel,
}: {
  client: Client;
  onBack: () => void;
  backLabel?: string;
}) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [c, setC] = useState<Client>(client);
  const [booking, setBooking] = useState(false);
  // Conversation leads: when she opens a client it's usually because someone
  // said something.
  const [pane, setPane] = useState<"conversation" | "appointments" | "tasks">(
    "conversation",
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);

  // Twilio rings HER, then bridges to the client, so the client sees the salon
  // number instead of her mobile. Same call as the appointment screen.
  // months = 0 wakes her up again.
  async function snooze(months: number) {
    let until: string | null = null;
    if (months > 0) {
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      until = d.toISOString().slice(0, 10);
    }
    const { data, error } = await supabase
      .from("clients")
      .update({ snoozed_until: until })
      .eq("id", c.id)
      .select()
      .single();
    if (error) setError(error.message);
    else setC(data as Client);
  }

  async function callClient(clientId: string) {
    setCalling(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/voice/click-to-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ clientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't place the call.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't place the call.");
    } finally {
      setCalling(false);
    }
  }

  const loadVisits = useCallback(() => {
    supabase
      .from("appointments")
      // `*` so payment columns are tolerated regardless of migration state.
      .select("*,services(name)")
      .eq("client_id", client.id)
      .order("starts_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setVisits((data ?? []) as unknown as Visit[]);
      });
  }, [client.id]);

  useEffect(loadVisits, [loadVisits]);

  const now = Date.now();
  const upcoming = visits.filter((v) => new Date(v.starts_at).getTime() >= now);
  const past = visits.filter((v) => new Date(v.starts_at).getTime() < now);
  const attended = (v: Visit) =>
    v.status !== "cancelled" && v.status !== "no_show";
  const attendedPast = past.filter(attended);
  const lastAttended = attendedPast[0]?.starts_at ?? null;
  const weeksSince = lastAttended
    ? (now - new Date(lastAttended).getTime()) / (7 * 86400000)
    : null;
  const service =
    visits[0]?.services?.name ?? attendedPast[0]?.services?.name ?? null;
  const gap = usualGapWeeks(attendedPast.map((v) => v.starts_at));
  const state = clientState({
    pastCount: attendedPast.length,
    upcomingCount: upcoming.filter((v) => v.status !== "cancelled").length,
    weeksSinceLast: weeksSince,
    gapWeeks: gap,
  });
  const descriptor =
    formulaName(c.hair_formula) ?? service?.toLowerCase() ?? null;
  const spent = attendedPast
    .filter((v) => v.status === "checked_out" || v.status === "completed")
    .reduce((s, v) => s + (v.paid_cents ?? v.price_cents ?? 0), 0);

  const cardActions: Action[] = [];
  cardActions.push({
    label: booking ? "Close" : "Book",
    icon: CalendarPlus,
    onClick: () => setBooking((b) => !b),
    primary: true,
  });
  if (c.phone) {
    cardActions.push({ label: "Text", icon: MessageSquare, href: `sms:${c.phone}` });
    cardActions.push({
      label: "Call",
      icon: Phone,
      onClick: () => callClient(c.id),
      busy: calling,
      busyLabel: "Ringing…",
    });
  }
  if (c.email) {
    cardActions.push({ label: "Email", icon: Mail, href: `mailto:${c.email}` });
  }
  cardActions.push({
    label: "Edit",
    icon: Pencil,
    onClick: () => setEditing(true),
  });

  return (
    <div>
      {/* Back where she came from. Arriving from Messages and being offered
          only "All clients" left her stranded — the way out was the browser's
          Back button, which on an installed app she may not have. */}
      <Button variant="ghost" onClick={onBack}>
        ← {backLabel ?? "All clients"}
      </Button>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-4 flex overflow-hidden rounded-2xl border border-foreground/10 bg-white">
        {/* How she's doing, as the edge of her card. */}
        {!editing && (
          <Rail
            state={state}
            color={railColor(state, weeksSince, gap)}
            width={8}
          />
        )}
        <div className="min-w-0 flex-1">
        {editing ? (
          <div className="p-6">
            <ClientForm
              initial={{
                full_name: c.full_name,
                email: c.email ?? "",
                phone: c.phone ?? "",
                birthday: c.birthday ?? "",
                hair_formula: c.hair_formula ?? "",
                notes: c.notes ?? "",
              }}
              serviceName={service}
              submitLabel="Save"
              onCancel={() => setEditing(false)}
              onSubmit={async (vals) => {
                const { data, error } = await saveClient(
                  "update",
                  vals,
                  client.id,
                );
                if (error) {
                  setError(error.message);
                  return false;
                }
                setC(data as Client);
                setEditing(false);
                return true;
              }}
            />
          </div>
        ) : (
          <>
            <div className="flex items-stretch gap-3 p-4 sm:gap-4 sm:p-6">
              <Avatar name={c.full_name} size={52} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="truncate font-display text-2xl">
                    {c.full_name}
                  </h2>
                  {/* The state in words beside the rail, so the card reads
                      without depending on colour. */}
                  <span
                    className="shrink-0 text-xs font-medium uppercase tracking-wider"
                    style={{
                      color: railColor(state, weeksSince, gap) ?? "#6f5c52",
                    }}
                  >
                    {STATE_LABEL[state]}
                  </span>
                </div>
                <p className="font-display text-sm italic text-muted">
                  {stateCaption(state, weeksSince, gap)}
                </p>
              </div>
            </div>

            {/* Her formula — the thing she actually mixes, as text. */}
            <div className="flex flex-wrap items-center gap-3 border-t border-foreground/10 px-4 py-4 sm:px-6">
              <p className="text-xs uppercase tracking-wide text-muted">
                Her formula
              </p>
              {c.hair_formula ? (
                <>
                  <span className="font-mono text-sm">{c.hair_formula}</span>
                  {descriptor && (
                    <span className="font-display text-sm italic text-muted">
                      {formulaName(c.hair_formula)}
                    </span>
                  )}
                </>
              ) : (
                <span className="font-display text-sm italic text-muted">
                  none recorded yet
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 px-4 pb-5 sm:px-6">
              <Stat label="visits" value={String(attendedPast.length)} />
              <Stat
                label="since last"
                value={weeksSince != null ? `${Math.round(weeksSince)}w` : "—"}
              />
              <Stat label="spent" value={spent ? money(spent) : "—"} />
            </div>

            {c.birthday && (
              <p className="px-4 pb-4 text-sm text-muted sm:px-6">🎂 {c.birthday}</p>
            )}
            {c.notes && (
              <p className="mx-4 mb-5 whitespace-pre-wrap rounded-xl bg-background px-4 py-3 text-sm sm:mx-6">
                {c.notes}
              </p>
            )}

            <ActionStrip actions={cardActions} />
          </>
        )}
        </div>
      </div>

      {state === "overdue" && c.phone && (
        <div className="mt-4 rounded-xl border border-foreground/10 bg-white p-4">
          <p className="text-sm">
            {weeksSince != null &&
              `${Math.round(weeksSince)} weeks since her last visit`}
            {gap && ` — she usually comes every ${Math.round(gap)}.`}
          </p>
          <a
            href={`sms:${c.phone}?&body=${encodeURIComponent(
              `Hi ${c.full_name.split(" ")[0]}, it's Evelyn at Threshold! It's been a while — I'd love to get you back in the chair. Want me to save you a spot?`,
            )}`}
            className="mt-2 inline-flex text-sm font-medium text-accent-dark underline decoration-accent underline-offset-4 hover:decoration-accent-dark"
          >
            Send her a win-back text
          </a>
          {/* "Not yet" needs somewhere to go, or the only way to stop the
              nagging is to book her or ignore it forever. */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-foreground/10 pt-3 text-sm">
            <span className="text-muted">Not right now?</span>
            {[
              ["a month", 1],
              ["3 months", 3],
              ["6 months", 6],
            ].map(([label, months]) => (
              <button
                key={label as string}
                onClick={() => snooze(months as number)}
                className="text-accent-dark underline decoration-accent underline-offset-4 transition hover:decoration-accent-dark"
              >
                Snooze {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {c.snoozed_until && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 bg-background/60 px-4 py-3 text-sm">
          <span className="text-muted">
            Snoozed until {dateLabel(`${c.snoozed_until}T12:00:00`)} — she stays
            out of Due and Overdue until then.
          </span>
          <button
            onClick={() => snooze(0)}
            className="text-accent-dark underline decoration-accent underline-offset-4 transition hover:decoration-accent-dark"
          >
            Wake her up
          </button>
        </div>
      )}

      {/* Three sections that used to stack, so opening one pushed the others
          off the screen — and a long conversation pushed everything below it
          out of reach entirely. They're tabs now: one at a time, in a fixed
          place, whatever their length. */}
      <div className="mt-6 flex gap-5 border-b border-foreground/15">
        {(
          [
            ["conversation", "Conversation"],
            ["appointments", "Appointments"],
            ["tasks", "Tasks"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPane(k)}
            className={`-mb-px border-b-2 pb-2 text-sm transition ${
              pane === k
                ? "border-accent font-medium text-accent-dark"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {pane === "conversation" && (
        <ClientMessages clientId={client.id} phone={c.phone} />
      )}

      {pane === "tasks" && <ClientTasks clientId={client.id} />}

      {pane === "appointments" && (
        <>
          {booking && (
            <div className="mt-4 rounded-xl border border-foreground/15 bg-white p-5">
              <NewAppointment
                clientId={client.id}
                onDone={() => {
                  setBooking(false);
                  loadVisits();
                }}
              />
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                Upcoming
              </p>
              <VisitList visits={upcoming} onSelect={setOpenId} />
            </div>
          )}
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-muted">History</p>
            {past.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No past visits.</p>
            ) : (
              <VisitList visits={past} onSelect={setOpenId} />
            )}
          </div>
        </>
      )}

      {openId && (
        <ApptDetailModal
          appointmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            setOpenId(null);
            loadVisits();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-3 text-center">
      <div className="text-xl font-medium">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

function VisitList({
  visits,
  onSelect,
}: {
  visits: Visit[];
  onSelect: (id: string) => void;
}) {
  // One surface with hairline dividers and a status rail per row — the same
  // shape as the client list, rather than a stack of separately-bordered cards.
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white">
      {visits.map((v, i) => (
        <button
          key={v.id}
          onClick={() => onSelect(v.id)}
          className={`flex w-full items-stretch text-left text-sm transition hover:bg-background/60 ${
            i > 0 ? "border-t border-foreground/10" : ""
          }`}
        >
          <Rail
            color={
              statusBlockColor(v.status)?.bg ?? serviceEdge(v.services?.name)
            }
            width={4}
          />
          <span className="flex flex-1 items-center justify-between gap-3 px-4 py-3">
            <span className="truncate">{v.services?.name ?? "Service"}</span>
            <span className="shrink-0 whitespace-nowrap text-muted">
              {whenLabel(v.starts_at)}
              {v.status !== "booked" && v.status !== "confirmed" && (
                <span
                  className="ml-2 text-[11px] uppercase tracking-wider"
                  style={{ color: statusBlockColor(v.status)?.bg ?? "#6f5c52" }}
                >
                  {statusLabel(v.status)}
                </span>
              )}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

type ClientTask = {
  id: string;
  title: string;
  start_date: string | null;
  due_date: string | null;
};

// Open to-dos linked to this client — the client-file side of task linking.
// Hidden entirely if the tasks table/columns aren't migrated yet (best-effort).
function ClientTasks({ clientId }: { clientId: string }) {
  const [tasks, setTasks] = useState<ClientTask[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");

  const load = useCallback(() => {
    supabase
      .from("tasks")
      .select("id,title,start_date,due_date")
      .eq("client_id", clientId)
      .eq("done", false)
      .order("due_date", { nullsFirst: false })
      .then(({ data, error }) => {
        if (error) setUnavailable(true);
        else setTasks((data ?? []) as ClientTask[]);
      });
  }, [clientId]);

  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      start_date: start || null,
      due_date: due || null,
      client_id: clientId,
      recurrence: "none",
    });
    if (!error) {
      setTitle("");
      setStart("");
      setDue("");
      load();
    }
  }

  async function complete(id: string) {
    await supabase
      .from("tasks")
      .update({ done: true, done_at: new Date().toISOString() })
      .eq("id", id);
    load();
  }


  if (unavailable || tasks === null) return null;

  return (
    <div className="mt-6">
      <h3 className="font-display text-lg">Tasks &amp; follow-ups</h3>
      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2">
        <input
          className="input flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Follow up, patch test, order color…"
        />
        {/* Start as well as due, so a task added here can surface on the
            Overview the day it becomes her problem rather than only when it's
            already late. */}
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
            Start
          </span>
          <input
            type="date"
            className="input w-auto"
            value={start}
            max={due || undefined}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
            Due
          </span>
          <input
            type="date"
            className="input w-auto"
            value={due}
            min={start || undefined}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        <Button type="submit">Add</Button>
      </form>

      {tasks.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white">
          {tasks.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i > 0 ? "border-t border-foreground/10" : ""
              }`}
            >
              <button
                onClick={() => complete(t.id)}
                aria-label="Mark done"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-foreground/25 text-xs transition hover:border-accent hover:text-accent"
              >
                ✓
              </button>
              <span className="flex-1 text-sm">{t.title}</span>
              {t.due_date && (
                <span className="text-sm text-muted">
                  {dateLabel(`${t.due_date}T12:00:00`)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type SvcOpt = { id: string; name: string; duration_minutes: number; price_cents: number };

function NewAppointment({
  clientId,
  onDone,
}: {
  clientId: string;
  onDone: () => void;
}) {
  const [services, setServices] = useState<SvcOpt[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [when, setWhen] = useState(""); // datetime-local
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
    if (error) {
      setError(
        error.message.includes("overlap") || error.message.includes("exclusion")
          ? "That time overlaps another appointment."
          : error.message,
      );
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="block">
        <span className="mb-1 block text-sm">Service</span>
        <select
          className="input"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          required
        >
          <option value="">Choose a service…</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">Date &amp; time</span>
        <input
          type="datetime-local"
          className="input w-auto"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
        />
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Booking…" : "Book appointment"}
        </Button>
      </div>
    </form>
  );
}

type FormVals = {
  full_name: string;
  email: string;
  phone: string;
  birthday: string;
  hair_formula: string;
  notes: string;
};

function ClientForm({
  initial,
  serviceName,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormVals;
  serviceName: string | null;
  submitLabel: string;
  onSubmit: (vals: {
    full_name: string;
    email: string | null;
    phone: string | null;
    birthday: string | null;
    hair_formula: string | null;
    notes: string | null;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FormVals>) =>
    setV((prev) => ({ ...prev, ...patch }));

  const shade = formulaName(v.hair_formula);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.full_name.trim() || !v.phone.trim()) return;
    setBusy(true);
    await onSubmit({
      full_name: v.full_name.trim(),
      email: v.email.trim() || null,
      phone: v.phone.trim() || null,
      birthday: v.birthday || null,
      hair_formula: v.hair_formula.trim() || null,
      notes: v.notes.trim() || null,
    });
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="block">
        <span className="mb-1 block text-sm">Name</span>
        <input
          className="input"
          value={v.full_name}
          onChange={(e) => set({ full_name: e.target.value })}
          required
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="block flex-1">
          <span className="mb-1 block text-sm">
            Phone <span className="text-accent">*</span>
          </span>
          <input
            className="input"
            type="tel"
            value={v.phone}
            onChange={(e) => set({ phone: e.target.value })}
            required
          />
        </label>
        <label className="block flex-1">
          <span className="mb-1 block text-sm">Email</span>
          <input
            className="input"
            value={v.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </label>
      </div>

      {/* Color / formula — what she mixes, named back to her as she types. */}
      <div className="rounded-xl border border-foreground/10 bg-background p-4">
        <span className="mb-2 block text-sm">Her color / formula</span>
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="input w-28 font-mono"
            placeholder="e.g. 9G"
            value={v.hair_formula}
            onChange={(e) => set({ hair_formula: e.target.value })}
          />
          <span className="font-display text-sm italic text-muted">
            {shade
              ? shade
              : `service default${serviceName ? ` · ${serviceName.toLowerCase()}` : ""}`}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Level + tone, e.g. 9G (gold blonde), 5N (neutral brown). Leave blank to
          use her service color.
        </p>
      </div>

      <label className="block w-48">
        <span className="mb-1 block text-sm">Birthday</span>
        <input
          type="date"
          className="input"
          value={v.birthday}
          onChange={(e) => set({ birthday: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">
          Notes &amp; preferences (full formula, allergies, likes…)
        </span>
        <textarea
          className="input"
          rows={4}
          value={v.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
      {children}
    </p>
  );
}
