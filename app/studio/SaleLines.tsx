"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { nameProduct, byName } from "../../lib/productLine";
import { usd, type SaleLine } from "../../lib/retail";

// The product lines on a sale, shared by check-out and Sell so the two can't
// drift apart. "Add a product" opens the list in place rather than a second
// modal on top of the first.
//
// Products with no price are shown but can't be added — a reason to go and
// price them, rather than a sale at $0. Out of stock is allowed: if she's
// holding the bottle, it's the count that's wrong, not the sale.

type Product = {
  product_id: string;
  name: string;
  brand: string | null;
  size: string | null;
  retail_price_cents: number | null;
  on_hand: number;
};

export default function SaleLines({
  lines,
  onChange,
}: {
  lines: SaleLine[];
  onChange: (lines: SaleLine[]) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div>
      {lines.map((l) => (
        <div
          key={l.key}
          className="flex items-center gap-2 border-b border-foreground/10 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 leading-snug">
            {l.description}
            {l.sub && <span className="block text-xs text-muted">{l.sub}</span>}
          </span>
          <span className="tabular-nums">{usd(l.unit_price_cents)}</span>
          <button
            onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
            aria-label={`Remove ${l.description}`}
            className="-my-2 -mr-2 inline-flex h-11 w-11 items-center justify-center text-muted hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>
      ))}

      {picking ? (
        <Picker
          onPick={(l) => {
            onChange([...lines, l]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="min-h-11 inline-flex items-center inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-dark"
        >
          <Plus size={15} /> Add a product
        </button>
      )}
    </div>
  );
}

function Picker({
  onPick,
  onClose,
}: {
  onPick: (l: SaleLine) => void;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("product_stock")
      .select("product_id,name,brand,size,retail_price_cents,on_hand")
      .eq("active", true)
      .eq("sells_retail", true)
      .then(({ data }) => {
        if (alive) setProducts((data ?? []) as Product[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const by = new Map<string, { p: Product; short: string; size: string | null }[]>();
    for (const p of products ?? []) {
      if (needle && !`${p.name} ${p.brand ?? ""}`.toLowerCase().includes(needle)) continue;
      const n = nameProduct(p);
      by.set(n.group, [...(by.get(n.group) ?? []), { p, short: n.short, size: n.size }]);
    }
    return [...by.entries()]
      .sort(([a], [b]) => byName(a, b))
      .map(([group, items]) => ({ group, items: items.sort((a, b) => byName(a.short, b.short)) }));
  }, [products, q]);

  function addCustom() {
    const cents = Math.round(Number(customPrice.replace(/[$,\s]/g, "")) * 100);
    if (!custom.trim()) return setCustomError("What is it?");
    if (customPrice.trim() === "" || !Number.isFinite(cents) || cents <= 0)
      return setCustomError("Enter a price.");
    onPick({
      key: crypto.randomUUID(),
      product_id: null,
      description: custom.trim(),
      sub: "not from stock",
      unit_price_cents: cents,
      quantity: 1,
    });
  }

  const field =
    "rounded-lg border border-foreground/15 bg-white px-3 py-2 text-base outline-none focus:border-foreground/40 sm:text-sm";

  return (
    <div className="mt-2 rounded-xl border border-foreground/15 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-base">Add a product</span>
        <button onClick={onClose} aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center -my-2 -mr-2.5 p-1 text-muted hover:text-foreground">
          <X size={17} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-lg border border-foreground/15 px-3 py-2">
        <Search size={15} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="w-full bg-transparent text-base outline-none sm:text-sm"
        />
      </div>

      <div className="mt-3 rounded-lg bg-foreground/[0.04] p-3">
        <p className="text-sm">Something else</p>
        <input
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setCustomError(null);
          }}
          placeholder="Wide-tooth comb"
          className={`mt-2 w-full ${field}`}
        />
        <div className="mt-2 flex gap-2">
          <input
            inputMode="decimal"
            value={customPrice}
            onChange={(e) => {
              setCustomPrice(e.target.value);
              setCustomError(null);
            }}
            placeholder="$"
            className={`min-w-0 flex-1 ${field}`}
          />
          <button
            onClick={addCustom}
            className="min-h-11 inline-flex items-center rounded-lg border border-foreground/20 bg-white px-4 text-sm font-medium hover:border-foreground/40"
          >
            Add
          </button>
        </div>
        {customError && <p className="mt-1.5 text-xs text-red-600">{customError}</p>}
      </div>

      <div className="mt-2 max-h-80 overflow-y-auto">
        {products === null ? (
          <p className="py-3 text-sm text-muted">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="py-3 text-sm text-muted">Nothing marked for sale matches.</p>
        ) : (
          groups.map(({ group, items }) => (
            <section key={group} className="mt-3">
              <h4 className="font-display text-sm">{group}</h4>
              {items.map(({ p, short, size }) => {
                const priced = p.retail_price_cents !== null;
                return (
                  <button
                    key={p.product_id}
                    disabled={!priced}
                    onClick={() =>
                      onPick({
                        key: crypto.randomUUID(),
                        product_id: p.product_id,
                        description: `${group.includes(" · ") ? group.split(" · ")[1] + " " : ""}${short}`,
                        sub: size ?? "",
                        unit_price_cents: p.retail_price_cents!,
                        quantity: 1,
                      })
                    }
                    className="min-h-11 flex w-full items-center gap-2 border-b border-foreground/10 text-left text-sm disabled:text-muted"
                  >
                    <span className="min-w-0 flex-1 leading-snug">
                      {short}
                      <span className="block text-xs text-muted">
                        {[size, priced ? `${Number(p.on_hand)} on shelf` : "no price yet"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {priced ? usd(p.retail_price_cents!) : "—"}
                    </span>
                  </button>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
