"use client";

import { useMemo, useState } from "react";
import { PackageOpen } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { parsePastedList, normaliseProductName } from "../../lib/kitList";

// Breaking a kit into what was actually in it.
//
// Some suppliers itemise a kit's contents as $0.00 lines on the same order and
// the importer spreads the price across those by itself. Keune's "Care Studio
// Plus Intro 68 pc." is billed as one line at $649 with nothing anywhere
// naming the 68 pieces, so there is nothing to allocate to. Only she knows
// what was inside, and this is where she says it.
//
// ONE BOX, NOT TWO MODES
//
// The first version had a textarea for pasting AND a row editor, with separate
// "Read the list" and "Split it" buttons. Split it read the empty row behind
// the textarea, announced "$649.00 each across 1", and then refused — which is
// exactly as confusing as it sounds.
//
// The list is already text wherever it comes from: a product page, a packing
// slip, an email. So it stays text. It parses as she types, the arithmetic
// updates under her eyes, and there is one button.

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
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parsed on every keystroke: cheap, and it means the number she is about to
  // commit to is the number she has been watching.
  const lines = useMemo(
    () =>
      parsePastedList(text)
        .map((l) => ({ name: l.name.trim(), qty: Number(l.qty) }))
        .filter((l) => l.name !== "" && Number.isFinite(l.qty) && l.qty > 0),
    [text],
  );

  const units = lines.reduce((t, l) => t + l.qty, 0);
  const each = unitCostCents && units > 0 ? Math.round(unitCostCents / units) : null;

  async function save() {
    setError(null);
    if (lines.length === 0) {
      setError("Paste the contents first — a quantity and a name on each line.");
      return;
    }
    if (!unitCostCents) {
      setError("This kit has no cost recorded, so there's nothing to split.");
      return;
    }
    setBusy(true);
    const per = Math.round(unitCostCents / units);

    // Match what she already stocks before creating anything. A kit's packing
    // list writes "6.8 oz." where the invoice that sold her the same bottle
    // outright writes "6.8 Fl. Oz.", so taken literally the kit's units would
    // land on a near-duplicate and never join the stock she has.
    const { data: existing } = await supabase
      .from("products")
      .select("id,name")
      .eq("active", true);

    const byNorm = new Map<string, string>();
    for (const p of existing ?? []) {
      byNorm.set(normaliseProductName(String(p.name)), String(p.id));
    }

    const matched = lines.filter((l) => byNorm.has(normaliseProductName(l.name)));
    const fresh = lines.filter((l) => !byNorm.has(normaliseProductName(l.name)));

    if (fresh.length > 0) {
      const { data: made, error: e1 } = await supabase
        .from("products")
        .insert(
          fresh.map((l) => ({
            name: l.name,
            brand,
            supplier,
            unit_cost_cents: per,
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

    // Matched products keep their own catalogue cost: the bottle bought
    // outright cost $15, these came in at the kit rate, and both are true.
    // The movement is where a cost belongs.
    const { error: e2 } = await supabase.from("inventory_movements").insert(
      lines.map((l) => ({
        product_id: byNorm.get(normaliseProductName(l.name))!,
        kind: "received" as const,
        quantity: l.qty,
        unit_cost_cents: per,
        note: `From ${productName}`,
      })),
    );
    if (e2) {
      setError(e2.message);
      setBusy(false);
      return;
    }

    // Retire the box with an adjustment rather than by deleting its receipt:
    // the kit really did arrive and the invoice really did bill it, so the
    // ledger should say it was opened, not pretend it never came.
    const { error: e3 } = await supabase.from("inventory_movements").insert({
      product_id: productId,
      kind: "adjusted",
      quantity: -1,
      note: `Opened and split into ${lines.length} product${lines.length === 1 ? "" : "s"}`,
    });
    if (e3) {
      setError(e3.message);
      setBusy(false);
      return;
    }

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
        The order doesn&rsquo;t say, so nobody but you knows. Paste the contents — a
        quantity and a name on each line — and its{" "}
        {unitCostCents ? `$${(unitCostCents / 100).toFixed(2)}` : "cost"} is split
        across them.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={
          "3 Color Brillianz Anti-fade Shampoo 10.1 oz.\n" +
          "2 Long & Strong Super Serum 3.4 oz.\n" +
          "1 Vital Nutrition Nourishing Shampoo Liter"
        }
        className="mt-3 w-full rounded-lg border border-foreground/15 px-2 py-2 font-mono text-xs leading-relaxed"
      />

      {/* The arithmetic, live, so the figure she commits to is the one she has
          been watching change. */}
      <p className="mt-2 text-sm tabular-nums">
        {lines.length === 0 ? (
          <span className="text-muted">Nothing read yet.</span>
        ) : (
          <>
            <span className="font-medium">{lines.length}</span>
            <span className="text-muted"> lines · </span>
            <span className="font-medium">{units}</span>
            <span className="text-muted"> pieces</span>
            {each !== null && (
              <>
                <span className="text-muted"> · </span>
                <span className="font-medium">${(each / 100).toFixed(2)}</span>
                <span className="text-muted"> each</span>
              </>
            )}
          </>
        )}
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={busy || lines.length === 0}
          className="rounded-lg border border-foreground/15 px-3 py-1.5 text-sm font-medium transition hover:border-foreground/30 disabled:opacity-40"
        >
          {busy ? "Splitting…" : `Split into ${lines.length || ""} ${lines.length === 1 ? "product" : "products"}`}
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
