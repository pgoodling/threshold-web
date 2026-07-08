"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { salonWallToISO, whenLabel } from "../../lib/format";

type Client = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  birthday: string | null; // YYYY-MM-DD
  created_at: string;
};

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("clients")
      .select("id,full_name,email,phone,notes,birthday,created_at")
      .order("full_name")
      .then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setClients((data ?? []) as Client[]);
      });
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return clients;
    return clients.filter((c) =>
      [c.full_name, c.email, c.phone]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(s)),
    );
  }, [clients, q]);

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
            initial={{ full_name: "", email: "", phone: "", birthday: "", notes: "" }}
            submitLabel="Add client"
            onCancel={() => setAdding(false)}
            onSubmit={async (vals) => {
              const { error } = await supabase.from("clients").insert(vals);
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
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-muted">
          {clients.length === 0 ? "No clients yet." : "No matches."}
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="flex items-center justify-between rounded-xl border border-foreground/10 bg-white px-4 py-3 text-left transition hover:border-accent"
            >
              <span className="font-medium">{c.full_name}</span>
              <span className="text-sm text-muted">
                {[c.phone, c.email].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Visit = {
  id: string;
  starts_at: string;
  status: string;
  services: { name: string } | null;
};

function ClientDetail({ client, onBack }: { client: Client; onBack: () => void }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [c, setC] = useState<Client>(client);
  const [booking, setBooking] = useState(false);

  const loadVisits = useCallback(() => {
    supabase
      .from("appointments")
      .select("id,starts_at,status,services(name)")
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
  const lastPast = past[0]?.starts_at ?? null;
  const weeksSince = lastPast
    ? (now - new Date(lastPast).getTime()) / (7 * 86400000)
    : null;
  const lapsed = upcoming.length === 0 && weeksSince !== null && weeksSince >= 8;
  const contactCls =
    "rounded-full border border-foreground/15 px-4 py-1.5 text-sm transition hover:border-accent hover:text-accent";

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-muted hover:text-accent"
      >
        ← All clients
      </button>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-4 rounded-2xl border border-foreground/10 bg-white p-6">
        {editing ? (
          <ClientForm
            initial={{
              full_name: c.full_name,
              email: c.email ?? "",
              phone: c.phone ?? "",
              birthday: c.birthday ?? "",
              notes: c.notes ?? "",
            }}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async (vals) => {
              const { data, error } = await supabase
                .from("clients")
                .update(vals)
                .eq("id", client.id)
                .select()
                .single();
              if (error) {
                setError(error.message);
                return false;
              }
              setC(data as Client);
              setEditing(false);
              return true;
            }}
          />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl">{c.full_name}</h2>
                {c.birthday && (
                  <p className="mt-1 text-sm text-muted">🎂 {c.birthday}</p>
                )}
              </div>
              <button
                onClick={() => setEditing(true)}
                className="rounded-full border border-foreground/15 px-4 py-1.5 text-xs transition hover:border-accent hover:text-accent"
              >
                Edit
              </button>
            </div>
            {(c.phone || c.email) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className={contactCls}>
                    Call
                  </a>
                )}
                {c.phone && (
                  <a href={`sms:${c.phone}`} className={contactCls}>
                    Text
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className={contactCls}>
                    Email
                  </a>
                )}
              </div>
            )}
            {c.notes && (
              <p className="mt-4 whitespace-pre-wrap rounded-xl bg-background px-4 py-3 text-sm">
                {c.notes}
              </p>
            )}
          </>
        )}
      </div>

      {lapsed && c.phone && (
        <div className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm">
            Hasn&apos;t been in for about {Math.round(weeksSince ?? 0)} weeks.
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
          <VisitList visits={upcoming} />
        </div>
      )}
      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide text-muted">History</p>
        {past.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No past visits.</p>
        ) : (
          <VisitList visits={past} />
        )}
      </div>
    </div>
  );
}

function VisitList({ visits }: { visits: Visit[] }) {
  return (
    <div className="mt-2 grid gap-2">
      {visits.map((v) => (
        <div
          key={v.id}
          className="flex items-center justify-between rounded-xl border border-foreground/10 bg-white px-4 py-3 text-sm"
        >
          <span>{v.services?.name ?? "Service"}</span>
          <span className="text-muted">
            {whenLabel(v.starts_at)}
            {v.status !== "booked" && v.status !== "confirmed" && (
              <span className="ml-2 rounded-full bg-foreground/5 px-2 py-0.5 text-xs">
                {v.status}
              </span>
            )}
          </span>
        </div>
      ))}
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

function ClientForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { full_name: string; email: string; phone: string; birthday: string; notes: string };
  submitLabel: string;
  onSubmit: (vals: {
    full_name: string;
    email: string | null;
    phone: string | null;
    birthday: string | null;
    notes: string | null;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof initial>) =>
    setV((prev) => ({ ...prev, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.full_name.trim()) return;
    setBusy(true);
    await onSubmit({
      full_name: v.full_name.trim(),
      email: v.email.trim() || null,
      phone: v.phone.trim() || null,
      birthday: v.birthday || null,
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
          <span className="mb-1 block text-sm">Phone</span>
          <input
            className="input"
            value={v.phone}
            onChange={(e) => set({ phone: e.target.value })}
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
          Notes &amp; preferences (formulas, allergies, likes…)
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
