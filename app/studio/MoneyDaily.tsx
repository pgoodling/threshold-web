"use client";

import { useEffect, useMemo, useState } from "react";
import { Undo2, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Opening something for the back bar.
//
// This used to offer "Sold one" as well, which was wrong: a sale takes money,
// adds sales tax and belongs to an appointment, and none of that fits a button
// on a stock screen. Check-out owns sales now. This owns one thing — a tube
// came off the shelf and went on a head.
//
// Tiles rather than a searchable list, because she is doing this between
// clients with colour on her hands. The six she reaches for most are worked
// out from what she has actually been opening, so the common case is one tap
// and no reading. Everything else is a search away.
//
// A consequence worth noticing: if every sale goes through check-out and every
// open goes through here, then anything short at a stock count was used. The
// count never has to ask.

type Product = {
  product_id: string;
  name: string;
  brand: string | null;
  size: string | null;
  unit_cost_cents: number | null;
  on_hand: number;
  last_movement_on: string | null;
};

/** How many get a tile. More than this and it stops being scannable. */
const TILES = 6;

export default function MoneyDaily() {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [opened, setOpened] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let alive = true;
    supabase
      .from("product_stock")
      .select("*")
      .eq("active", true)
      .eq("used_at_backbar", true)
      .order("last_movement_on", { ascending: false, nullsFirst: false })
      .limit(400)
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) setError(e.message);
        setProducts((data ?? []) as Product[]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  async function open(p: Product) {
    setBusyId(p.product_id);
    setError(null);
    const { data, error: e } = await supabase
      .from("inventory_movements")
      .insert({
        product_id: p.product_id,
        kind: "used",
        quantity: -1,
        unit_cost_cents: p.unit_cost_cents,
      })
      .select("id")
      .single();

    if (e || !data) {
      setError(e?.message ?? "Couldn't record that.");
      setBusyId(null);
      return;
    }
    // Move the count locally — a refetch between taps makes the screen feel
    // like it is thinking, and she is mid-colour.
    setProducts((ps) =>
      ps.map((x) => (x.product_id === p.product_id ? { ...x, on_hand: x.on_hand - 1 } : x)),
    );
    setOpened((o) => [{ id: String(data.id), name: p.name }, ...o]);
    setBusyId(null);
  }

  async function undo(id: string) {
    await supabase.from("inventory_movements").delete().eq("id", id);
    setOpened((o) => o.filter((x) => x.id !== id));
    setReloadKey((k) => k + 1);
  }

  const tiles = useMemo(() => products.slice(0, TILES), [products]);
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle === "") return [];
    return products
      .filter((p) => `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 20);
  }, [products, q]);

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  if (products.length === 0) {
    return (
      <p className="max-w-prose text-sm text-muted">
        Nothing marked as back bar yet. Upload a supplier order, then tick{" "}
        <span className="text-foreground">Back bar</span> on whatever she uses on
        clients.
      </p>
    );
  }

  return (
    <div>
      <p className="max-w-prose text-sm text-muted">
        One tap takes it off the shelf. Things she sells go through check-out, not
        here.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((p) => (
          <button
            key={p.product_id}
            onClick={() => open(p)}
            disabled={busyId === p.product_id}
            className="rounded-xl border border-foreground/15 bg-white p-3 text-left shadow-sm transition hover:border-foreground/30 disabled:opacity-40"
          >
            <span className="block text-sm font-medium leading-snug">{p.name}</span>
            <span
              className={`mt-0.5 block text-xs ${
                p.on_hand <= 0 ? "text-red-600" : p.on_hand <= 2 ? "text-amber-600" : "text-muted"
              }`}
            >
              {p.on_hand} left
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-foreground/15 bg-white px-3 py-2 shadow-sm">
        <Search size={15} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Something else…"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {found.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          {found.map((p) => (
            <button
              key={p.product_id}
              onClick={() => {
                void open(p);
                setQ("");
              }}
              disabled={busyId === p.product_id}
              className="flex w-full items-center justify-between gap-3 border-t border-foreground/10 px-3 py-2.5 text-left text-sm transition first:border-t-0 hover:bg-foreground/[0.03] disabled:opacity-40"
            >
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="shrink-0 text-xs text-muted">{p.on_hand} left</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {opened.length > 0 && (
        <div className="mt-4 border-t border-foreground/15 pt-3 text-sm">
          <p className="text-xs text-muted">Opened today</p>
          {opened.map((o) => (
            <div key={o.id} className="mt-1.5 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{o.name}</span>
              <button
                onClick={() => undo(o.id)}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-muted transition hover:text-foreground"
              >
                <Undo2 size={12} />
                Undo
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 max-w-prose text-xs text-muted">
        The six above are whatever she&rsquo;s been reaching for most recently.
      </p>
    </div>
  );
}
