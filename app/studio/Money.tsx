"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, CircleAlert, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import MoneyReview from "./MoneyReview";
import MoneyManual from "./MoneyManual";

// Bringing a Relay export in.
//
// The whole screen is one decision: is this file whole? Everything else --
// dedupe, suggested categories -- happens without asking her. So the result
// panel leads with the balance check, and the only prompt she can get is the
// one worth interrupting for: these balances don't add up, do you want it
// anyway.

type ImportResult = {
  ok?: true;
  read: number;
  imported: number;
  duplicates: number;
  suggested: number;
  balance:
    | { ok: true; openingCents: number; closingCents: number; sumCents: number }
    | { ok: false; reason: string; driftCents?: number };
  unreadable?: { line: number; reason: string }[];
  degraded?: boolean;
};

type Pending = { csv: string; name: string; reason: string; driftCents?: number };

const money = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${Math.abs(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function Money() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  // Remount the queue after an import, so newly-added rows appear without a
  // page reload. A key change is the cheapest correct way to refetch here.
  const [queueKey, setQueueKey] = useState(0);
  const noop = useCallback(() => {}, []);

  async function send(csv: string, name: string, allowGaps: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/money/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ csv, allowGaps }),
      });
      const json = await res.json();

      if (res.status === 409) {
        // Well-formed but not whole. Ask rather than decide.
        setPending({
          csv,
          name,
          reason: json.error as string,
          driftCents: json.balance?.driftCents,
        });
        return;
      }
      if (!res.ok) {
        setError((json.error as string) ?? "That import didn't work.");
        return;
      }
      setPending(null);
      setResult(json as ImportResult);
      setQueueKey((k) => k + 1);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setPending(null);
    const text = await file.text();
    await send(text, file.name, false);
    // Let her pick the same file again after a failure.
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      <h2 className="mb-4 font-display text-2xl leading-none sm:text-3xl">Money</h2>
      <p className="max-w-prose text-sm text-muted">
        In the Relay app: open the account, tap the{" "}
        <span className="text-foreground">⋯</span> menu,{" "}
        <span className="text-foreground">Download statements</span>, pick the month and
        choose <span className="text-foreground">CSV</span>. Then come back here and
        upload it. Importing the same file twice is safe — anything already here is left
        alone, so there&rsquo;s no harm in re-uploading if you lose track.
      </p>

      <div className="mt-5">
        <input
          ref={fileRef}
          type="file"
          // Broad on purpose. She uploads from her phone, and iOS reports a
          // CSV variously as text/csv, text/comma-separated-values, or
          // text/plain depending on where it came from — a narrow accept list
          // greys the file out in the Files picker with no explanation, which
          // looks like the app refusing to work.
          accept=".csv,text/csv,text/comma-separated-values,application/csv,text/plain"
          onChange={onPick}
          className="hidden"
          id="relay-csv"
        />
        <label
          htmlFor="relay-csv"
          className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-foreground/15 bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-foreground/30 ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Upload size={16} />
          {busy ? "Reading…" : "Choose a Relay CSV"}
        </label>
      </div>

      {error && (
        <div className="mt-5 flex max-w-prose gap-3 rounded-xl border border-foreground/15 bg-white p-4 text-sm shadow-sm">
          <span className="-my-4 -ml-4 mr-1 w-1 shrink-0 rounded-l-xl bg-red-500" />
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
          <p>{error}</p>
        </div>
      )}

      {/* The one interruption worth making. */}
      {pending && (
        <div className="mt-5 max-w-prose rounded-xl border border-foreground/15 bg-white p-4 shadow-sm">
          <div className="flex gap-3">
            <span className="-my-4 -ml-4 mr-1 w-1 shrink-0 rounded-l-xl bg-amber-500" />
            <div className="text-sm">
              <p className="font-medium">This export has rows missing.</p>
              <p className="mt-1 text-muted">
                The running balances in <span className="text-foreground">{pending.name}</span>{" "}
                don&rsquo;t add up
                {pending.driftCents !== undefined && (
                  <> — they&rsquo;re out by {money(pending.driftCents)}</>
                )}
                . Usually that means the download was cut short or filtered. Re-exporting
                the whole month normally fixes it.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => send(pending.csv, pending.name, true)}
                  disabled={busy}
                  className="rounded-lg border border-foreground/15 px-3 py-1.5 text-sm font-medium transition hover:border-foreground/30 disabled:opacity-60"
                >
                  Import it anyway
                </button>
                <button
                  onClick={() => setPending(null)}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-6 max-w-prose overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-foreground/10 px-4 py-3">
            <Check size={16} className="text-accent" />
            <p className="text-sm font-medium">
              {result.imported === 0
                ? "Nothing new — already had all of it."
                : `${result.imported} transaction${result.imported === 1 ? "" : "s"} added.`}
            </p>
          </div>

          <dl className="text-sm">
            <Row label="Read from the file" value={String(result.read)} />
            {result.duplicates > 0 && (
              <Row
                label="Already here"
                value={String(result.duplicates)}
                note="skipped"
              />
            )}
            <Row
              label="Category suggested"
              value={String(result.suggested)}
              note={
                result.imported > 0
                  ? `${result.imported - result.suggested} need you`
                  : undefined
              }
            />
            {result.balance.ok && (
              <Row
                label="Balances"
                value={`${money(result.balance.openingCents)} → ${money(
                  result.balance.closingCents,
                )}`}
                note="chains cleanly"
              />
            )}
          </dl>

          {result.unreadable && result.unreadable.length > 0 && (
            <p className="border-t border-foreground/10 px-4 py-3 text-xs text-muted">
              {result.unreadable.length} line
              {result.unreadable.length === 1 ? "" : "s"} couldn&rsquo;t be read:{" "}
              {result.unreadable[0].reason} (line {result.unreadable[0].line})
            </p>
          )}

          {result.degraded && (
            <p className="border-t border-foreground/10 px-4 py-3 text-xs text-muted">
              Saved without the pending and balance columns — migration 0037
              hasn&rsquo;t run on this database yet.
            </p>
          )}

          <p className="flex items-center gap-2 border-t border-foreground/10 px-4 py-3 text-xs text-muted">
            <FileText size={13} />
            Nothing counts toward a total until it&rsquo;s been reviewed.
          </p>
        </div>
      )}

      <MoneyManual onAdded={() => setQueueKey((k) => k + 1)} />

      <div className="mt-10 border-t border-foreground/15 pt-8">
        <MoneyReview key={queueKey} onCount={noop} />
      </div>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between border-t border-foreground/10 px-4 py-2.5 first:border-t-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">
        {value}
        {note && <span className="ml-2 text-xs font-normal text-muted">{note}</span>}
      </dd>
    </div>
  );
}
