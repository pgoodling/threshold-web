"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { durationLabel, priceLabel } from "../../lib/format";

type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  price_is_from: boolean;
  deposit_cents: number;
  active: boolean;
  sort_order: number;
};

type Draft = {
  name: string;
  description: string;
  duration: string; // minutes
  price: string; // dollars
  price_is_from: boolean;
  deposit: string; // dollars
  active: boolean;
};

const toDraft = (s: Service): Draft => ({
  name: s.name,
  description: s.description ?? "",
  duration: String(s.duration_minutes),
  price: String(Math.round(s.price_cents / 100)),
  price_is_from: s.price_is_from,
  deposit: s.deposit_cents ? String(Math.round(s.deposit_cents / 100)) : "",
  active: s.active,
});

const emptyDraft: Draft = {
  name: "",
  description: "",
  duration: "60",
  price: "",
  price_is_from: true,
  deposit: "",
  active: true,
};

function draftToRow(d: Draft) {
  return {
    name: d.name.trim(),
    description: d.description.trim() || null,
    duration_minutes: Math.max(1, parseInt(d.duration, 10) || 0),
    price_cents: Math.max(0, Math.round(parseFloat(d.price || "0") * 100)),
    price_is_from: d.price_is_from,
    deposit_cents: Math.max(0, Math.round(parseFloat(d.deposit || "0") * 100)),
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
        "id,name,description,duration_minutes,price_cents,price_is_from,deposit_cents,active,sort_order",
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
      setError(error.message);
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
      onError(error.message);
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
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.name.trim()) return;
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
      <div className="flex flex-wrap gap-4">
        <label className="block">
          <span className="mb-1 block text-sm">Duration (min)</span>
          <input
            type="number"
            min="1"
            step="5"
            className="input w-32"
            value={d.duration}
            onChange={(e) => set({ duration: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm">Price ($)</span>
          <input
            type="number"
            min="0"
            step="1"
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
