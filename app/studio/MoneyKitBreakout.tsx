"use client";

import { useState } from "react";
import { PackageOpen, Plus, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  parsePastedList,
  normaliseProductName,
  type KitLine as Line,
} from "../../lib/kitList";

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
  onDone: (matched?: number, created?: number) => void;
}) {
  const [lines, setLines] = useState<Line[]>([{ name: "", qty: "1" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(true);

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

    // Match what she already stocks before creating anything.
    //
    // A kit's packing list names a bottle slightly differently from the
    // invoice that sold her the same bottle outright — "6.8 oz." against "6.8
    // Fl. Oz." — so taken literally the kit's units would land on a brand new
    // near-duplicate and never join the stock she has. The catalogue grows a
    // twin nobody notices until a count disagrees with itself.
    const { data: existing } = await supabase
      .from("products")
      .select("id,name")
      .eq("active", true);

    const byNorm = new Map<string, string>();
    for (const p of existing ?? []) {
      byNorm.set(normaliseProductName(String(p.name)), String(p.id));
    }

    const matched = useful.filter((l) => byNorm.has(normaliseProductName(l.name)));
    const fresh = useful.filter((l) => !byNorm.has(normaliseProductName(l.name)));

    if (fresh.length > 0) {
      const { data: made, error: e1 } = await supabase
        .from("products")
        .insert(
          fresh.map((l) => ({
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
      for (const p of made) {
        byNorm.set(normaliseProductName(String(p.name)), String(p.id));
      }
    }

    // Matched products keep their own catalogue cost. The one she bought
    // outright cost $15; these came in at the kit's allocated rate. Both are
    // true, and the movement is where a cost belongs — the catalogue figure
    // should stay the price of buying another one.
    const { error: e2 } = await supabase.from("inventory_movements").insert(
      useful.map((l) => ({
        product_id: byNorm.get(normaliseProductName(l.name))!,
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
    onDone(matched.length, fresh.length);
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

      {showPaste ? (
        <div className="mt-3">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={6}
            placeholder={
              "Paste the contents, one per line:\n" +
              "3 Color Brillianz Anti-fade Shampoo 10.1 oz.\n" +
              "2 Long & Strong Super Serum 3.4 oz.\n" +
              "1 Care Studio Plus Merchandising Kit"
            }
            className="w-full rounded-lg border border-foreground/15 px-2 py-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => {
                const parsed = parsePastedList(paste);
                if (parsed.length === 0) {
                  setError("Couldn't read any lines. Each one needs a number, then a name.");
                  return;
                }
                setError(null);
                setLines(parsed);
                setShowPaste(false);
              }}
              className="rounded-lg border border-foreground/15 px-3 py-1.5 text-sm font-medium transition hover:border-foreground/30"
            >
              Read the list
            </button>
            <button
              onClick={() => setShowPaste(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
            >
              Type them instead
            </button>
          </div>
        </div>
      ) : (
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
      )}

      {!showPaste && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setLines((ls) => [...ls, { name: "", qty: "1" }])}
            className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-foreground"
          >
            <Plus size={13} />
            Another
          </button>
          <button
            onClick={() => setShowPaste(true)}
            className="text-xs text-muted transition hover:text-foreground"
          >
            Paste a list instead
          </button>
        </div>
      )}

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
          onClick={() => onDone()}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
