"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Check, ArrowUp } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Counting the shelf.
//
// The screen is a list of names and a box for each. Deliberately nothing else:
// an earlier draft had colour-coded rows, a running total, a progress counter
// and a per-row "used or sold?" question, and Paul couldn't tell what he was
// looking at. If he couldn't, she wouldn't.
//
// NO EXPECTED NUMBERS ON SCREEN
//
// Showing "was 3" makes a typo easy to spot and makes counting easy to skip —
// people confirm the number in front of them rather than look at the shelf.
// The whole value of a count is that it is independent of what the app
// believes, so the app keeps its belief to itself until she has committed.
//
// NOTHING IS ASKED, BECAUSE NOTHING IS AMBIGUOUS
//
// Every sale goes through check-out and every back-bar open goes through
// Today. So a shortfall is product used on clients, full stop. That question
// only existed while sales might have gone unrecorded.
//
// The exceptions are worth surfacing, which happens after saving rather than
// during: a retail bottle short with no sale behind it, or — stranger — more
// on the shelf than the ledger knows about, which usually means a delivery
// nobody uploaded.

type Row = {
  product_id: string;
  name: string;
  brand: string | null;
  size: string | null;
  unit_cost_cents: number | null;
  sells_retail: boolean;
  on_hand: number;
};

type Finding = {
  name: string;
  kind: "retail_short" | "surplus";
  by: number;
};

type Summary = {
  counted: number;
  usedValueCents: number;
  findings: Finding[];
};

const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MoneyCount() {
  const [rows, setRows] = useState<Row[]>([]);
  const [entered, setEntered] = useState<Record<string, string>>({});
  const [brand, setBrand] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase
      .from("product_stock")
      .select("*")
      .eq("active", true)
      .order("brand", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) setError(e.message);
        // Only things she could actually be holding. Counting a product with
        // no stock is asking her to confirm a zero.
        setRows(((data ?? []) as Row[]).filter((r) => r.on_hand > 0));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const brands = useMemo(
    () => [...new Set(rows.map((r) => r.brand).filter(Boolean))] as string[],
    [rows],
  );

  const shown = useMemo(
    () => (brand === "" ? rows : rows.filter((r) => r.brand === brand)),
    [rows, brand],
  );

  async function save() {
    setError(null);
    // Blank means skipped, not zero — so an empty box is dropped here rather
    // than becoming a count of none and wiping that product off the shelf.
    const counted = shown
      .map((r) => ({ row: r, raw: (entered[r.product_id] ?? "").trim() }))
      .filter((c) => c.raw !== "")
      .map((c) => ({ row: c.row, actual: Number(c.raw) }))
      .filter((c) => Number.isFinite(c.actual) && c.actual >= 0);

    if (counted.length === 0) {
      setError("Nothing counted yet — put a number against at least one thing.");
      return;
    }
    setBusy(true);

    const movements: Record<string, unknown>[] = [];
    const findings: Finding[] = [];
    let usedValueCents = 0;

    for (const { row, actual } of counted) {
      const diff = actual - row.on_hand;
      if (diff === 0) continue;

      if (diff < 0) {
        // Short. Sales go through check-out, so this is product used on heads.
        movements.push({
          product_id: row.product_id,
          kind: "used",
          quantity: diff,
          unit_cost_cents: row.unit_cost_cents,
          note: "Counted",
        });
        usedValueCents += Math.abs(diff) * (row.unit_cost_cents ?? 0);
        if (row.sells_retail) {
          findings.push({ name: row.name, kind: "retail_short", by: Math.abs(diff) });
        }
      } else {
        // More than the ledger knows about. Not a usage event at all — it is
        // the ledger being wrong, so it books as an adjustment and says so.
        movements.push({
          product_id: row.product_id,
          kind: "adjusted",
          quantity: diff,
          unit_cost_cents: row.unit_cost_cents,
          note: "Counted — more on the shelf than expected",
        });
        findings.push({ name: row.name, kind: "surplus", by: diff });
      }
    }

    if (movements.length > 0) {
      const { error: e } = await supabase.from("inventory_movements").insert(movements);
      if (e) {
        setError(e.message);
        setBusy(false);
        return;
      }
    }

    setSummary({ counted: counted.length, usedValueCents, findings });
    setEntered({});
    setBusy(false);
    setReloadKey((k) => k + 1);
  }

  if (loading) return <p className="mt-6 text-sm text-muted">Loading…</p>;

  // ---- After the count ------------------------------------------------------
  if (summary) {
    return (
      <div className="mt-6 max-w-prose">
        <p className="flex items-center gap-2 font-display text-lg">
          <Check size={18} className="text-accent" />
          Count saved
        </p>
        <p className="mt-2 text-sm text-muted">
          {summary.counted} product{summary.counted === 1 ? "" : "s"} counted.{" "}
          {summary.usedValueCents > 0 ? (
            <>
              <span className="text-foreground">{money(summary.usedValueCents)}</span> of
              product used on clients since the last count — that&rsquo;s in her costs
              now.
            </>
          ) : (
            <>Everything matched.</>
          )}
        </p>

        {summary.findings.length > 0 && (
          <>
            <p className="mt-5 text-sm text-muted">
              {summary.findings.length === 1 ? "One worth a look" : `${summary.findings.length} worth a look`}
            </p>
            <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
              {summary.findings.map((f) => (
                <div
                  key={`${f.kind}-${f.name}`}
                  className="flex gap-3 border-t border-foreground/10 first:border-t-0"
                >
                  <span
                    className={`w-1 shrink-0 ${
                      f.kind === "surplus" ? "bg-accent/50" : "bg-amber-400"
                    }`}
                    aria-hidden
                  />
                  <div className="flex-1 py-3 pr-4 text-sm">
                    <p className="font-medium">{f.name}</p>
                    <p className="mt-0.5 text-muted">
                      {f.kind === "surplus" ? (
                        <>
                          <ArrowUp size={12} className="inline" /> {f.by} more than
                          expected — usually a delivery that never got uploaded.
                        </>
                      ) : (
                        <>
                          {f.by} fewer, and she sells this one. Recorded as used on
                          clients, which is right unless one was sold without going
                          through check-out.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-4 text-xs text-muted">
          Until check-out is recording retail sales, anything she sells will show up
          here as used. That will settle down on its own.
        </p>

        <button
          onClick={() => setSummary(null)}
          className="mt-4 rounded-lg border border-foreground/15 bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition hover:border-foreground/30"
        >
          Count something else
        </button>
      </div>
    );
  }

  // ---- The count ------------------------------------------------------------
  if (rows.length === 0) {
    return (
      <p className="mt-6 max-w-prose text-sm text-muted">
        Nothing in stock to count yet.
      </p>
    );
  }

  return (
    <div className="mt-6 max-w-prose">
      <p className="flex items-center gap-2 font-display text-lg">
        <ClipboardList size={17} className="text-muted" />
        Count the shelf
      </p>
      <p className="mt-1 text-sm text-muted">
        How many are there? Leave anything blank to skip it — a count interrupted by a
        client shouldn&rsquo;t wipe the shelf.
      </p>

      {brands.length > 1 && (
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="mt-3 w-full rounded-lg border border-foreground/15 bg-white px-2 py-2 text-sm"
        >
          <option value="">Everything in stock ({rows.length})</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b} ({rows.filter((r) => r.brand === b).length})
            </option>
          ))}
        </select>
      )}

      <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
        {shown.map((r) => (
          <div
            key={r.product_id}
            className="flex items-center gap-3 border-t border-foreground/10 px-4 py-3 first:border-t-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{r.name}</p>
              {r.size && <p className="truncate text-xs text-muted">{r.size}</p>}
            </div>
            <input
              inputMode="numeric"
              value={entered[r.product_id] ?? ""}
              onChange={(e) =>
                setEntered((s) => ({ ...s, [r.product_id]: e.target.value }))
              }
              placeholder="—"
              className="w-16 shrink-0 rounded-lg border border-foreground/15 px-2 py-1.5 text-center text-base tabular-nums"
            />
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={busy}
        className="mt-4 w-full rounded-xl border border-foreground/15 bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-foreground/30 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save the count"}
      </button>

      <p className="mt-3 text-xs text-muted">
        No expected numbers on screen on purpose — a count is only worth doing if
        it&rsquo;s independent of what the app already believes.
      </p>
    </div>
  );
}
