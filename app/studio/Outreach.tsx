"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { toE164 } from "../../lib/phone";

// Personal outreach sweep — for telling her whole book something, one client at
// a time, from her own phone.
//
// This is NOT app-sent texting. Tapping a client hands the message to whatever
// Messages app she's in and she presses send herself. That matters: personal
// person-to-person texts aren't A2P traffic and don't need the carrier
// registration or the written marketing consent that a blast would. It's also
// the only channel that works while the A2P campaign is in vetting.
//
// So the app's job here is narrow: write the message once, merge each client's
// first name, and remember who she's already reached.

const DEFAULT_MESSAGE =
  "Hi {first}! It's Evelyn — I'm opening my own studio, Threshold, at Salon " +
  "Lofts on Stroop Rd. I'd love to keep doing your hair. You can book with me " +
  "any time at threshold.salon/book. Hope to see you soon!";

type Row = {
  id: string;
  full_name: string;
  phone: string | null;
  outreach_texted_at: string | null;
  sms_consent_at?: string | null;
};

// iOS wants `&body=`, Android wants `?body=`. `?&body=` is the form both accept.
function smsLink(phone: string, body: string) {
  return `sms:${toE164(phone)}?&body=${encodeURIComponent(body)}`;
}

const firstNameOf = (fullName: string) =>
  fullName?.trim().split(/\s+/)[0] || "there";

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));

export default function Outreach() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [editing, setEditing] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    supabase
      .from("clients")
      // `*` so this still loads before migration 0021 adds the column.
      .select("*")
      .order("full_name")
      .then(({ data, error }) => {
        setLoading(false);
        if (error) {
          setError(error.message);
          return;
        }
        const all = (data ?? []) as Row[];
        // The column missing entirely means the migration hasn't run — say so
        // rather than silently showing everyone as "not yet contacted".
        setUnavailable(all.length > 0 && !("outreach_texted_at" in all[0]));
        setRows(all.filter((r) => (r.phone ?? "").trim() !== ""));
      });
  }, []);

  useEffect(load, [load]);

  const { pending, done } = useMemo(
    () => ({
      pending: rows.filter((r) => !r.outreach_texted_at),
      done: rows.filter((r) => r.outreach_texted_at),
    }),
    [rows],
  );

  // Optimistic: she's switching to Messages and back, and waiting on a round
  // trip before the row updates would feel broken.
  async function mark(row: Row, texted: boolean) {
    const when = texted ? new Date().toISOString() : null;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, outreach_texted_at: when } : r)),
    );
    const { error } = await supabase
      .from("clients")
      .update({ outreach_texted_at: when })
      .eq("id", row.id);
    if (error) {
      setError(error.message);
      load();
    }
  }

  const shown = showDone ? done : pending;

  if (loading) return <p className="text-muted">Loading your clients…</p>;

  return (
    <div>
      <p className="text-muted">
        Tell your clients something, one at a time, from your own phone. Tap a
        name and your Messages app opens with the text already written — you just
        press send. Nothing is sent by the app.
      </p>

      {unavailable && (
        <ErrorNote>
          Run migration <code>0021_outreach.sql</code> to start tracking who
          you&rsquo;ve texted. Until then the list works, but it won&rsquo;t
          remember where you got to.
        </ErrorNote>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Message she'll send */}
      <div className="mt-6 rounded-2xl border border-foreground/10 bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">Your message</p>
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-sm text-accent hover:text-accent-dark"
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
        {editing ? (
          <>
            <textarea
              className="input mt-3"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="mt-2 text-xs text-muted">
              Write <code>{"{first}"}</code> where you want their first name.
            </p>
          </>
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {message.replace("{first}", "Sarah")}
          </p>
        )}
      </div>

      {/* Progress */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="font-display text-lg">
          {done.length} of {rows.length} contacted
        </span>
        <span className="h-1.5 flex-1 min-w-[6rem] overflow-hidden rounded-full bg-foreground/10">
          <span
            className="block h-full bg-accent transition-all"
            style={{
              width: rows.length ? `${(done.length / rows.length) * 100}%` : 0,
            }}
          />
        </span>
        <div className="flex rounded-full border border-foreground/15 p-0.5 text-sm">
          <button
            onClick={() => setShowDone(false)}
            className={`rounded-full px-4 py-1 transition ${
              !showDone ? "bg-accent text-white" : "text-muted hover:text-accent"
            }`}
          >
            To do ({pending.length})
          </button>
          <button
            onClick={() => setShowDone(true)}
            className={`rounded-full px-4 py-1 transition ${
              showDone ? "bg-accent text-white" : "text-muted hover:text-accent"
            }`}
          >
            Done ({done.length})
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 text-muted">
          {showDone
            ? "Nobody yet — tap a name on the To do list to get started."
            : "That's everyone. Nicely done."}
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {shown.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.full_name}</div>
                <div className="mt-0.5 text-sm text-muted">
                  {r.phone}
                  {r.outreach_texted_at && (
                    <> · texted {dayLabel(r.outreach_texted_at)}</>
                  )}
                </div>
              </div>
              {!r.outreach_texted_at && (
                <a
                  href={smsLink(r.phone!, message.replace("{first}", firstNameOf(r.full_name)))}
                  className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent-dark"
                >
                  Text
                </a>
              )}
              <button
                onClick={() => mark(r, !r.outreach_texted_at)}
                className="rounded-full border border-foreground/15 px-4 py-2 text-sm transition hover:border-accent hover:text-accent"
              >
                {r.outreach_texted_at ? "Undo" : "Sent"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-accent-dark/30 bg-accent/5 px-4 py-3 text-sm text-accent-dark">
      {children}
    </p>
  );
}
