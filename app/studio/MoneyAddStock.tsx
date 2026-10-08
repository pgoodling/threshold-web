"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Named } from "../../lib/productLine";
import { salonToday } from "../../lib/stockEvents";
import { UNITS, splitSize } from "../../lib/stockSize";

// Stock that didn't come with an order PDF: a run to the beauty supply, a
// bottle a rep left, a box whose paperwork went in the bin.
//
// What she paid is required. It's the one thing an order PDF would have told
// us, and without it every bottle from this delivery goes into her product
// cost at nothing.

type Product = {
  product_id: string;
  name: string;
  brand: string | null;
};

export default function MoneyAddStock({
  products,
  named,
  onAdded,
}: {
  products: Product[];
  named: Map<string, Named>;
  onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [qty, setQty] = useState("1");
  const [paid, setPaid] = useState("");
  const [date, setDate] = useState(salonToday());
  const [sizeAmount, setSizeAmount] = useState("");
  // A new product's brand. Without it a hand-added Keune bottle lands under
  // "Other" with its full name, instead of under its range like the rest.
  const [brand, setBrand] = useState("");
  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand?.trim()).filter(Boolean) as string[])].sort(),
    [products],
  );
  const [sizeUnit, setSizeUnit] = useState<string>("fl oz");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle === "" || picked || isNew) return [];
    return products
      .filter((p) => `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [products, q, picked, isNew]);

  function label(p: Product) {
    const n = named.get(p.product_id);
    return n ? { title: n.short, sub: [n.group, n.size].filter(Boolean).join(" · ") } : { title: p.name, sub: "" };
  }

  function pick(p: Product) {
    setPicked(p);
    // Fill the size from what's already known, so she only types it once.
    const s = splitSize(named.get(p.product_id)?.size);
    setSizeAmount(s.amount);
    setSizeUnit(s.unit);
  }

  async function save() {
    setError(null);
    const size = sizeAmount.trim() ? `${Number(sizeAmount)} ${sizeUnit}` : null;
    if (sizeAmount.trim() && !(Number(sizeAmount) > 0)) return setError("Size should be a number, like 10.1.");
    const n = Number(qty);
    const cents = Math.round(Number(paid.replace(/[$,\s]/g, "")) * 100);
    if (!picked && !(isNew && q.trim())) return setError("Pick a product first.");
    if (!Number.isInteger(n) || n <= 0) return setError("How many should be a whole number.");
    if (paid.trim() === "" || !Number.isFinite(cents) || cents < 0)
      return setError("Enter what she paid for each.");

    setBusy(true);
    let productId = picked?.product_id;
    const productName = picked?.name ?? q.trim();

    if (!productId) {
      const { data, error: e } = await supabase
        .from("products")
        .insert({ name: productName, unit_cost_cents: cents, size, brand: brand.trim() || null })
        .select("id")
        .single();
      if (e || !data) {
        setBusy(false);
        return setError(e?.message ?? "Couldn't add that product.");
      }
      productId = String(data.id);
    }

    const { error: e2 } = await supabase.from("inventory_movements").insert({
      product_id: productId,
      kind: "received",
      quantity: n,
      unit_cost_cents: cents,
      occurred_on: date,
      note: "Added by hand",
    });
    if (e2) {
      setBusy(false);
      return setError(e2.message);
    }
    // The latest price she paid is the cost from now on, same as an order.
    // A size typed here is the better record than one guessed from the name.
    if (picked) {
      await supabase
        .from("products")
        .update(size ? { unit_cost_cents: cents, size } : { unit_cost_cents: cents })
        .eq("id", productId);
    }

    setBusy(false);
    setDone(`${n} × ${picked ? label(picked).title : productName} added`);
    setQ("");
    setPicked(null);
    setIsNew(false);
    setQty("1");
    setPaid("");
    setSizeAmount("");
    setBrand("");
    onAdded();
  }

  const field =
    "w-full rounded-lg border border-foreground/15 bg-white px-3 py-2 text-base outline-none focus:border-foreground/40 sm:text-sm";

  return (
    <div className="mt-8 border-t border-foreground/15 pt-6">
      <p className="text-sm text-muted">Or by hand</p>

      <label className="mt-3 block text-sm text-muted">Product</label>
      {picked ? (
        <button
          onClick={() => setPicked(null)}
          className="min-h-11 inline-flex items-center mt-1 w-full rounded-lg border border-foreground/15 bg-white px-3 text-left"
        >
          <span className="block text-[15px]">{label(picked).title}</span>
          <span className="block text-xs text-muted">{label(picked).sub}</span>
        </button>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIsNew(false);
              setDone(null);
            }}
            placeholder="Start typing a name"
            className={`mt-1 ${field}`}
          />
          {isNew && (
            <label className="mt-3 block text-sm text-muted">
              Brand
              <input
                list="known-brands"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Keune"
                className={`mt-1 ${field} text-foreground`}
              />
              <datalist id="known-brands">
                {brands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
          )}
          {(matches.length > 0 || (q.trim() !== "" && !isNew)) && (
            <div className="mt-1 overflow-hidden rounded-lg border border-foreground/15 bg-white">
              {matches.map((p) => (
                <button
                  key={p.product_id}
                  onClick={() => pick(p)}
                  className="min-h-11 flex w-full items-center border-t border-foreground/10 px-3 text-left first:border-t-0 hover:bg-foreground/[0.03]"
                >
                  <span className="block text-[15px]">{label(p).title}</span>
                  <span className="block text-xs text-muted">{label(p).sub}</span>
                </button>
              ))}
              <button
                onClick={() => setIsNew(true)}
                className="min-h-11 flex w-full items-center border-t border-foreground/10 px-3 text-left text-sm text-muted first:border-t-0 hover:bg-foreground/[0.03]"
              >
                Add &ldquo;{q.trim()}&rdquo; as a new product
              </button>
            </div>
          )}
        </>
      )}

      <div className="mt-3 flex gap-3">
        <label className="flex-1 text-sm text-muted">
          Size
          <input
            inputMode="decimal"
            value={sizeAmount}
            onChange={(e) => setSizeAmount(e.target.value)}
            placeholder="10.1"
            className={`mt-1 ${field} text-foreground`}
          />
        </label>
        <label className="flex-1 text-sm text-muted">
          Unit
          <select
            value={sizeUnit}
            onChange={(e) => setSizeUnit(e.target.value)}
            className={`mt-1 ${field} text-foreground`}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block text-sm text-muted">
        Date it arrived
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`mt-1 ${field} text-foreground`}
        />
      </label>

      <div className="mt-3 flex gap-3">
        <label className="flex-1 text-sm text-muted">
          How many
          <input
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={`mt-1 ${field} text-foreground`}
          />
        </label>
        <label className="flex-1 text-sm text-muted">
          Paid each
          <input
            inputMode="decimal"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            placeholder="$"
            className={`mt-1 ${field} text-foreground`}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={busy}
        className="inline-flex min-h-11 items-center justify-center mt-4 w-full rounded-[10px] bg-accent px-4 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {busy ? "Adding…" : `Add ${Number(qty) > 0 ? qty : ""}`.trim()}
      </button>

      {done && (
        <p className="mt-3 flex items-center gap-1.5 text-sm">
          <Check size={15} className="text-accent" /> {done}
        </p>
      )}
    </div>
  );
}
