"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  salonWallToISO,
  salonDateTimeLocal,
  plusWeeksLocal,
  dayKey,
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
  no_show_fee_cents: number | null;
  no_show_charged_at: string | null;
  start_minutes: number | null; // null = inherit the service's timing
  process_minutes: number | null;
  finish_minutes: number | null;
  block_processing: boolean | null;
  clients: {
    full_name: string;
    phone: string | null;
    email: string | null;
    stripe_customer_id: string | null;
  } | null;
  services: {
    name: string;
    duration_minutes: number;
    start_minutes: number | null;
    process_minutes: number | null;
    finish_minutes: number | null;
  } | null;
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
    "view" | "reschedule" | "rebook" | "checkout" | "noShowFee" | "timing"
  >("view");
  const [seg, setSeg] = useState({ start: "", process: "", finish: "" });
  const [blockGap, setBlockGap] = useState(false);
  const [when, setWhen] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    supabase
      .from("appointments")
      // `*` so new payment columns are tolerated even before the migration runs.
      .select(
        "*,clients(full_name,phone,email,stripe_customer_id),services(name,duration_minutes,start_minutes,process_minutes,finish_minutes)",
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
    // A no-show should never quietly disappear: drop a dated follow-up task on
    // the client's file so Evelyn circles back (and can charge the fee later).
    // Best-effort — don't block the status change if tasks aren't migrated yet.
    if (status === "no_show" && appt) {
      const name = appt.clients?.full_name ?? "client";
      await supabase.from("tasks").insert({
        title: `Follow up: ${name} no-showed`,
        client_id: appt.client_id,
        start_date: dayKey(new Date().toISOString()),
        due_date: dayKey(new Date().toISOString()),
        recurrence: "none",
      });
    }
    onChanged?.();
    if (status === "cancelled") onClose();
    else load();
  }

  // Effective timing for this appointment: its own overrides, else the service.
  function effectiveSegments(a: Detail) {
    return {
      start: a.start_minutes ?? a.services?.start_minutes ?? 0,
      process: a.process_minutes ?? a.services?.process_minutes ?? 0,
      finish: a.finish_minutes ?? a.services?.finish_minutes ?? 0,
    };
  }

  function openTiming() {
    if (!appt) return;
    const e = effectiveSegments(appt);
    setSeg({
      start: e.start ? String(e.start) : "",
      process: e.process ? String(e.process) : "",
      finish: e.finish ? String(e.finish) : "",
    });
    setBlockGap(!!appt.block_processing);
    setError(null);
    setMode("timing");
  }

  async function saveTiming() {
    if (!appt) return;
    const start = parseInt(seg.start, 10);
    if (!Number.isInteger(start) || start < 5) {
      setError("Start time is required — at least 5 minutes.");
      return;
    }
    const process = seg.process.trim() ? parseInt(seg.process, 10) : 0;
    const finish = seg.finish.trim() ? parseInt(seg.finish, 10) : 0;
    if (!Number.isInteger(process) || process < 0 || !Number.isInteger(finish) || finish < 0) {
      setError("Processing and finish must be whole minutes, or left blank.");
      return;
    }
    if (finish > 0 && process === 0) {
      setError("Add processing time before finish time.");
      return;
    }
    setBusy(true);
    setError(null);
    // ends_at and the busy blocks are recomputed by trigger, so we only write
    // the segments. A clash with a neighbouring appointment surfaces here as an
    // exclusion violation from appointment_busy.
    const { error: err } = await supabase
      .from("appointments")
      .update({
        start_minutes: start,
        process_minutes: process,
        finish_minutes: finish,
        block_processing: blockGap,
      })
      .eq("id", appointmentId);
    setBusy(false);
    if (err) {
      setError(
        /exclusion|overlap|conflict/i.test(err.message)
          ? "That timing collides with another appointment."
          : err.message,
      );
      return;
    }
    setMode("view");
    onChanged?.();
    load();
  }

  async function toggleBlockGap(next: boolean) {
    setBusy(true);
    const { error: err } = await supabase
      .from("appointments")
      .update({ block_processing: next })
      .eq("id", appointmentId);
    setBusy(false);
    if (err) {
      setError(
        /exclusion|overlap|conflict/i.test(err.message)
          ? "Someone is already booked in that window."
          : err.message,
      );
      return;
    }
    onChanged?.();
    load();
  }

  function openNoShowFee() {
    if (!appt) return;
    // Prefill the full service price — the posted policy allows up to that, and
    // Evelyn can dial it down. She charges nothing unless she taps through.
    const cents = appt.price_cents ?? 0;
    setAmount(cents ? (cents / 100).toFixed(2) : "");
    setError(null);
    setMode("noShowFee");
  }

  async function chargeNoShowFee() {
    if (!appt) return;
    const cents = Math.round(parseFloat(amount || "0") * 100);
    if (!cents || cents <= 0) {
      setError("Enter an amount to charge.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/stripe/charge-no-show", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ appointmentId: appt.id, amountCents: cents }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "The card couldn't be charged.");
      setMode("view");
      onChanged?.();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The card couldn't be charged.");
    } finally {
      setBusy(false);
    }
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
              <div className="mt-4 flex flex-wrap items-end gap-2 text-sm">
                {/* Separate date and time inputs rather than one
                    datetime-local — iOS renders the combined control poorly,
                    and these two are reliable on every phone she uses. */}
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Date</span>
                  <input
                    type="date"
                    className="input w-auto"
                    value={when.split("T")[0] ?? ""}
                    onChange={(e) =>
                      setWhen(`${e.target.value}T${when.split("T")[1] ?? "09:00"}`)
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Time</span>
                  <input
                    type="time"
                    className="input w-auto"
                    value={when.split("T")[1] ?? ""}
                    onChange={(e) =>
                      setWhen(`${when.split("T")[0] ?? ""}T${e.target.value}`)
                    }
                  />
                </label>
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
                baseISO={appt.starts_at}
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
            ) : mode === "timing" ? (
              <div className="mt-4 grid gap-3">
                <p className="text-sm text-muted">
                  <span className="font-medium text-foreground">
                    This appointment only
                  </span>{" "}
                  — {appt.clients?.full_name?.split(" ")[0] ?? "this client"} on{" "}
                  {dayKey(appt.starts_at)}. It won&rsquo;t change{" "}
                  {appt.services?.name ?? "the service"} for anyone else. To
                  change it for every future booking, edit the service under
                  Services instead.
                </p>
                <p className="text-sm text-muted">
                  During processing you&rsquo;re free and the slot can be booked
                  by someone else — tick the box to keep it for yourself.
                </p>
                {appt.services && (
                  <p className="text-xs text-muted">
                    {appt.services.name} default:{" "}
                    {appt.services.start_minutes ?? 0} min start
                    {appt.services.process_minutes
                      ? ` · ${appt.services.process_minutes} min processing`
                      : ""}
                    {appt.services.finish_minutes
                      ? ` · ${appt.services.finish_minutes} min finish`
                      : ""}
                    {(appt.start_minutes !== null ||
                      appt.process_minutes !== null ||
                      appt.finish_minutes !== null) && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => {
                            const s = appt.services!;
                            setSeg({
                              start: s.start_minutes ? String(s.start_minutes) : "",
                              process: s.process_minutes
                                ? String(s.process_minutes)
                                : "",
                              finish: s.finish_minutes
                                ? String(s.finish_minutes)
                                : "",
                            });
                          }}
                          className="text-accent hover:underline"
                        >
                          reset to default
                        </button>
                      </>
                    )}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      ["Start", "start", true],
                      ["Processing", "process", false],
                      ["Finish", "finish", false],
                    ] as const
                  ).map(([label, k, req]) => (
                    <label key={k} className="block">
                      <span className="mb-1 block text-sm">
                        {label} (min)
                        {req && <span className="text-accent"> *</span>}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="input w-24"
                        value={seg[k]}
                        onChange={(e) =>
                          setSeg((p) => ({ ...p, [k]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={blockGap}
                    onChange={(e) => setBlockGap(e.target.checked)}
                  />
                  Keep the processing time for myself
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveTiming}
                    disabled={busy}
                    className="rounded-full bg-accent px-6 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Save timing"}
                  </button>
                  <button
                    onClick={() => {
                      setError(null);
                      setMode("view");
                    }}
                    className="text-sm text-muted hover:text-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : mode === "noShowFee" ? (
              <div className="mt-4 grid gap-3">
                <p className="text-sm text-muted">
                  Charge {appt.clients?.full_name ?? "this client"}&rsquo;s card
                  on file. Your policy allows up to the full service price
                  {appt.price_cents ? ` (${money(appt.price_cents)})` : ""}.
                </p>
                <label className="block">
                  <span className="mb-1 block text-sm">Fee ($)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input w-32"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={chargeNoShowFee}
                    disabled={busy}
                    className="rounded-full bg-accent px-6 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-60"
                  >
                    {busy ? "Charging…" : "Charge this card"}
                  </button>
                  <button
                    onClick={() => {
                      setError(null);
                      setMode("view");
                    }}
                    className="text-sm text-muted hover:text-accent"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {appt.status === "no_show" &&
                  (appt.no_show_charged_at ? (
                    <span className="rounded-full bg-foreground/5 px-3 py-1.5 text-muted">
                      Fee charged
                      {appt.no_show_fee_cents
                        ? ` · ${money(appt.no_show_fee_cents)}`
                        : ""}
                    </span>
                  ) : (
                    appt.clients?.stripe_customer_id && (
                      <ActionBtn primary onClick={openNoShowFee}>
                        Charge no-show fee
                      </ActionBtn>
                    )
                  ))}
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
                        // Start from the current appointment time. This used to
                        // clear the field: desktop renders an empty
                        // datetime-local as typable mm/dd/yyyy slots, but iOS
                        // renders it as effectively nothing, so Reschedule
                        // looked broken on her phone.
                        setWhen(salonDateTimeLocal(appt.starts_at));
                        setMode("reschedule");
                      }}
                    >
                      Reschedule
                    </ActionBtn>
                  )}
                <ActionBtn onClick={() => setMode("rebook")}>Rebook</ActionBtn>
                {appt.status !== "checked_out" &&
                  appt.status !== "completed" &&
                  appt.status !== "cancelled" && (
                    <ActionBtn onClick={openTiming}>Timing</ActionBtn>
                  )}
                {/* One-tap guard for the common case: she wants this gap back. */}
                {effectiveSegments(appt).process > 0 &&
                  appt.status !== "checked_out" &&
                  appt.status !== "completed" && (
                    <ActionBtn
                      onClick={() => toggleBlockGap(!appt.block_processing)}
                    >
                      {appt.block_processing
                        ? "Free up processing"
                        : "Block processing"}
                    </ActionBtn>
                  )}
                {appt.status !== "no_show" &&
                  appt.status !== "checked_out" &&
                  appt.status !== "completed" && (
                    <ActionBtn onClick={() => setStatus("no_show")}>
                      No-show
                    </ActionBtn>
                  )}
                {appt.status !== "cancelled" &&
                  appt.status !== "checked_out" &&
                  appt.status !== "completed" &&
                  (confirmCancel ? (
                    // Cancelling frees the slot and drops the client off the
                    // day — too destructive for a single mistaken tap on a
                    // phone, where these buttons sit close together.
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">
                        Cancel this appointment?
                      </span>
                      <ActionBtn
                        danger
                        onClick={() => {
                          setConfirmCancel(false);
                          setStatus("cancelled");
                        }}
                      >
                        Yes, cancel it
                      </ActionBtn>
                      <ActionBtn onClick={() => setConfirmCancel(false)}>
                        Keep it
                      </ActionBtn>
                    </span>
                  ) : (
                    <ActionBtn danger onClick={() => setConfirmCancel(true)}>
                      Cancel
                    </ActionBtn>
                  ))}
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
  baseISO,
  heading = "Book their next visit:",
  defaultDate = "",
  defaultTime = "",
  onDone,
  onCancel,
}: {
  clientId: string;
  // The visit being rebooked from — enables "+4 / +6 weeks" prebook presets.
  baseISO?: string;
  heading?: string;
  // Date and time are separate so the calendar can prefill a day on its own —
  // clicking "+ New" while looking at Tuesday knows the day but not the time,
  // and a single datetime-local input can't hold one without the other.
  defaultDate?: string;
  defaultTime?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [services, setServices] = useState<SvcOpt[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const when = date && time ? `${date}T${time}` : "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setWhen = (v: string) => {
    const [d, t] = v.split("T");
    setDate(d ?? "");
    setTime(t ?? "");
  };

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
      <p className="text-sm text-muted">{heading}</p>
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
      {baseISO && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Prebook:</span>
          {[4, 6].map((wk) => (
            <button
              key={wk}
              type="button"
              onClick={() => setWhen(plusWeeksLocal(baseISO, wk))}
              className="rounded-full border border-foreground/15 px-3 py-1 transition hover:border-accent hover:text-accent"
            >
              +{wk} weeks
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Date</span>
          <input
            type="date"
            className="input w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Time</span>
          <input
            type="time"
            className="input w-auto"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>
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
