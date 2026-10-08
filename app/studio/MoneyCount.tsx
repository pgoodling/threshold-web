"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { nameProduct, byName } from "../../lib/productLine";

// Counting the shelf.
//
// A list of names and a box for each. Deliberately nothing else: an earlier
// draft had colour-coded rows, a running total and a progress counter, and
// Paul couldn't tell what he was looking at.
//
// NO EXPECTED NUMBERS ON SCREEN. Showing "was 3" makes counting easy to skip —
// people confirm the number in front of them rather than look at the shelf.
//
// ONLY THE SHELF. The back bar sorts itself out as bottles are marked
// finished, and counting half-used bottles would tell her nothing.
//
// A SHORTFALL IS "MISSING", NOT "USED". It could be theft, breakage, a sale
// that skipped check-out or a bottle opened without the tap, and the count
// can't tell which. Recording it as use would put a stolen bottle into her
// product cost. Kept as its own kind so shrinkage can be totalled later.

type Row = {
  product_id: string;
  name: string;
  brand: string | null;
  size: string | null;
  unit_cost_cents: number | null;
  on_hand: number;
};

type Result = { counted: number; missing: string[]; extra: string[] };

export default function MoneyCount({ onSaved }: { onSaved?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [entered, setEntered] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase
      .from("product_stock")
      .select("*")
      .eq("active", true)
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

  const groups = useMemo(() => {
    const by = new Map<string, { row: Row; short: string; size: string | null }[]>();
    for (const r of rows) {
      const n = nameProduct(r);
      by.set(n.group, [...(by.get(n.group) ?? []), { row: r, short: n.short, size: n.size }]);
    }
    return [...by.entries()]
      .sort(([a], [b]) => byName(a, b))
      .map(([group, items]) => ({ group, items: items.sort((a, b) => byName(a.short, b.short)) }));
  }, [rows]);

  async function save() {
    setError(null);
    // Blank means skipped, not zero — a count interrupted by a client
    // shouldn't wipe the shelf.
    const counted = rows
      .map((r) => ({ row: r, raw: (entered[r.product_id] ?? "").trim() }))
      .filter((c) => c.raw !== "")
      .map((c) => ({ row: c.row, actual: Number(c.raw) }))
      .filter((c) => Number.isFinite(c.actual) && c.actual >= 0);

    if (counted.length === 0) return setError("Nothing counted yet.");
    setBusy(true);

    const movements: Record<string, unknown>[] = [];
    const missing: string[] = [];
    const extra: string[] = [];

    for (const { row, actual } of counted) {
      const diff = actual - row.on_hand;
      if (diff === 0) continue;
      const label = nameProduct(row).short;
      if (diff < 0) {
        movements.push({
          product_id: row.product_id,
          kind: "missing",
          quantity: diff,
          unit_cost_cents: row.unit_cost_cents,
          note: "Counted",
        });
        missing.push(`${label} (${-diff})`);
      } else {
        // More than the ledger knows — usually a delivery nobody added.
        movements.push({
          product_id: row.product_id,
          kind: "adjusted",
          quantity: diff,
          unit_cost_cents: row.unit_cost_cents,
          note: "Counted — more on the shelf than expected",
        });
        extra.push(`${label} (${diff})`);
      }
    }

    if (movements.length > 0) {
      const { error: e } = await supabase.from("inventory_movements").insert(movements);
      if (e) {
        setBusy(false);
        return setError(
          e.message.includes("kind_check")
            ? "Counting isn't switched on in the database yet."
            : e.message,
        );
      }
    }

    setResult({ counted: counted.length, missing, extra });
    setEntered({});
    setBusy(false);
    setReloadKey((k) => k + 1);
    onSaved?.();
  }

  if (loading) return <p className="mt-4 text-sm text-muted">Loading…</p>;

  if (result) {
    return (
      <div className="mt-4">
        <p className="flex items-center gap-2 text-base">
          <Check size={18} className="text-accent" />
          {result.counted} counted
          {result.missing.length === 0 && result.extra.length === 0 && ", all as expected"}
        </p>
        {result.missing.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="text-muted">Missing: </span>
            {result.missing.join(", ")}
          </p>
        )}
        {result.extra.length > 0 && (
          <p className="mt-2 text-sm">
            <span className="text-muted">More than expected: </span>
            {result.extra.join(", ")}
          </p>
        )}
        <button
          onClick={() => setResult(null)}
          className="min-h-11 inline-flex items-center mt-4 rounded-lg border border-foreground/15 bg-white px-3 .5 text-sm font-medium shadow-sm transition hover:border-foreground/30"
        >
          Count more
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-muted">Nothing on the shelf to count.</p>;
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-muted">How many on the shelf? Leave blank to skip.</p>

      {groups.map(({ group, items }) => (
        <section key={group} className="mt-4">
          <h4 className="px-1 font-display text-base">{group}</h4>
          <div className="mt-1.5 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
            {items.map(({ row: r, short, size }) => (
              <div
                key={r.product_id}
                className="flex items-center gap-3 border-t border-foreground/10 px-3 py-2.5 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug">{short}</p>
                  {size && <p className="text-xs text-muted">{size}</p>}
                </div>
                <input
                  inputMode="numeric"
                  value={entered[r.product_id] ?? ""}
                  onChange={(e) =>
                    setEntered((s) => ({ ...s, [r.product_id]: e.target.value }))
                  }
                  placeholder="—"
                  aria-label={`How many ${short}`}
                  className="w-16 shrink-0 rounded-lg border border-foreground/15 px-2 py-1.5 text-center text-base tabular-nums"
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={busy}
        className="inline-flex min-h-11 items-center justify-center mt-4 w-full rounded-[10px] bg-accent px-4 .5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save the count"}
      </button>
    </div>
  );
}
