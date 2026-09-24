"use client";

import { useState } from "react";
import { PackageOpen, Plus, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Breaking a kit into what was actually in it.
//
// Some suppliers itemise a kit's contents as $0.00 lines on the same order, and
// the importer spreads the price across those automatically. Keune's "Care
// Studio Plus Intro 68 pc." is billed as one line at $649 with nothing
// anywhere naming the 68 pieces — so there is nothing to allocate to, and the
// importer leaves it exactly as billed rather than inventing a breakdown.
//
// Which is honest and useless. A $649 box cannot be sold, cannot be counted,
// and makes every bottle that came out of it invisible. Only she can say what
// was inside, so this is where she says it.
//
// The cost is split across the units she lists, the contents are received, and
// the box is retired — so the money lands on things that exist instead of on a
// carton that was thrown away weeks ago.

type Line = { name: string; qty: string };

export default function MoneyKitBreakout({
  productId,
  productName,
  brand,
  supplier,
  unitCostCents,
  onDone,
}: {
  productId: string;
  productName: string;
  brand: string | null;
  supplier: string | null;
  unitCostCents: number | null;
  onDone: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([{ name: "", qty: "1" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalUnits = lines.reduce((t, l) => t + (Number(l.qty) || 0), 0);
  const perUnit =
    unitCostCents && totalUnits > 0 ? Math.round(unitCostCents / totalUnits) : null;

  function setLine(i: number, change: Partial<Line>) {
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...change } : l)));
  }

  async function save() {
    setError(null);
    const useful = lines
      .map((l) => ({ name: l.name.trim(), qty: Number(l.qty) }))
      .filter((l) => l.name !== "" && Number.isFinite(l.qty) && l.qty > 0);

    if (useful.length === 0) {
      setError("List at least one thing that was in the box.");
      return;
    }
    if (!unitCostCents) {
      setError("This kit has no cost recorded, so there's nothing to split.");
      return;
    }
    setBusy(true);

    const units = useful.reduce((t, l) => t + l.qty, 0);
    const each = Math.round(unitCostCents / units);

    // Create the contents as products in their own right.
    const { data: made, error: e1 } = await supabase
      .from("products")
      .insert(
        useful.map((l) => ({
          name: l.name,
          brand,
          supplier,
          unit_cost_cents: each,
          sells_retail: true,
          used_at_backbar: true,
        })),
      )
      .select("id,name");

    if (e1 || !made) {
      setError(e1?.message ?? "Couldn't add those.");
      setBusy(false);
      return;
    }

    // Receive them, dated today — the kit's own arrival is already recorded
    // against the invoice, and this is when we learned what was inside.
    const byName = new Map(made.map((p) => [String(p.name), String(p.id)]));
    const { error: e2 } = await supabase.from("inventory_movements").insert(
      useful.map((l) => ({
        product_id: byName.get(l.name)!,
        kind: "received" as const,
        quantity: l.qty,
        unit_cost_cents: each,
        note: `From ${productName}`,
      })),
    );
    if (e2) {
      setError(e2.message);
      setBusy(false);
      return;
    }

    // Retire the box. An 'adjusted' movement rather than deleting the original
    // receipt, because the kit really did arrive and the invoice really did
    // bill it — the ledger should say it was opened, not pretend it never came.
    const { error: e3 } = await supabase.from("inventory_movements").insert({
      product_id: productId,
      kind: "adjusted",
      quantity: -1,
      note: `Opened and split into ${useful.length} product${useful.length === 1 ? "" : "s"}`,
    });
    if (e3) {
      setError(e3.message);
      setBusy(false);
      return;
    }

    // Out of the catalogue, but not deleted: its movements are history.
    await supabase.from("products").update({ active: false }).eq("id", productId);

    setBusy(false);
    onDone();
  }

  return (
    <div className="mt-3 rounded-xl border border-foreground/15 bg-white/60 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <PackageOpen size={15} />
        What was in it?
      </p>
      <p className="mt-1 text-xs text-muted">
        The order doesn&rsquo;t say, so nobody but you knows. Its{" "}
        {unitCostCents ? `$${(unitCostCents / 100).toFixed(2)}` : "cost"} is split across
        whatever you list
        {perUnit !== null && totalUnits > 0 && (
          <>
            {" "}
            — <span className="text-foreground">${(perUnit / 100).toFixed(2)} each</span>{" "}
            across {totalUnits}
          </>
        )}
        .
      </p>

      <div className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={l.name}
              onChange={(e) => setLine(i, { name: e.target.value })}
              placeholder="Care Studio Repair Shampoo 250ml"
              className="min-w-0 flex-1 rounded-lg border border-foreground/15 px-2 py-1.5 text-sm"
            />
            <input
              value={l.qty}
              onChange={(e) => setLine(i, { qty: e.target.value })}
              inputMode="numeric"
              className="w-16 rounded-lg border border-foreground/15 px-2 py-1.5 text-sm tabular-nums"
            />
            {lines.length > 1 && (
              <button
                onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                className="text-muted transition hover:text-foreground"
                aria-label="Remove"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => setLines((ls) => [...ls, { name: "", qty: "1" }])}
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-foreground"
      >
        <Plus size={13} />
        Another
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg border border-foreground/15 px-3 py-1.5 text-sm font-medium transition hover:border-foreground/30 disabled:opacity-60"
        >
          {busy ? "Splitting…" : "Split it"}
        </button>
        <button
          onClick={onDone}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
