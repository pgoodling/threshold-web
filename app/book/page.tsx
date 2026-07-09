"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { supabase } from "../../lib/supabase";
import { stripePromise } from "../../lib/stripe";
import CardCollect from "./CardCollect";
import WalletCollect from "./WalletCollect";

const TZ = "America/New_York";
const MONTHS_AHEAD = 6; // how far out clients may book

type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  price_is_from: boolean;
};

const money = (cents: number) => `$${Math.round(cents / 100)}`;
const priceLabel = (s: Service) =>
  `${s.price_is_from ? "from " : ""}${money(s.price_cents)}`;
const durationLabel = (min: number) =>
  min >= 60
    ? `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ""}`
    : `${min} min`;

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const firstWeekday = (y: number, m: number) => new Date(y, m, 1).getDay();
const monthLabel = (y: number, m: number) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(y, m, 1),
  );

// salon-local day key (YYYY-MM-DD) of an ISO instant
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
const longWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

// today's parts in the salon's timezone
function salonNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}
const todayKey = () => {
  const n = salonNow();
  return keyOf(n.year, n.month, n.day);
};

export default function BookPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [services, setServices] = useState<Service[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [service, setService] = useState<Service | null>(null);

  const now = useMemo(salonNow, []);
  const [viewY, setViewY] = useState(now.year);
  const [viewM, setViewM] = useState(now.month);
  const [monthSlots, setMonthSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cardStage, setCardStage] = useState<"details" | "card">("details");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const photoPreviews = useMemo(
    () => photos.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
    [photos],
  );
  useEffect(() => {
    return () => photoPreviews.forEach((p) => URL.revokeObjectURL(p.url));
  }, [photoPreviews]);

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setPhotos((prev) => [...prev, ...picked].slice(0, 3));
  }

  // Load services once.
  useEffect(() => {
    supabase
      .from("services")
      .select("id,name,description,duration_minutes,price_cents,price_is_from")
      .eq("active", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (error) setServicesError(error.message);
        else setServices(data ?? []);
      });
  }, []);

  // Load open slots for the visible month whenever service or month changes.
  useEffect(() => {
    if (!service) return;
    const isThisMonth = viewY === now.year && viewM === now.month;
    const from = isThisMonth ? todayKey() : keyOf(viewY, viewM, 1);
    const to = keyOf(viewY, viewM, daysInMonth(viewY, viewM));
    setSlotsLoading(true);
    setSlotsError(null);
    setMonthSlots([]);
    supabase
      .rpc("get_available_slots", {
        p_service_id: service.id,
        p_from: from,
        p_to: to,
      })
      .then(({ data, error }) => {
        setSlotsLoading(false);
        if (error) setSlotsError(error.message);
        else setMonthSlots((data ?? []).map((r: { slot: string }) => r.slot));
      });
  }, [service, viewY, viewM, now.year, now.month]);

  // Group this month's slots by salon-local day.
  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const iso of monthSlots) {
      const k = dayKey(iso);
      (map.get(k) ?? map.set(k, []).get(k)!).push(iso);
    }
    return map;
  }, [monthSlots]);
  const daySlots = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  const viewIndex = viewY * 12 + viewM;
  const minIndex = now.year * 12 + now.month;
  const maxIndex = minIndex + MONTHS_AHEAD;
  const canPrev = viewIndex > minIndex;
  const canNext = viewIndex < maxIndex;
  function shiftMonth(delta: number) {
    const idx = viewIndex + delta;
    setViewY(Math.floor(idx / 12));
    setViewM(idx % 12);
    setSelectedDay(null);
    setSlot(null);
  }

  function chooseService(svc: Service) {
    setService(svc);
    setViewY(now.year);
    setViewM(now.month);
    setSelectedDay(null);
    setSlot(null);
    setCardStage("details");
    setClientSecret(null);
    setStep(2);
  }

  // Step 3a: collect contact info, then create a SetupIntent so the client
  // can save a card on file (no charge).
  async function continueToCard(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/stripe/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't start card entry.");
      setClientSecret(json.clientSecret);
      setCustomerId(json.customerId);
      setCardStage("card");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 3b: after the card is saved, create the booking (with the customer
  // linked) and upload any photos. Throws so the card form can surface errors.
  async function finishBooking() {
    if (!service || !slot) return;
    const { data, error } = await supabase.rpc("create_booking", {
      p_service_id: service.id,
      p_starts_at: slot,
      p_full_name: name.trim(),
      p_email: email.trim(),
      p_phone: phone.trim(),
      p_notes: notes.trim(),
      p_stripe_customer_id: customerId,
    });
    if (error) throw new Error(error.message);
    const appointmentId = (data as { appointment_id?: string } | null)
      ?.appointment_id;
    if (appointmentId && photos.length) {
      await Promise.all(
        photos.map((file, i) => {
          const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
          return supabase.storage
            .from("booking-photos")
            .upload(`${appointmentId}/${i + 1}.${ext}`, file, {
              contentType: file.type,
              upsert: true,
            });
        }),
      ).catch(() => {});
    }
    // Best-effort confirmation text — never blocks the booking.
    fetch("/api/sms/booking-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: phone.trim(),
        name: name.trim(),
        service: service.name,
        startsAt: slot,
      }),
    }).catch(() => {});
    setStep(4);
  }

  // Build the calendar grid cells (leading blanks + days).
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday(viewY, viewM); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth(viewY, viewM); d++) cells.push(d);
  const tKey = todayKey();

  return (
    <main className="min-h-screen">
      <header className="border-b border-foreground/10 bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" aria-label="Threshold home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/threshold-logos/threshold-wordmark-terracotta-transparent.svg"
              alt="Threshold — Studio by Evelyn"
              className="h-10 w-auto"
            />
          </a>
          <a href="/" className="text-sm text-muted hover:text-accent">
            ← Back to site
          </a>
        </nav>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <Stepper step={step} />

        {/* Step 1 — choose service */}
        {step === 1 && (
          <section aria-labelledby="s1">
            <h1 id="s1" className="font-display text-3xl">
              Book an appointment
            </h1>
            <p className="mt-2 text-muted">Choose a service to get started.</p>

            {servicesError && <ErrorNote>{servicesError}</ErrorNote>}
            {!servicesError && services.length === 0 && (
              <p className="mt-8 text-muted">Loading services…</p>
            )}

            <div className="mt-8 grid gap-4">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => chooseService(s)}
                  className="group rounded-2xl border border-foreground/10 bg-white p-6 text-left transition hover:border-accent hover:shadow-sm"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-xl group-hover:text-accent">
                      {s.name}
                    </h2>
                    <span className="whitespace-nowrap text-sm text-accent">
                      {priceLabel(s)}
                    </span>
                  </div>
                  {s.description && (
                    <p className="mt-2 text-sm text-muted">{s.description}</p>
                  )}
                  <p className="mt-3 text-xs uppercase tracking-wide text-muted">
                    {durationLabel(s.duration_minutes)}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Step 2 — choose date & time */}
        {step === 2 && service && (
          <section aria-labelledby="s2">
            <h1 id="s2" className="font-display text-3xl">
              Pick a time
            </h1>
            <p className="mt-2 text-muted">
              {service.name} · {durationLabel(service.duration_minutes)} ·{" "}
              {priceLabel(service)}
            </p>

            {/* Month calendar */}
            <div className="mt-8 rounded-2xl border border-foreground/10 bg-white p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => canPrev && shiftMonth(-1)}
                  disabled={!canPrev}
                  aria-label="Previous month"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition hover:bg-foreground/5 disabled:opacity-30"
                >
                  ‹
                </button>
                <span className="font-display text-lg">
                  {monthLabel(viewY, viewM)}
                </span>
                <button
                  type="button"
                  onClick={() => canNext && shiftMonth(1)}
                  disabled={!canNext}
                  aria-label="Next month"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition hover:bg-foreground/5 disabled:opacity-30"
                >
                  ›
                </button>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-muted">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                  if (d === null) return <div key={`b${i}`} />;
                  const k = keyOf(viewY, viewM, d);
                  const open = byDay.has(k);
                  const isToday = k === tKey;
                  const selected = k === selectedDay;
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!open}
                      onClick={() => {
                        setSelectedDay(k);
                        setSlot(null);
                      }}
                      className={`aspect-square rounded-lg text-sm transition ${
                        selected
                          ? "bg-accent text-white"
                          : open
                            ? "bg-accent/10 text-foreground hover:bg-accent/20"
                            : "text-foreground/25"
                      } ${isToday && !selected ? "ring-1 ring-accent/40" : ""}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>

              {slotsLoading && (
                <p className="mt-4 text-center text-sm text-muted">
                  Finding open times…
                </p>
              )}
              {slotsError && <ErrorNote>{slotsError}</ErrorNote>}
              {!slotsLoading && !slotsError && byDay.size === 0 && (
                <p className="mt-4 text-center text-sm text-muted">
                  No openings this month — try the next one.
                </p>
              )}
            </div>

            {/* Times for the selected day */}
            {selectedDay && (
              <div className="mt-6">
                <p className="text-sm text-muted">
                  {new Intl.DateTimeFormat("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  }).format(new Date(`${selectedDay}T12:00:00`))}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {daySlots.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => {
                        setSlot(iso);
                        setStep(3);
                      }}
                      className="rounded-xl border border-foreground/10 bg-white py-3 text-sm transition hover:border-accent hover:text-accent"
                    >
                      {timeLabel(iso)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-8 text-sm text-muted hover:text-accent"
            >
              ← Change service
            </button>
          </section>
        )}

        {/* Step 3 — details */}
        {step === 3 && service && slot && (
          <section aria-labelledby="s3">
            <h1 id="s3" className="font-display text-3xl">
              Your details
            </h1>
            <div className="mt-4 rounded-2xl border border-foreground/10 bg-white p-5">
              <p className="font-medium">{service.name}</p>
              <p className="mt-1 text-sm text-muted">{longWhen(slot)}</p>
            </div>

            {cardStage === "details" ? (
            <form onSubmit={continueToCard} className="mt-8 grid gap-5">
              <Field label="Name" required>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  autoComplete="name"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  autoComplete="email"
                />
              </Field>
              <Field label="Phone" required>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                  autoComplete="tel"
                />
              </Field>
              <Field label="Anything Evelyn should know? (optional)">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="input"
                />
              </Field>

              <div>
                <span className="mb-1 block text-sm">
                  Photos (optional)
                </span>
                <p className="mb-2 text-xs text-muted">
                  Add a photo of your hair now or any inspiration — up to 3.
                </p>
                <div className="flex flex-wrap gap-3">
                  {photoPreviews.map((p, i) => (
                    <div key={p.url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={`Upload ${i + 1}`}
                        className="h-20 w-20 rounded-xl object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPhotos((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label="Remove photo"
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs text-background"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {photos.length < 3 && (
                    <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border border-dashed border-foreground/25 text-2xl text-muted transition hover:border-accent hover:text-accent">
                      +
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          addPhotos(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted">
                Email is optional. We&apos;ll save a card to hold your
                appointment — you won&apos;t be charged now.
              </p>

              {submitError && <ErrorNote>{submitError}</ErrorNote>}

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-accent px-8 py-3 text-white transition hover:bg-accent-dark disabled:opacity-60"
                >
                  {submitting ? "…" : "Continue to card"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep(2);
                    setCardStage("details");
                    setClientSecret(null);
                  }}
                  className="text-sm text-muted hover:text-accent"
                >
                  ← Change time
                </button>
              </div>
            </form>
            ) : (
              <div className="mt-8">
                <p className="mb-4 text-sm text-muted">
                  Save a card to hold your appointment. You won&apos;t be charged
                  now.
                </p>
                {clientSecret && (
                  <div className="grid gap-4">
                    <Elements
                      stripe={stripePromise}
                      options={{
                        mode: "setup",
                        currency: "usd",
                        appearance: {
                          theme: "flat",
                          variables: { colorPrimary: "#bd6b4d" },
                        },
                      }}
                    >
                      <WalletCollect
                        clientSecret={clientSecret}
                        onConfirmed={finishBooking}
                      />
                    </Elements>
                    <Elements
                      stripe={stripePromise}
                      options={{
                        appearance: {
                          theme: "flat",
                          variables: { colorPrimary: "#bd6b4d" },
                        },
                      }}
                    >
                      <CardCollect
                        clientSecret={clientSecret}
                        onConfirmed={finishBooking}
                      />
                    </Elements>
                  </div>
                )}
                {submitError && <ErrorNote>{submitError}</ErrorNote>}
                <button
                  type="button"
                  onClick={() => setCardStage("details")}
                  className="mt-4 text-sm text-muted hover:text-accent"
                >
                  ← Back to details
                </button>
              </div>
            )}
          </section>
        )}

        {/* Step 4 — confirmed */}
        {step === 4 && service && slot && (
          <section aria-labelledby="s4" className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 id="s4" className="mt-6 font-display text-3xl">
              You&apos;re booked!
            </h1>
            <p className="mt-3 text-muted">
              {service.name}
              <br />
              {longWhen(slot)}
            </p>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted">
              We&apos;ve saved your appointment. Evelyn will see you then — a
              confirmation is on the way.
            </p>
            <a
              href="/"
              className="mt-8 inline-block rounded-full bg-accent px-8 py-3 text-white transition hover:bg-accent-dark"
            >
              Back to site
            </a>
          </section>
        )}
      </div>
    </main>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Service", "Time", "Details", "Done"];
  return (
    <ol className="mb-10 flex items-center gap-2 text-xs">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                active || done
                  ? "bg-accent text-white"
                  : "bg-foreground/10 text-muted"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={active ? "text-foreground" : "text-muted"}>
              {label}
            </span>
            {n < labels.length && <span className="mx-1 text-foreground/20">—</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
      {children}
    </p>
  );
}
