"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { toE164 } from "../../lib/phone";
import { whenLabel } from "../../lib/format";
import { welcomeConfirmText, reminderText } from "../../lib/smsTemplates";
import Rail from "./Rail";

// The texts that have to go out by hand until A2P clears.
//
// Same shape as the Outreach sweep, and for the same reason: the app can't send
// these, so it writes the message, keeps the list, and remembers who's done.
// She taps a row, her Messages app opens with the text already written, and she
// presses send. Nothing leaves the salon number — it goes from her own phone.
//
// Two lists, because they're two different jobs:
//
//   Confirm    every upcoming appointment that's never had a confirmation.
//              A one-off catch-up: everyone booked before texting worked.
//   Remind     anyone starting in the next day and a bit. A daily habit.
//
// Marking one done stamps the same columns the automated cron uses, so when
// A2P clears nobody gets texted twice about the same appointment.

type Row = {
  id: string;
  starts_at: string;
  status: string;
  confirm_sms_sent_at: string | null;
  reminder_sms_sent_at: string | null;
  clients: { full_name: string; phone: string | null } | null;
  services: { name: string } | null;
};

// How far ahead the reminder list looks. A day and a bit, so an appointment at
// 9am tomorrow is already on the list when she checks at teatime today.
const REMIND_AHEAD_HOURS = 30;

const smsHref = (phone: string, body: string) =>
  `sms:${toE164(phone)}?&body=${encodeURIComponent(body)}`;

export default function Texts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"confirm" | "remind">("confirm");

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("appointments")
      .select(
        "id,starts_at,status,confirm_sms_sent_at,reminder_sms_sent_at,clients(full_name,phone),services(name)",
      )
      .gte("starts_at", new Date().toISOString())
      .in("status", ["booked", "confirmed"])
      .order("starts_at")
      .then(({ data, error: err }) => {
        setLoading(false);
        if (err) {
          // The column is the only new thing here; its absence means 0029
          // hasn't run.
          setUnavailable(/confirm_sms_sent_at|column/i.test(err.message));
          if (!/confirm_sms_sent_at|column/i.test(err.message))
            setError(err.message);
          return;
        }
        setRows((data ?? []) as unknown as Row[]);
      });
  }, []);

  useEffect(load, [load]);

  // Read once on mount rather than every render — "due in the next 30 hours"
  // doesn't need to be accurate to the millisecond, and calling the clock during
  // render makes the component impure.
  const [nowMs] = useState(() => Date.now());

  const { toConfirm, toRemind } = useMemo(() => {
    const cutoff = nowMs + REMIND_AHEAD_HOURS * 3600 * 1000;
    return {
      toConfirm: rows.filter((r) => !r.confirm_sms_sent_at && r.clients?.phone),
      toRemind: rows.filter(
        (r) =>
          !r.reminder_sms_sent_at &&
          r.clients?.phone &&
          new Date(r.starts_at).getTime() <= cutoff,
      ),
    };
  }, [rows, nowMs]);

  async function mark(row: Row, kind: "confirm" | "remind", sent: boolean) {
    const column =
      kind === "confirm" ? "confirm_sms_sent_at" : "reminder_sms_sent_at";
    const when = sent ? new Date().toISOString() : null;

    // Optimistic: she's already in her Messages app by the time she taps this,
    // and a row that lingers gets tapped twice.
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, [column]: when } : r)),
    );

    const { error: err } = await supabase
      .from("appointments")
      .update({ [column]: when })
      .eq("id", row.id);
    if (err) {
      setError(err.message);
      load();
    }
  }

  function bodyFor(row: Row, kind: "confirm" | "remind") {
    const name = row.clients?.full_name ?? null;
    const service = row.services?.name ?? "your appointment";
    return kind === "confirm"
      ? welcomeConfirmText({
          clientName: name,
          service,
          startsAt: row.starts_at,
          appointmentId: row.id,
        })
      : reminderText({
          clientName: name,
          service,
          startsAt: row.starts_at,
          appointmentId: row.id,
        });
  }

  if (unavailable) {
    return (
      <div>
        <h2 className="font-display text-2xl leading-none sm:text-3xl">Texts</h2>
        <p className="mt-4 rounded-xl border border-foreground/10 bg-white px-4 py-3 text-sm text-muted">
          Run migration 0029_manual_texts.sql to start tracking which
          confirmations you&apos;ve sent.
        </p>
      </div>
    );
  }

  const list = tab === "confirm" ? toConfirm : toRemind;

  return (
    <div>
      <h2 className="font-display text-2xl leading-none sm:text-3xl">Texts</h2>
      <p className="mt-2 text-sm text-muted">
        Until the carrier registration clears, these go from your phone. Tap one
        and Messages opens with it written — you just press send.
      </p>

      <div className="mt-4 flex gap-5 border-b border-foreground/15">
        {(
          [
            ["confirm", "To confirm", toConfirm.length],
            ["remind", "Reminders due", toRemind.length],
          ] as const
        ).map(([k, label, count]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 pb-2 text-sm transition ${
              tab === k
                ? "border-accent font-medium text-accent-dark"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {label}
            <span className="ml-2 tabular-nums text-muted">{count}</span>
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-accent-dark">{error}</p>}

      {loading ? (
        <p className="mt-4 text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="mt-4 rounded-xl border border-foreground/15 bg-white px-4 py-6 text-sm text-muted">
          {tab === "confirm"
            ? "Everyone booked has had a confirmation. Nothing to send."
            : `Nobody due in the next ${REMIND_AHEAD_HOURS} hours needs a reminder. Check back tomorrow.`}
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-foreground/15 bg-white">
          {list.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-stretch ${
                i > 0 ? "border-t border-foreground/10" : ""
              }`}
            >
              <Rail color="#bd8f45" width={4} />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {r.clients?.full_name ?? "Unknown"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {r.services?.name} · {whenLabel(r.starts_at)}
                  </span>
                </span>

                <span className="ml-auto flex shrink-0 items-center gap-4 text-sm">
                  <a
                    href={smsHref(r.clients!.phone!, bodyFor(r, tab))}
                    onClick={() => mark(r, tab, true)}
                    className="font-medium text-accent-dark underline decoration-accent underline-offset-4"
                  >
                    Text
                  </a>
                  <button
                    onClick={() => mark(r, tab, true)}
                    className="text-xs text-muted transition hover:text-accent-dark"
                  >
                    Skip
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* What she's about to send, so there are no surprises in her Messages
          app — and so she can see the link that's going out. */}
      {list.length > 0 && (
        <div className="mt-5">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">
            What it says
          </p>
          <p className="mt-2 whitespace-pre-wrap rounded-xl border border-foreground/15 bg-white px-4 py-3 text-sm leading-relaxed text-muted">
            {bodyFor(list[0], tab)}
          </p>
        </div>
      )}
    </div>
  );
}
