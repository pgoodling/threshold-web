"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { durationLabel, priceLabel } from "../../lib/format";

type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number; // generated in the database: start + process + finish
  start_minutes: number;
  process_minutes: number;
  finish_minutes: number;
  price_cents: number;
  price_is_from: boolean;
  deposit_cents: number;
  active: boolean;
  sort_order: number;
};

type Draft = {
  name: string;
  description: string;
  start: string; // minutes she's working, before any processing
  process: string; // minutes the colour develops — she's free
  finish: string; // minutes she's working again, after processing
  price: string; // dollars
  price_is_from: boolean;
  deposit: string; // dollars
  active: boolean;
};

const toDraft = (s: Service): Draft => ({
  name: s.name,
  description: s.description ?? "",
  start: String(s.start_minutes ?? s.duration_minutes),
  process: s.process_minutes ? String(s.process_minutes) : "",
  finish: s.finish_minutes ? String(s.finish_minutes) : "",
  price: String(Math.round(s.price_cents / 100)),
  price_is_from: s.price_is_from,
  deposit: s.deposit_cents ? String(Math.round(s.deposit_cents / 100)) : "",
  active: s.active,
});

const emptyDraft: Draft = {
  name: "",
  description: "",
  start: "60",
  process: "",
  finish: "",
  price: "",
  price_is_from: true,
  deposit: "",
  active: true,
};

// A service shorter than this is a typo, not a real appointment. Duration is
// what blocks the calendar — `create_booking` derives `ends_at` from it, and
// the no-double-booking constraint only protects that window. A service saved
// at 1 minute lets two clients book the same afternoon.
const MIN_DURATION = 5;
const MAX_DURATION = 480; // 8 hours

// Returns a message to show the user, or null when the draft is safe to save.
// This exists because the old code coerced a blank duration to 1 minute
// silently — every service on the live site ended up at "1 min" that way.
// Optional segment: blank means zero. Returns null when the text is unusable.
function optionalMinutes(raw: string): number | null {
  if (!raw.trim()) return 0;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 0 && n <= MAX_DURATION ? n : null;
}

function validateDraft(d: Draft): string | null {
  if (!d.name.trim()) return "Give the service a name.";

  const start = Number(d.start.trim());
  if (!d.start.trim() || !Number.isInteger(start)) {
    return "Enter the start time — how long you're working before any processing.";
  }
  if (start < MIN_DURATION || start > MAX_DURATION) {
    return `Start time must be between ${MIN_DURATION} and ${MAX_DURATION} minutes.`;
  }

  const process = optionalMinutes(d.process);
  if (process === null) return "Processing time isn't a valid number of minutes.";
  const finish = optionalMinutes(d.finish);
  if (finish === null) return "Finish time isn't a valid number of minutes.";

  // Finish time only means something on the far side of a gap.
  if (finish > 0 && process === 0) {
    return "Add processing time before finish time — finish is the work after the gap.";
  }
  if (start + process + finish > MAX_DURATION) {
    return `The whole service can't be longer than ${MAX_DURATION} minutes.`;
  }

  const price = Number(d.price.trim());
  if (!d.price.trim() || !Number.isFinite(price) || price < 0) {
    return "Enter a price (use 0 if the service is free).";
  }

  if (d.deposit.trim()) {
    const deposit = Number(d.deposit.trim());
    if (!Number.isFinite(deposit) || deposit < 0) return "Deposit isn't a valid amount.";
    if (deposit > price) return "Deposit can't be more than the price.";
  }

  return null;
}

// Changing a service's segments re-times every future appointment using it
// (trigger `services_resync_busy`), so a save can now fail because the new
// shape would double-book her. The raw Postgres text is meaningless to her.
function friendlyServiceError(message: string) {
  if (/appointment_busy_no_overlap|exclusion|conflicting key/i.test(message)) {
    return "Those timings would overlap an appointment already on the calendar. Adjust the affected bookings first, or change this service by a smaller amount.";
  }
  if (/duration_minutes.*generated|generated column/i.test(message)) {
    return "The app is out of date with the database — reload the page and try again.";
  }
  return message;
}

// Assumes validateDraft() has already passed — no silent coercion here.
function draftToRow(d: Draft) {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    // duration_minutes is generated in the database — never written here.
    start_minutes: Number(d.start.trim()),
    process_minutes: optionalMinutes(d.process) ?? 0,
    finish_minutes: optionalMinutes(d.finish) ?? 0,
    price_cents: Math.round(Number(d.price.trim()) * 100),
    price_is_from: d.price_is_from,
    deposit_cents: d.deposit.trim() ? Math.round(Number(d.deposit.trim()) * 100) : 0,
    active: d.active,
  };
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("services")
      .select(
        "id,name,description,duration_minutes,start_minutes,process_minutes,finish_minutes,price_cents,price_is_from,deposit_cents,active,sort_order",
      )
      .order("sort_order")
      .then(({ data, error }) => {
        setLoading(false);
        if (error) setError(error.message);
        else setServices((data ?? []) as Service[]);
      });
  }, []);

  useEffect(load, [load]);

  async function addService(d: Draft) {
    const nextOrder =
      services.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1;
    const { error } = await supabase
      .from("services")
      .insert({ ...draftToRow(d), sort_order: nextOrder });
    if (error) {
      setError(friendlyServiceError(error.message));
      return false;
    }
    setAdding(false);
    load();
    return true;
  }

  if (loading) return <p className="text-muted">Loading services…</p>;

  return (
    <div>
      <p className="text-muted">
        Your service menu. These appear on the booking page — edit prices,
        durations, and descriptions any time.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-6 grid gap-3">
        {services.map((s) => (
          <ServiceRow key={s.id} service={s} onChange={load} onError={setError} />
        ))}
      </div>

      {adding ? (
        <div className="mt-4 rounded-2xl border border-accent/30 bg-white p-5">
          <p className="mb-4 font-medium">New service</p>
          <ServiceForm
            initial={emptyDraft}
            submitLabel="Add service"
            onSubmit={addService}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 rounded-full border border-foreground/15 px-6 py-3 text-sm transition hover:border-accent hover:text-accent"
        >
          + Add service
        </button>
      )}
    </div>
  );
}

function ServiceRow({
  service,
  onChange,
  onError,
}: {
  service: Service;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  async function save(d: Draft) {
    const { error } = await supabase
      .from("services")
      .update(draftToRow(d))
      .eq("id", service.id);
    if (error) {
      onError(friendlyServiceError(error.message));
      return false;
    }
    setEditing(false);
    onChange();
    return true;
  }

  async function toggleActive() {
    const { error } = await supabase
      .from("services")
      .update({ active: !service.active })
      .eq("id", service.id);
    if (error) onError(error.message);
    else onChange();
  }

  async function remove() {
    const { error } = await supabase
      .from("services")
      .delete()
      .eq("id", service.id);
    if (error)
      onError(
        "Couldn't delete — this service is likely used by past appointments. Deactivate it instead.",
      );
    else onChange();
  }

  if (editing) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-white p-5">
        <ServiceForm
          initial={toDraft(service)}
          submitLabel="Save"
          onSubmit={save}
          onCancel={() => setEditing(false)}
          onDelete={remove}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-foreground/10 bg-white p-5 ${
        service.active ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-lg">
          {service.name}
          {!service.active && (
            <span className="ml-2 rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-muted">
              hidden
            </span>
          )}
        </h3>
        <span className="whitespace-nowrap text-sm text-accent">
          {priceLabel(service.price_cents, service.price_is_from)}
        </span>
      </div>
      {service.description && (
        <p className="mt-2 text-sm text-muted">{service.description}</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">
          {durationLabel(service.duration_minutes)}
          {service.deposit_cents
            ? ` · ${priceLabel(service.deposit_cents)} deposit`
            : ""}
        </span>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setEditing(true)}
            className="rounded-full border border-foreground/15 px-3 py-1 transition hover:border-accent hover:text-accent"
          >
            Edit
          </button>
          <button
            onClick={toggleActive}
            className="rounded-full border border-foreground/15 px-3 py-1 transition hover:border-accent hover:text-accent"
          >
            {service.active ? "Hide" : "Show"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ServiceForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (d: Draft) => Promise<boolean>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => {
    setInvalid(null);
    setD((prev) => ({ ...prev, ...patch }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateDraft(d);
    if (problem) {
      setInvalid(problem);
      return;
    }
    setBusy(true);
    await onSubmit(d);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="block">
        <span className="mb-1 block text-sm">Name</span>
        <input
          className="input"
          value={d.name}
          onChange={(e) => set({ name: e.target.value })}
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">Description</span>
        <textarea
          className="input"
          rows={2}
          value={d.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>
      <div className="rounded-xl border border-foreground/10 bg-accent/5 px-4 py-3.5">
        <p className="text-sm text-muted">
          Split the service into what you&rsquo;re <em>doing</em> and what
          you&rsquo;re <em>waiting on</em>. During processing you&rsquo;re free,
          so the booking site can offer that window to another client. Leave
          processing and finish blank for a service that&rsquo;s one solid block.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="block">
            <span className="mb-1 block text-sm">
              Start (min)
              <span className="text-accent"> *</span>
            </span>
            {/* step="1", NOT step="5". With a step, the browser only accepts
                values of min + n*step — the old min="1" step="5" silently
                rejected 60 and 180 (the two most common salon durations) with
                a tooltip, which is why services couldn't be saved. */}
            <input
              type="number"
              min={MIN_DURATION}
              max={MAX_DURATION}
              step="1"
              required
              className="input w-28"
              value={d.start}
              onChange={(e) => set({ start: e.target.value })}
            />
            <span className="mt-1 block text-xs text-muted">You&rsquo;re busy</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Processing (min)</span>
            <input
              type="number"
              min="0"
              max={MAX_DURATION}
              step="1"
              className="input w-28"
              value={d.process}
              onChange={(e) => set({ process: e.target.value })}
            />
            <span className="mt-1 block text-xs text-muted">You&rsquo;re free</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Finish (min)</span>
            <input
              type="number"
              min="0"
              max={MAX_DURATION}
              step="1"
              className="input w-28"
              value={d.finish}
              onChange={(e) => set({ finish: e.target.value })}
            />
            <span className="mt-1 block text-xs text-muted">You&rsquo;re busy</span>
          </label>
          <div className="self-start pt-6 text-sm text-muted">
            Total{" "}
            <strong className="text-foreground">
              {durationLabel(
                (Number(d.start) || 0) +
                  (Number(d.process) || 0) +
                  (Number(d.finish) || 0),
              )}
            </strong>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="mb-1 block text-sm">
            Price ($)
            <span className="text-accent"> *</span>
          </span>
          <input
            type="number"
            min="0"
            step="1"
            required
            className="input w-28"
            value={d.price}
            onChange={(e) => set({ price: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Deposit ($)</span>
          <input
            type="number"
            min="0"
            step="1"
            className="input w-28"
            value={d.deposit}
            onChange={(e) => set({ deposit: e.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={d.price_is_from}
            onChange={(e) => set({ price_is_from: e.target.checked })}
          />
          Show price as “starting from”
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={d.active}
            onChange={(e) => set({ active: e.target.checked })}
          />
          Visible on booking page
        </label>
      </div>
      {invalid && (
        <p className="rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
          {invalid}
        </p>
      )}
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
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto text-sm text-accent-dark/70 hover:text-accent-dark"
          >
            Delete
          </button>
        )}
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
