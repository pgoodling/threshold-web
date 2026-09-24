"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Undo2, ShoppingBag, FlaskConical } from "lucide-react";
import { supabase } from "../../lib/supabase";

// What left the shelf today.
//
// This is the only screen here she touches during a working day, between
// clients, on a phone. So it is two taps: find the thing, say whether it sold
// or was opened. Quantity defaults to one because it almost always is, and the
// stepper is there for the times it isn't.
//
// Sold and Opened are not cosmetic labels. Sold is cost of goods against
// retail revenue; opened is a supply consumed delivering a service. Same tube,
// two different answers at tax time, and this is the only moment anyone knows
// which happened.
//
// Everything is undoable, because a mis-tap on a phone between clients is not
// a hypothetical and nobody will come back later to fix it.

type Product = {
  product_id: string;
  sku: string | null;
  brand: string | null;
  name: string;
  size: string | null;
  unit_cost_cents: number | null;
  retail_price_cents: number | null;
  sells_retail: boolean;
  used_at_backbar: boolean;
  on_hand: number;
  last_movement_on: string | null;
};

type Appt = { id: string; label: string };

const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);

export default function MoneyDaily() {
  const [products, setProducts] = useState<Product[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apptId, setApptId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [last, setLast] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      supabase
        .from("product_stock")
        .select("*")
        .eq("active", true)
        .order("last_movement_on", { ascending: false, nullsFirst: false })
        .limit(400),
      // Today's appointments, so "who was this for" is one tap rather than a
      // search. Optional throughout — a sale to someone walking past has no
      // appointment, and refusing to record it would be worse than not knowing.
      supabase
        .from("appointments")
        .select("id,starts_at,clients(full_name)")
        .gte("starts_at", `${today}T00:00:00`)
        .lte("starts_at", `${today}T23:59:59`)
        .not("status", "in", "(cancelled,no_show)")
        .order("starts_at", { ascending: true }),
    ]).then(([p, a]) => {
      if (!alive) return;
      if (p.error) setError(p.error.message);
      setProducts((p.data ?? []) as Product[]);
      setAppts(
        (a.data ?? []).map((r) => {
          const c = r.clients as unknown as { full_name?: string } | null;
          const t = new Date(String(r.starts_at)).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });
          return { id: String(r.id), label: `${t} · ${c?.full_name ?? "—"}` };
        }),
      );
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  async function log(p: Product, kind: "sold" | "used") {
    setBusyId(p.product_id);
    setError(null);
    const { data, error: e } = await supabase
      .from("inventory_movements")
      .insert({
        product_id: p.product_id,
        kind,
        quantity: -1, // out of stock; the constraint requires the sign to match
        unit_cost_cents: p.unit_cost_cents,
        unit_price_cents: kind === "sold" ? p.retail_price_cents : null,
        appointment_id: apptId || null,
      })
      .select("id")
      .single();

    if (e || !data) {
      setError(e?.message ?? "Couldn't record that.");
      setBusyId(null);
      return;
    }

    // Move on-hand locally so the number is right immediately; a refetch
    // between every tap would make the screen feel like it was thinking.
    setProducts((ps) =>
      ps.map((x) =>
        x.product_id === p.product_id ? { ...x, on_hand: x.on_hand - 1 } : x,
      ),
    );
    setLast({
      id: String(data.id),
      label: `${p.name} — ${kind === "sold" ? "sold" : "opened"}`,
    });
    setBusyId(null);
  }

  async function undo() {
    if (!last) return;
    await supabase.from("inventory_movements").delete().eq("id", last.id);
    setLast(null);
    setReloadKey((k) => k + 1);
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle === "") return products.slice(0, 12);
    return products
      .filter((p) =>
        `${p.name} ${p.brand ?? ""} ${p.sku ?? ""}`.toLowerCase().includes(needle),
      )
      .slice(0, 30);
  }, [products, q]);

  if (loading) return <p className="mt-6 text-sm text-muted">Loading…</p>;

  if (products.length === 0) {
    return (
      <p className="mt-4 max-w-prose text-sm text-muted">
        Nothing stocked yet — upload a supplier order and it&rsquo;ll appear here.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {appts.length > 0 && (
        <label className="block max-w-prose text-xs text-muted">
          Who it was for <span className="font-normal">(optional)</span>
          <select
            value={apptId}
            onChange={(e) => setApptId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-foreground/15 bg-white px-2 py-2 text-sm text-foreground"
          >
            <option value="">Nobody in particular</option>
            {appts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-foreground/15 bg-white px-3 py-2 shadow-sm">
        <Search size={15} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a product"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {last && (
        <button
          onClick={undo}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-foreground"
        >
          <Undo2 size={13} />
          Undo — {last.label}
        </button>
      )}

      <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
        {shown.map((p) => (
          <div key={p.product_id} className="flex gap-3 border-t border-foreground/10 first:border-t-0">
            {/* Low stock on the left, where status lives everywhere else here. */}
            <span
              className={`w-1 shrink-0 ${
                p.on_hand <= 0 ? "bg-red-400" : p.on_hand <= 2 ? "bg-amber-400" : "bg-foreground/10"
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1 py-3 pr-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted">
                    {[p.brand, p.size].filter(Boolean).join(" · ")}
                    {p.retail_price_cents !== null && ` · sells ${money(p.retail_price_cents)}`}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-xs tabular-nums ${
                    p.on_hand <= 0 ? "text-red-600" : "text-muted"
                  }`}
                >
                  {p.on_hand} left
                </p>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                {p.sells_retail && (
                  <button
                    onClick={() => log(p, "sold")}
                    disabled={busyId === p.product_id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 px-3 py-2 text-sm font-medium transition hover:border-foreground/30 disabled:opacity-40"
                  >
                    <ShoppingBag size={14} />
                    Sold one
                  </button>
                )}
                {p.used_at_backbar && (
                  <button
                    onClick={() => log(p, "used")}
                    disabled={busyId === p.product_id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 px-3 py-2 text-sm font-medium transition hover:border-foreground/30 disabled:opacity-40"
                  >
                    <FlaskConical size={14} />
                    Opened one
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 max-w-prose text-xs text-muted">
        {q.trim() === ""
          ? "Showing what she touched most recently — search for anything else."
          : `${shown.length} match${shown.length === 1 ? "" : "es"}.`}{" "}
        Sold and opened are different things at tax time: sold is stock against
        retail takings, opened is a supply used on a client. This is the only moment
        anyone knows which it was.
      </p>
    </div>
  );
}
