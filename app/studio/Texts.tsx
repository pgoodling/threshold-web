"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { toE164 } from "../../lib/phone";
import { whenLabel } from "../../lib/format";
import { welcomeConfirmText, reminderText } from "../../lib/smsTemplates";
import Rail from "./Rail";
import Button from "./Button";

// The texts that need a human to decide, not a schedule.
//
// Built when the app couldn't send at all — every row opened her own Messages
// app with the text written. The A2P campaign cleared on 22 September, so these
// send from the salon number now. The by-hand path stays on each row, because
// a carrier can reject one message and she shouldn't be stuck when it does.
//
// Two lists, because they're two different jobs:
//
//   Confirm    every upcoming appointment that's never had a confirmation.
//              A catch-up for everyone booked before texting worked, which is
//              why it has a date floor — see DEFAULT_CONFIRM_FROM.
//   Remind     anyone starting in the next day and a bit. Mostly handled by
//              the 9am cron now; this is what's left when she wants to look.
//
// Both stamp the same columns the automated crons read, so nothing here can
// text someone the cron has already reached, or vice versa.

type Row = {
  id: string;
  client_id: string | null;
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

// Don't offer to confirm anything before this date.
//
// Evelyn hand-texted every September client from her own phone while the
// carrier registration was stuck. Some of those she marked here, some she
// didn't — "I sent them all" is a claim about the world, not a fact in the
// database, and the difference between the two is a client getting the same
// confirmation twice.
//
// So the list starts in October and she can wind it back if she wants to. The
// floor is the safe default; the control is there because she knows things the
// database doesn't.
const DEFAULT_CONFIRM_FROM = "2026-10-01";

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
        "id,client_id,starts_at,status,confirm_sms_sent_at,reminder_sms_sent_at,clients(full_name,phone),services(name)",
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

  const [confirmFrom, setConfirmFrom] = useState(DEFAULT_CONFIRM_FROM);

  const { toConfirm, toRemind } = useMemo(() => {
    const cutoff = nowMs + REMIND_AHEAD_HOURS * 3600 * 1000;
    const floor = new Date(`${confirmFrom}T00:00:00-04:00`).getTime();
    return {
      toConfirm: rows.filter(
        (r) =>
          !r.confirm_sms_sent_at &&
          r.clients?.phone &&
          new Date(r.starts_at).getTime() >= floor,
      ),
      toRemind: rows.filter(
        (r) =>
          !r.reminder_sms_sent_at &&
          r.clients?.phone &&
          new Date(r.starts_at).getTime() <= cutoff,
      ),
    };
  }, [rows, nowMs, confirmFrom]);

  // ── Sending from the salon number ──────────────────────────────────────
  //
  // Until the campaign cleared, every row here was an `sms:` link that opened
  // her own Messages app. It can send properly now, so it does — but the manual
  // link stays on each row as a fallback, because a carrier can still reject a
  // single message and she shouldn't be stuck when it does.
  const [sending, setSending] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  async function sendOne(row: Row, kind: "confirm" | "remind") {
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        to: row.clients!.phone,
        body: bodyFor(row, kind),
        // Both ids, so the sent message lands in this client's conversation
        // rather than floating loose in the inbox. Without client_id the
        // confirmation wouldn't appear on her record at all.
        clientId: row.client_id,
        appointmentId: row.id,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || "Couldn't send that one.");
    }
    // Stamped only after a real send, so a failure leaves the row on the list
    // to try again rather than quietly marking it done.
    await mark(row, kind, true);
  }

  async function sendAll(list: Row[], kind: "confirm" | "remind") {
    setError(null);
    setProgress({ done: 0, total: list.length });
    for (const [i, row] of list.entries()) {
      try {
        await sendOne(row, kind);
      } catch (e) {
        setError(
          `${e instanceof Error ? e.message : "Send failed"} — stopped at ${
            row.clients?.full_name ?? "unknown"
          }. The rest are still on the list.`,
        );
        setProgress(null);
        return;
      }
      setProgress({ done: i + 1, total: list.length });
      // One at a time, with a breath between. Nothing here is urgent, and a
      // burst of identical messages from a new number is what carrier spam
      // filtering is built to catch.
      await new Promise((r) => setTimeout(r, 1200));
    }
    setProgress(null);
  }

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
        These send from the salon number. &ldquo;By hand&rdquo; still opens your
        own Messages with the text written, if you&apos;d rather send one
        yourself.
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

      {/* The date floor, and the bulk send it protects. Both live above the
          list, because she needs to see what the run covers before starting
          one — a "Send all" whose scope isn't on screen is a trap. */}
      {tab === "confirm" && (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-foreground/15 bg-white px-4 py-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
              Appointments from
            </span>
            <input
              type="date"
              className="input w-44"
              value={confirmFrom}
              onChange={(e) => setConfirmFrom(e.target.value)}
            />
            <span className="mt-1 block text-xs text-muted">
              September was done by hand — starts in October so nobody gets two.
            </span>
          </label>
          {toConfirm.length > 0 && (
            <Button
              onClick={() => sendAll(toConfirm, "confirm")}
              disabled={progress !== null}
            >
              {progress
                ? `Sending ${progress.done}/${progress.total}…`
                : `Send all ${toConfirm.length}`}
            </Button>
          )}
        </div>
      )}

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
                  <button
                    disabled={sending === r.id || progress !== null}
                    onClick={async () => {
                      setSending(r.id);
                      setError(null);
                      try {
                        await sendOne(r, tab);
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Send failed.",
                        );
                      }
                      setSending(null);
                    }}
                    className="font-medium text-accent-dark underline decoration-accent underline-offset-4 disabled:opacity-50"
                  >
                    {sending === r.id ? "Sending…" : "Send"}
                  </button>
                  {/* The old path, kept. A carrier can reject one message and
                      she shouldn't be stuck when it happens. */}
                  <a
                    href={smsHref(r.clients!.phone!, bodyFor(r, tab))}
                    onClick={() => mark(r, tab, true)}
                    className="text-xs text-muted transition hover:text-accent-dark"
                  >
                    By hand
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
