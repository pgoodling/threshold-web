"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  salonWallToISO,
  statusLabel,
  statusPillClass,
  liveStatus,
  paymentLabel,
  money,
  PAYMENT_METHODS,
} from "../../lib/format";
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
  price_cents: number | null;
  paid_cents: number | null;
  payment_method: string | null;
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
  const [mode, setMode] = useState<
    "view" | "reschedule" | "rebook" | "checkout"
  >("view");
  const [when, setWhen] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    supabase
      .from("appointments")
      // `*` so new payment columns are tolerated even before the migration runs.
      .select(
        "*,clients(full_name,phone,email),services(name,duration_minutes)",
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
    const patch: Record<string, unknown> = { status };
    if (status === "checked_in") patch.checked_in_at = new Date().toISOString();
    const { error } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", appointmentId);
    if (error) {
      setError(error.message);
      return;
    }
    onChanged?.();
    if (status === "cancelled") onClose();
    else load();
  }

  function openCheckout() {
    if (!appt) return;
    const cents = appt.paid_cents ?? appt.price_cents ?? 0;
    setAmount(cents ? (cents / 100).toFixed(2) : "");
    setMethod(appt.payment_method ?? "card");
    setError(null);
    setMode("checkout");
  }

  async function checkOut() {
    if (!method) return;
    const dollars = parseFloat(amount);
    if (Number.isNaN(dollars) || dollars < 0) {
      setError("Enter the amount paid.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("appointments")
      .update({
        status: "checked_out",
        paid_cents: Math.round(dollars * 100),
        payment_method: method,
        checked_out_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMode("view");
    onChanged?.();
    load();
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
                <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-muted">
                  <span>
                    {appt.services?.name} · {fullWhen(appt.starts_at)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${statusPillClass(liveStatus(appt.status, appt.starts_at))}`}
                  >
                    {statusLabel(liveStatus(appt.status, appt.starts_at))}
                  </span>
                </p>
                {(appt.status === "checked_out" ||
                  appt.status === "completed") &&
                  appt.paid_cents != null && (
                    <p className="mt-1 text-sm text-accent">
                      Paid {money(appt.paid_cents)}
                      {appt.payment_method &&
                        ` · ${paymentLabel(appt.payment_method)}`}
                    </p>
                  )}
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
            ) : mode === "checkout" ? (
              <div className="mt-4 grid gap-3">
                <p className="text-sm text-muted">
                  Check out — record the payment:
                </p>
                <label className="text-sm">
                  <span className="mb-1 block">Amount paid</span>
                  <div className="flex items-center gap-1">
                    <span className="text-muted">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="input w-32"
                      autoFocus
                    />
                  </div>
                </label>
                <div>
                  <span className="mb-1 block text-sm">Paid with</span>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setMethod(m.value)}
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                          method === m.value
                            ? "border-accent bg-accent text-white"
                            : "border-foreground/15 hover:border-accent"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={checkOut}
                    disabled={busy || !method}
                    className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Check out & mark paid"}
                  </button>
                  <button
                    onClick={() => setMode("view")}
                    className="text-sm text-muted hover:text-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {appt.status === "booked" && (
                  <ActionBtn onClick={() => setStatus("confirmed")}>
                    Confirm
                  </ActionBtn>
                )}
                {(appt.status === "booked" ||
                  appt.status === "confirmed" ||
                  appt.status === "no_show") && (
                  <ActionBtn primary onClick={() => setStatus("checked_in")}>
                    Check in
                  </ActionBtn>
                )}
                {appt.status === "checked_in" && (
                  <>
                    <ActionBtn primary onClick={openCheckout}>
                      Check out
                    </ActionBtn>
                    <ActionBtn onClick={() => setStatus("confirmed")}>
                      Undo check-in
                    </ActionBtn>
                  </>
                )}
                {(appt.status === "checked_out" ||
                  appt.status === "completed") && (
                  <>
                    <ActionBtn onClick={openCheckout}>Edit payment</ActionBtn>
                    <ActionBtn onClick={() => setStatus("checked_in")}>
                      Undo check-out
                    </ActionBtn>
                  </>
                )}
                {appt.status !== "checked_out" &&
                  appt.status !== "completed" && (
                    <ActionBtn
                      onClick={() => {
                        setWhen("");
                        setMode("reschedule");
                      }}
                    >
                      Reschedule
                    </ActionBtn>
                  )}
                <ActionBtn onClick={() => setMode("rebook")}>Rebook</ActionBtn>
                {appt.status !== "no_show" &&
                  appt.status !== "checked_out" &&
                  appt.status !== "completed" && (
                    <ActionBtn onClick={() => setStatus("no_show")}>
                      No-show
                    </ActionBtn>
                  )}
                {appt.status !== "cancelled" &&
                  appt.status !== "checked_out" &&
                  appt.status !== "completed" && (
                    <ActionBtn danger onClick={() => setStatus("cancelled")}>
                      Cancel
                    </ActionBtn>
                  )}
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
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 transition ${
        primary
          ? "border-accent bg-accent text-white hover:bg-accent-dark"
          : danger
            ? "border-accent-dark/30 text-accent-dark hover:bg-accent/5"
            : "border-foreground/15 hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}
