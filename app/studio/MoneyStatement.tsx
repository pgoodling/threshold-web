"use client";

import { useRef, useState } from "react";
import { Upload, CircleAlert, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";

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

/** What the upload actually brought in, read back from the table. */
type Span = { from: string; to: string };

type Pending = { csv: string; name: string; reason: string; driftCents?: number };

const money = (cents: number) =>
  `${cents < 0 ? "-" : ""}$${Math.abs(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function MoneyStatement({ onImported }: { onImported?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [span, setSpan] = useState<Span | null>(null);

  async function send(csv: string, name: string, allowGaps: boolean) {
    setBusy(true);
    setError(null);
    setSpan(null);
    const startedAt = new Date(Date.now() - 5_000).toISOString();
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
      // Which dates came in, so the card can say "September" rather than a
      // count she has to take on trust.
      if ((json as ImportResult).imported > 0) {
        const { data } = await supabase
          .from("bank_transactions")
          .select("posted_on")
          .gte("created_at", startedAt)
          .order("posted_on", { ascending: true });
        const days = (data ?? []).map((r) => r.posted_on as string);
        if (days.length) setSpan({ from: days[0], to: days[days.length - 1] });
      }
      onImported?.();
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
    // A supplier order is the other file she uploads, and it lives in
    // Inventory. Say where, rather than failing on a PDF as a bad CSV.
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      setError("That looks like a supplier order. Orders go in Inventory → Add stock.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const text = await file.text();
    await send(text, file.name, false);
    // Let her pick the same file again after a failure.
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
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
        className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-accent-dark sm:w-auto sm:inline-flex ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <Upload size={16} />
        {busy ? "Reading…" : "Upload statement"}
      </label>

      <p className="mt-2 text-xs text-muted">
        Supplier order?{" "}
        <a href="#inventory" className="-my-3 inline-flex min-h-11 items-center text-accent underline">
          Upload it in Inventory → Add stock
        </a>
      </p>

      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer select-none">How to get it from Relay</summary>
        <p className="mt-1 max-w-prose">
          In the Relay app: open the account, tap the{" "}
          <span className="text-foreground">⋯</span> menu,{" "}
          <span className="text-foreground">Download statements</span>, pick the month and
          choose <span className="text-foreground">CSV</span>. Uploading the same file
          twice is safe — anything already here is left alone.
        </p>
      </details>

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
                  className="min-h-11 inline-flex items-center rounded-lg border border-foreground/15 px-3 text-sm font-medium transition hover:border-foreground/30 disabled:opacity-60"
                >
                  Import it anyway
                </button>
                <button
                  onClick={() => setPending(null)}
                  className="min-h-11 inline-flex items-center rounded-lg px-3 text-sm text-muted transition hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 flex max-w-prose overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm shadow-sm">
          <span className="w-1 shrink-0 bg-accent" aria-hidden />
          <div className="px-4 py-3">
            <p className="font-medium">
              {result.imported === 0
                ? "Nothing new — this was already here"
                : span
                  ? `${monthSpan(span)} added`
                  : "Statement added"}
            </p>
            {result.imported > 0 && (
              <p className="mt-0.5 text-muted">
                {span && `${day(span.from)} – ${day(span.to)} · `}
                {result.imported} transaction{result.imported === 1 ? "" : "s"}
                {result.duplicates > 0 && ` · ${result.duplicates} already here`}
              </p>
            )}
            {result.balance.ok ? (
              <p className="mt-0.5 flex items-center gap-1 text-muted">
                <Check size={13} className="text-accent" /> Balance matches Relay
              </p>
            ) : (
              <p className="mt-0.5 text-muted">Imported with rows missing</p>
            )}
            {result.unreadable && result.unreadable.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                {result.unreadable.length} line
                {result.unreadable.length === 1 ? "" : "s"} couldn&rsquo;t be read:{" "}
                {result.unreadable[0].reason} (line {result.unreadable[0].line})
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const day = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** "September statement", or "August – September statement" across a boundary. */
function monthSpan(s: Span): string {
  const m = (ymd: string) =>
    new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const a = m(s.from);
  const b = m(s.to);
  return a === b ? `${a} statement` : `${a} – ${b} statement`;
}
