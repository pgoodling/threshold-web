"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { salonWallToISO } from "../../lib/format";
import AppointmentPhotos from "./AppointmentPhotos";

// One appointment detail, shown as a centered modal, used everywhere an
// appointment is clicked (calendar, list, overview, client history).
// Self-fetches by id so callers just pass an id + callbacks.

const fullWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

type Detail = {
  id: string;
  client_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  clients: {
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  services: { name: string; duration_minutes: number } | null;
};

export function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-foreground/40"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ApptDetailModal({
  appointmentId,
  onClose,
  onChanged,
  onOpenClient,
}: {
  appointmentId: string;
  onClose: () => void;
  onChanged?: () => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const [appt, setAppt] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "reschedule" | "rebook">("view");
  const [when, setWhen] = useState("");

  const load = useCallback(() => {
    supabase
      .from("appointments")
      .select(
        "id,client_id,starts_at,ends_at,status,notes,clients(full_name,phone,email),services(name,duration_minutes)",
      )
      .eq("id", appointmentId)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setAppt(data as unknown as Detail);
      });
  }, [appointmentId]);

  useEffect(load, [load]);

  async function setStatus(status: string) {
    const { error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointmentId);
    if (error) {
      setError(error.message);
      return;
    }
    onChanged?.();
    if (status === "cancelled") onClose();
    else load();
  }

  async function reschedule() {
    if (!when || !appt) return;
    const dur = appt.services?.duration_minutes ?? 60;
    const startsISO = salonWallToISO(when);
    const endsISO = new Date(
      new Date(startsISO).getTime() + dur * 60000,
    ).toISOString();
    const { error } = await supabase
      .from("appointments")
      .update({ starts_at: startsISO, ends_at: endsISO })
      .eq("id", appointmentId);
    if (error) {
      setError(
        error.message.includes("overlap") || error.message.includes("exclusion")
          ? "That time overlaps another appointment."
          : error.message,
      );
      return;
    }
    setMode("view");
    onChanged?.();
    load();
  }

  const contactCls =
    "rounded-full border border-foreground/15 px-4 py-1.5 text-sm transition hover:border-accent hover:text-accent";

  return (
    <Modal onClose={onClose}>
      <div className="rounded-2xl border border-accent/30 bg-white p-5 shadow-xl">
        {!appt ? (
          <p className="text-sm text-muted">{error ?? "Loading…"}</p>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-xl">
                  {appt.clients?.full_name}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {appt.services?.name} · {fullWhen(appt.starts_at)} ·{" "}
                  <span className="capitalize">{appt.status}</span>
                </p>
                {appt.notes && (
                  <p className="mt-2 text-sm text-muted">“{appt.notes}”</p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-muted hover:text-accent"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {appt.clients?.phone && (
                <a href={`tel:${appt.clients.phone}`} className={contactCls}>
                  Call
                </a>
              )}
              {appt.clients?.phone && (
                <a href={`sms:${appt.clients.phone}`} className={contactCls}>
                  Text
                </a>
              )}
              {appt.clients?.email && (
                <a href={`mailto:${appt.clients.email}`} className={contactCls}>
                  Email
                </a>
              )}
              {onOpenClient && (
                <button
                  onClick={() => onOpenClient(appt.client_id)}
                  className={contactCls}
                >
                  View profile
                </button>
              )}
            </div>

            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                Client photos — their hair now / inspiration
              </p>
              <AppointmentPhotos appointmentId={appt.id} />
            </div>

            {error && <p className="mt-4 text-sm text-accent-dark">{error}</p>}

            {mode === "reschedule" ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="datetime-local"
                  className="input w-auto"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
                <button
                  onClick={reschedule}
                  className="rounded-full bg-accent px-4 py-2 text-white hover:bg-accent-dark"
                >
                  Save
                </button>
                <button
                  onClick={() => setMode("view")}
                  className="text-muted hover:text-accent"
                >
                  Cancel
                </button>
              </div>
            ) : mode === "rebook" ? (
              <RebookForm
                clientId={appt.client_id}
                onDone={() => {
                  setMode("view");
                  onChanged?.();
                }}
                onCancel={() => setMode("view")}
              />
            ) : (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {appt.status !== "confirmed" && (
                  <ActionBtn onClick={() => setStatus("confirmed")}>
                    Confirm
                  </ActionBtn>
                )}
                <ActionBtn
                  onClick={() => {
                    setWhen("");
                    setMode("reschedule");
                  }}
                >
                  Reschedule
                </ActionBtn>
                <ActionBtn onClick={() => setMode("rebook")}>Rebook</ActionBtn>
                <ActionBtn onClick={() => setStatus("completed")}>
                  Completed
                </ActionBtn>
                <ActionBtn onClick={() => setStatus("no_show")}>
                  No-show
                </ActionBtn>
                <ActionBtn danger onClick={() => setStatus("cancelled")}>
                  Cancel
                </ActionBtn>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

type SvcOpt = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
};

export function RebookForm({
  clientId,
  onDone,
  onCancel,
}: {
  clientId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [services, setServices] = useState<SvcOpt[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [when, setWhen] = useState("");
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

  async function submit() {
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
    if (error)
      setError(
        error.message.includes("overlap") || error.message.includes("exclusion")
          ? "That time overlaps another appointment."
          : error.message,
      );
    else onDone();
  }

  return (
    <div className="mt-4 grid gap-3">
      <p className="text-sm text-muted">Book their next visit:</p>
      <select
        className="input"
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value)}
      >
        <option value="">Choose a service…</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        className="input w-auto"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />
      {error && <p className="text-sm text-accent-dark">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-60"
        >
          {busy ? "Booking…" : "Book it"}
        </button>
        <button
          onClick={onCancel}
          className="text-sm text-muted hover:text-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 transition ${
        danger
          ? "border-accent-dark/30 text-accent-dark hover:bg-accent/5"
          : "border-foreground/15 hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}
