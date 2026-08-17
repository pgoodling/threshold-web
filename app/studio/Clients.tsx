"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  salonWallToISO,
  whenLabel,
  dateLabel,
  money,
  statusLabel,
  statusPillClass,
  clientStage,
  stageDot,
  type ClientStage,
} from "../../lib/format";
import {
  strandColors,
  regrowthPct,
  formulaName,
  ROOT_HEX,
} from "../../lib/hair";
import ApptDetailModal from "./ApptDetailModal";

type Client = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  birthday: string | null; // YYYY-MM-DD
  hair_formula: string | null; // e.g. "9G" — drives her strand color
  created_at: string;
};

// Per-client rollup from her appointment history, used to place her on the
// lifecycle and pick her regrowth + strand color.
type Agg = {
  lastAttended: number | null;
  upcomingCount: number;
  pastCount: number;
  service: string | null; // most recent service, for the default color
  nextStart: number | null;
};

const EMPTY_AGG: Agg = {
  lastAttended: null,
  upcomingCount: 0,
  pastCount: 0,
  service: null,
  nextStart: null,
};

type View = {
  c: Client;
  agg: Agg;
  stage: ClientStage | null;
  weeks: number | null;
  strand: { hair: string; root: string };
  pct: number;
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

// A lock of hair: dark regrowth on top (grows with time away), her color below.
function Strand({
  hair,
  root,
  pct,
  h = 46,
  w = 11,
  dot = null,
}: {
  hair: string;
  root: string;
  pct: number;
  h?: number;
  w?: number;
  dot?: string | null;
}) {
  return (
    <span className="relative shrink-0" style={{ width: w, height: h }}>
      <span className="flex h-full w-full flex-col overflow-hidden rounded-md">
        <span style={{ height: `${Math.round(pct * 100)}%`, background: root }} />
        <span style={{ flex: 1, background: hair }} />
      </span>
      {dot && (
        <span
          className="absolute -right-1 -top-1 rounded-full border-2 border-white"
          style={{ width: 9, height: 9, background: dot }}
        />
      )}
    </span>
  );
}

function Avatar({
  name,
  dot,
  size = 38,
}: {
  name: string;
  dot?: string | null;
  size?: number;
}) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        background: "#f1e7dd",
        color: "#7a4a34",
        fontSize: Math.round(size * 0.34),
      }}
    >
      {initials(name)}
      {dot && (
        <span
          className="absolute -right-0.5 -top-0.5 rounded-full border-2 border-white"
          style={{ width: 11, height: 11, background: dot }}
        />
      )}
    </span>
  );
}

// Short serif caption in colorist language, e.g. "gold blonde · roots at 6w".
function stageText(
  stage: ClientStage | null,
  weeks: number | null,
  descriptor: string | null,
): string {
  const wk = weeks != null ? Math.round(weeks) : null;
  const d = descriptor;
  if (!stage) return "no visits yet";
  switch (stage) {
    case "new":
      return d ? `new · ${d}` : "new client";
    case "won_back":
      return d ? `${d} · freshly back` : "freshly back";
    case "at_risk":
      return `${d ?? "color"} · roots at ${wk}w`;
    case "lapsed":
      return `${d ?? "color"} · grown out, ${wk}w`;
    default:
      return d ? `${d} · fresh` : "fresh · a regular";
  }
}

function descriptorFor(c: Client, agg: Agg): string | null {
  return formulaName(c.hair_formula) ?? agg.service?.toLowerCase() ?? null;
}

function viewFor(c: Client, agg: Agg | undefined): View {
  const a = agg ?? EMPTY_AGG;
  const weeks =
    a.lastAttended != null
      ? (Date.now() - a.lastAttended) / (7 * 86400000)
      : null;
  return {
    c,
    agg: a,
    weeks,
    stage: clientStage({
      pastCount: a.pastCount,
      upcomingCount: a.upcomingCount,
      weeksSinceLast: weeks,
    }),
    strand: strandColors(c.hair_formula, a.service),
    pct: regrowthPct(weeks),
  };
}

const KEY_STAGES: { key: string; label: string; pct: number; dot: string | null }[] = [
  { key: "all", label: "All", pct: 0.2, dot: null },
  { key: "new", label: "New", pct: 0.08, dot: "#c9a24b" },
  { key: "regular", label: "Regular", pct: 0.12, dot: null },
  { key: "at_risk", label: "Roots showing", pct: 0.42, dot: null },
  { key: "lapsed", label: "Grown out", pct: 0.7, dot: null },
  { key: "won_back", label: "Won back", pct: 0.1, dot: "#7f77dd" },
];

// The whole book fanned open like her color-swatch ring: pale/fresh on the
// left, grown-out on the right.
function ColorRing({ views }: { views: View[] }) {
  const withVisits = views.filter((v) => v.stage);
  if (withVisits.length < 3) return null;
  const sorted = [...withVisits].sort((a, b) => a.pct - b.pct);
  const N = Math.min(23, sorted.length);
  const blades = Array.from({ length: N }, (_, i) => {
    const v = sorted[Math.round((i * (sorted.length - 1)) / Math.max(1, N - 1))];
    const ang = N === 1 ? 0 : -55 + (110 * i) / (N - 1);
    const H = 118;
    const rootH = Math.round(H * v.pct);
    return { ang, H, rootH, hair: v.strand.hair, root: v.strand.root, i };
  });
  const has = (s: string) => views.filter((v) => v.stage === s).length;
  const fresh = has("new") + has("regular") + has("won_back");

  return (
    <div className="flex w-full shrink-0 flex-col items-center sm:w-auto">
      <svg
        viewBox="0 0 320 146"
        aria-hidden="true"
        className="h-auto w-[280px] max-w-full"
      >
        <g transform="translate(160,136)">
          {blades.map((b) => (
            <g key={b.i} transform={`rotate(${b.ang})`}>
              <rect
                x="-4.5"
                y={-b.H}
                width="9"
                height={b.H - b.rootH}
                rx="4.5"
                fill={b.hair}
              />
              <rect x="-4.5" y={-b.rootH} width="9" height={b.rootH} rx="2" fill={b.root} />
            </g>
          ))}
          <circle cx="0" cy="0" r="9" fill="#7a4a34" />
        </g>
      </svg>
      <p className="font-display text-sm italic text-muted">
        {fresh} fresh · {has("at_risk")} due soon · {has("lapsed")} grown out
      </p>
    </div>
  );
}

export default function Clients({
  initialClientId,
  onOpened,
}: {
  initialClientId?: string | null;
  onOpened?: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [aggs, setAggs] = useState<Map<string, Agg>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selected, setSelected] = useState<Client | null>(null);
  const [adding, setAdding] = useState(false);

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
          const e = m.get(r.client_id) ?? { ...EMPTY_AGG };
          if (t >= now) {
            e.upcomingCount += 1;
            if (e.nextStart === null || t < e.nextStart) e.nextStart = t;
          } else if (r.status !== "no_show") {
            e.pastCount += 1;
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

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: views.length };
    for (const v of views) if (v.stage) m[v.stage] = (m[v.stage] ?? 0) + 1;
    return m;
  }, [views]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return views.filter((v) => {
      if (stageFilter !== "all" && v.stage !== stageFilter) return false;
      if (!s) return true;
      return [v.c.full_name, v.c.email, v.c.phone]
        .filter(Boolean)
        .some((x) => x!.toLowerCase().includes(s));
    });
  }, [views, q, stageFilter]);

  if (selected) {
    return (
      <ClientDetail
        client={selected}
        onBack={() => {
          setSelected(null);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          {clients.length} client{clients.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setAdding(true)}
          className="rounded-full border border-foreground/15 px-5 py-2 text-sm transition hover:border-accent hover:text-accent"
        >
          + Add client
        </button>
      </div>

      {!loading && views.length > 0 && (
        <div className="mt-4 rounded-2xl border border-foreground/10 bg-white p-5">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <ColorRing views={views} />
            <div className="w-full flex-1">
              <p className="font-display text-lg">Your book</p>
              <p className="font-display text-sm italic text-muted">
                every client, by how grown-out they are — tap a stage to focus
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {KEY_STAGES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStageFilter(s.key)}
                    className={`flex items-stretch overflow-hidden rounded-xl border text-left transition ${
                      stageFilter === s.key
                        ? "border-accent bg-accent/5"
                        : "border-foreground/10 hover:border-accent/40"
                    }`}
                  >
                    <span className="flex items-center py-2.5 pl-2.5 pr-1">
                      <Strand
                        hair="#e4c98c"
                        root={ROOT_HEX}
                        pct={s.pct}
                        w={7}
                        h={38}
                        dot={s.dot}
                      />
                    </span>
                    <span className="min-w-0 py-2 pr-3">
                      <span className="block text-xl font-medium leading-none">
                        {counts[s.key] ?? 0}
                      </span>
                      <span className="mt-1 block text-[11px] uppercase tracking-wide text-muted">
                        {s.label}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <input
        className="input mt-4"
        placeholder="Search by name, email, or phone…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {adding && (
        <div className="mt-4 rounded-2xl border border-accent/30 bg-white p-5">
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

      {loading ? (
        <p className="mt-6 text-muted">Loading clients…</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-muted">
          {clients.length === 0 ? "No clients yet." : "No matches."}
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
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
                className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-white px-4 py-3 text-left transition hover:border-accent"
              >
                <Strand hair={v.strand.hair} root={v.strand.root} pct={v.pct} />
                <Avatar
                  name={v.c.full_name}
                  dot={v.stage ? stageDot(v.stage) : null}
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{v.c.full_name}</div>
                  <div className="mt-0.5 truncate font-display text-sm italic text-muted">
                    {stageText(v.stage, v.weeks, descriptorFor(v.c, v.agg))}
                  </div>
                </div>
                <span className="ml-auto whitespace-nowrap pl-2 text-sm text-muted">
                  {meta}
                </span>
              </button>
            );
          })}
        </div>
      )}
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

function ClientDetail({ client, onBack }: { client: Client; onBack: () => void }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [c, setC] = useState<Client>(client);
  const [booking, setBooking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

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
  const lapsed = upcoming.length === 0 && weeksSince !== null && weeksSince >= 8;

  const service =
    visits[0]?.services?.name ?? attendedPast[0]?.services?.name ?? null;
  const stage = clientStage({
    pastCount: attendedPast.length,
    upcomingCount: upcoming.filter((v) => v.status !== "cancelled").length,
    weeksSinceLast: weeksSince,
  });
  const strand = strandColors(c.hair_formula, service);
  const descriptor =
    formulaName(c.hair_formula) ?? service?.toLowerCase() ?? null;
  const spent = attendedPast
    .filter((v) => v.status === "checked_out" || v.status === "completed")
    .reduce((s, v) => s + (v.paid_cents ?? v.price_cents ?? 0), 0);

  const contactCls =
    "inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 px-4 py-1.5 text-sm transition hover:border-accent hover:text-accent";

  return (
    <div>
      <button onClick={onBack} className="text-sm text-muted hover:text-accent">
        ← All clients
      </button>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-foreground/10 bg-white">
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
            <div className="flex items-stretch gap-3 bg-[#f7f0e8] p-4 sm:gap-4 sm:p-6">
              <Strand
                hair={strand.hair}
                root={strand.root}
                pct={regrowthPct(weeksSince)}
                w={14}
                h={64}
              />
              <Avatar
                name={c.full_name}
                dot={stage ? stageDot(stage) : null}
                size={52}
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-2xl">{c.full_name}</h2>
                <p className="font-display text-sm italic text-muted">
                  {stageText(stage, weeksSince, descriptor)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.phone && (
                    <a href={`sms:${c.phone}`} className={`${contactCls} border-accent bg-accent text-white hover:text-white`}>
                      Text
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className={contactCls}>
                      Call
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className={contactCls}>
                      Email
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={() => setEditing(true)}
                className="self-start rounded-full border border-foreground/15 px-4 py-1.5 text-xs transition hover:border-accent hover:text-accent"
              >
                Edit
              </button>
            </div>

            {/* Her formula + swatch */}
            <div className="flex flex-wrap items-center gap-3 border-t border-foreground/10 px-4 py-4 sm:px-6">
              <p className="text-xs uppercase tracking-wide text-muted">
                Her formula
              </p>
              <Strand hair={strand.hair} root={strand.root} pct={0.14} w={22} h={30} />
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
                  none yet — using her {service ? service.toLowerCase() : "service"} color
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
          </>
        )}
      </div>

      {lapsed && c.phone && (
        <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm">
            Hasn&apos;t been in for about {Math.round(weeksSince ?? 0)} weeks —
            her roots are well grown out.
          </p>
          <a
            href={`sms:${c.phone}?&body=${encodeURIComponent(
              `Hi ${c.full_name.split(" ")[0]}, it's Evelyn at Threshold! It's been a while — I'd love to get you back in the chair. Want me to save you a spot?`,
            )}`}
            className="mt-2 inline-block rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent-dark"
          >
            Win back — send a text
          </a>
        </div>
      )}

      <ClientTasks clientId={client.id} />

      {/* Visit history */}
      <div className="mt-6 flex items-center justify-between">
        <h3 className="font-display text-lg">Appointments</h3>
        <button
          onClick={() => setBooking((b) => !b)}
          className="rounded-full border border-foreground/15 px-4 py-1.5 text-xs transition hover:border-accent hover:text-accent"
        >
          {booking ? "Close" : "+ New appointment"}
        </button>
      </div>

      {booking && (
        <div className="mt-3 rounded-2xl border border-accent/30 bg-white p-5">
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
          <p className="text-xs uppercase tracking-wide text-muted">Upcoming</p>
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
  return (
    <div className="mt-2 grid gap-2">
      {visits.map((v) => (
        <button
          key={v.id}
          onClick={() => onSelect(v.id)}
          className="flex w-full items-center justify-between rounded-xl border border-foreground/10 bg-white px-4 py-3 text-left text-sm transition hover:border-accent"
        >
          <span>{v.services?.name ?? "Service"}</span>
          <span className="text-muted">
            {whenLabel(v.starts_at)}
            {v.status !== "booked" && v.status !== "confirmed" && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${statusPillClass(v.status)}`}
              >
                {statusLabel(v.status)}
              </span>
            )}
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
      due_date: due || null,
      client_id: clientId,
      recurrence: "none",
    });
    if (!error) {
      setTitle("");
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
        <input
          type="date"
          className="input w-auto"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent-dark"
        >
          Add
        </button>
      </form>

      {tasks.length > 0 && (
        <div className="mt-3 grid gap-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-white px-4 py-3"
            >
              <button
                onClick={() => complete(t.id)}
                aria-label="Mark done"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-foreground/25 text-xs hover:border-accent hover:text-accent"
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
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-accent px-6 py-2 text-white transition hover:bg-accent-dark disabled:opacity-60"
        >
          {busy ? "Booking…" : "Book appointment"}
        </button>
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

  const swatch = strandColors(v.hair_formula, serviceName);
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

      {/* Color / formula, with a live swatch preview */}
      <div className="rounded-xl border border-foreground/10 bg-background p-4">
        <span className="mb-2 block text-sm">Her color / formula</span>
        <div className="flex flex-wrap items-center gap-3">
          <Strand hair={swatch.hair} root={swatch.root} pct={0.14} w={26} h={34} />
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
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-accent px-6 py-2 text-white transition hover:bg-accent-dark disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted hover:text-accent"
        >
          Cancel
        </button>
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
