"use client";

import { useState } from "react";
import Link from "next/link";
import { CANCEL_NOTICE_HOURS } from "../../../lib/policy";

// Cancel, and only cancel.
//
// Rescheduling means handing a client the booking calendar again and hoping
// their old slot and their new one don't collide — worth building, but not
// before opening. Text or call covers it, and a reschedule request is a
// conversation Evelyn would rather have anyway.

const SALON_PHONE = "(937) 936-2138";
const SALON_TEL = "+19379362138";

export default function CancelPanel({
  appointmentId,
  startsAt,
  live,
  noticeHours = CANCEL_NOTICE_HOURS,
}: {
  appointmentId: string;
  startsAt: string;
  /** Still booked or confirmed — a fact about the row, not the clock. */
  live: boolean;
  /** The window this client was quoted when they booked, stamped on the row.
   *  Passed in rather than read from the setting, so shortening the policy in
   *  March can't retroactively shorten what February's client was promised. */
  noticeHours?: number;
}) {
  // Read once on mount rather than every render. The cutoff shown here is a
  // courtesy; /api/appointments/cancel is what actually enforces it, so this
  // being a few seconds stale can't let a late cancel through.
  const [now] = useState(() => Date.now());
  const hoursAway = (new Date(startsAt).getTime() - now) / 3_600_000;
  const canCancel = live && hoursAway >= noticeHours;

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/appointments/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(
        json.error === "too_late"
          ? `That's now inside ${noticeHours} hours — please text or call Evelyn.`
          : "Something went wrong. Please text or call Evelyn.",
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-foreground/15 bg-white p-5">
        <p className="font-display text-lg">That&apos;s cancelled</p>
        <p className="mt-2 text-sm text-muted">
          Nothing more to do, and there&apos;s no charge. Book again whenever
          you&apos;re ready.
        </p>
        <Link
          href="/book"
          className="mt-4 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
        >
          Book another appointment
        </Link>
      </div>
    );
  }

  // Past the cutoff. Not a refusal — a redirect to the person who can actually
  // decide, since what happens about the fee is hers to judge.
  if (!canCancel) {
    return (
      <div className="rounded-xl border border-foreground/15 bg-white p-5">
        <p className="font-display text-lg">Need to change this?</p>
        <p className="mt-2 text-sm text-muted">
          {hoursAway > 0
            ? `It's within ${noticeHours} hours now, so please text or call Evelyn directly — she'll sort it out with you.`
            : "Please text or call Evelyn directly and she'll sort it out with you."}
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <a
            href={`sms:${SALON_TEL}`}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
          >
            Text the salon
          </a>
          <a
            href={`tel:${SALON_TEL}`}
            className="self-center text-sm text-accent-dark underline decoration-accent underline-offset-4"
          >
            {SALON_PHONE}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-foreground/15 bg-white p-5">
      <p className="font-display text-lg">Need to change this?</p>
      <p className="mt-2 text-sm text-muted">
        To move it to another time, text or call — that way Evelyn can find you
        something that works. To cancel outright, you can do it here.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <a
          href={`sms:${SALON_TEL}`}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
        >
          Text to reschedule
        </a>
        <a
          href={`tel:${SALON_TEL}`}
          className="text-sm text-accent-dark underline decoration-accent underline-offset-4"
        >
          {SALON_PHONE}
        </a>
      </div>

      <div className="mt-5 border-t border-foreground/10 pt-4">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm">Cancel this appointment?</span>
            <button
              onClick={cancel}
              disabled={busy}
              className="text-sm font-medium text-[#8f3f4a] underline decoration-[#8f3f4a]/40 underline-offset-4 disabled:opacity-60"
            >
              {busy ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-sm text-muted hover:text-foreground"
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-sm text-muted transition hover:text-[#8f3f4a]"
          >
            Cancel this appointment
          </button>
        )}
        {error && <p className="mt-3 text-sm text-accent-dark">{error}</p>}
      </div>
    </div>
  );
}
