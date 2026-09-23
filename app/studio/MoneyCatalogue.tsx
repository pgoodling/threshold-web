"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Package } from "lucide-react";
import { supabase } from "../../lib/supabase";

// The catalogue: what she stocks, what it costs, what it sells for.
//
// Its real job is correcting guesses. An uploaded invoice files 94 products
// without asking her anything, and some of that is wrong by construction — a
// 68-piece intro kit is not a unit of anything, and whether a shampoo sells or
// goes on the back bar is something only she knows.
//
// So the default view is "needs you", not "everything". A list of 94 rows with
// no opinion about which ones matter is a list nobody reads.
//
// Every edit saves immediately. There is no Save button, because a screen
// whose whole purpose is dozens of small corrections should not also ask her
// to remember to commit them.

type Row = {
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
  active: boolean;
};

type Filter = "attention" | "retail" | "backbar" | "all";

const money = (c: number | null) =>
  c === null ? "—" : `$${(c / 100).toFixed(2)}`;

/**
 * Worth her looking at?
 *
 * Two cases. Something marked for sale with no price can't be sold, and
 * something flagged as both is the importer admitting it couldn't tell.
 */
function needsAttention(r: Row): boolean {
  if (r.sells_retail && r.retail_price_cents === null) return true;
  if (r.sells_retail && r.used_at_backbar) return true;
  return false;
}

export default function MoneyCatalogue() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("attention");
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("product_stock")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) setError(e.message);
        setRows((data ?? []) as Row[]);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Optimistic: she is making dozens of small corrections and a round trip
  // between each one would make the screen feel broken.
  async function patch(id: string, change: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.product_id === id ? { ...r, ...change } : r)));
    const { error: e } = await supabase
      .from("products")
      .update(change)
      .eq("id", id);
    if (e) {
      setError(e.message);
      setReloadKey((k) => k + 1); // put it back to what the database thinks
    }
  }

  const counts = useMemo(
    () => ({
      attention: rows.filter(needsAttention).length,
      retail: rows.filter((r) => r.sells_retail).length,
      backbar: rows.filter((r) => r.used_at_backbar).length,
      all: rows.length,
    }),
    [rows],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === "attention") return needsAttention(r);
        if (filter === "retail") return r.sells_retail;
        if (filter === "backbar") return r.used_at_backbar;
        return true;
      })
      .filter((r) =>
        needle === ""
          ? true
          : `${r.name} ${r.brand ?? ""} ${r.sku ?? ""}`.toLowerCase().includes(needle),
      );
  }, [rows, filter, q]);

  if (loading) return <p className="mt-6 text-sm text-muted">Loading…</p>;

  if (rows.length === 0) {
    return (
      <div className="mt-6 flex max-w-prose items-center gap-3 rounded-xl border border-foreground/15 bg-white p-4 text-sm shadow-sm">
        <Package size={16} className="text-muted" />
        <p>
          Nothing stocked yet. Upload a supplier order above and everything on it lands
          here with its cost.
        </p>
      </div>
    );
  }

  const TABS: [Filter, string][] = [
    ["attention", "Needs you"],
    ["retail", "Sells"],
    ["backbar", "Back bar"],
    ["all", "Everything"],
  ];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              filter === key
                ? "border-foreground/30 bg-white font-medium shadow-sm"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs text-muted">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-foreground/15 bg-white px-3 py-2 shadow-sm">
        <Search size={15} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, brand or SKU"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {filter === "attention"
            ? "Nothing needs you — every product has been checked."
            : "Nothing matches that."}
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          {shown.map((r) => (
            <div key={r.product_id} className="flex gap-3 border-t border-foreground/10 first:border-t-0">
              {/* Use on the left as a stripe: amber while it still needs her. */}
              <span
                className={`w-1 shrink-0 ${
                  needsAttention(r)
                    ? "bg-amber-400"
                    : r.sells_retail
                      ? "bg-accent/50"
                      : "bg-foreground/15"
                }`}
                aria-hidden
              />

              <div className="min-w-0 flex-1 py-3 pr-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted">
                      {[r.brand, r.size, r.sku ? `#${r.sku}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-muted tabular-nums">
                    {r.on_hand} on hand · costs {money(r.unit_cost_cents)}
                  </p>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={r.sells_retail}
                      onChange={(e) =>
                        patch(r.product_id, { sells_retail: e.target.checked })
                      }
                    />
                    She sells it
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={r.used_at_backbar}
                      onChange={(e) =>
                        patch(r.product_id, { used_at_backbar: e.target.checked })
                      }
                    />
                    Back bar
                  </label>

                  {r.sells_retail && (
                    <label className="flex items-center gap-1.5 text-sm text-muted">
                      Sells for
                      <input
                        inputMode="decimal"
                        defaultValue={
                          r.retail_price_cents === null
                            ? ""
                            : (r.retail_price_cents / 100).toFixed(2)
                        }
                        placeholder="0.00"
                        onBlur={(e) => {
                          const raw = e.target.value.replace(/[$,\s]/g, "");
                          const cents = raw === "" ? null : Math.round(Number(raw) * 100);
                          if (cents !== null && !Number.isFinite(cents)) return;
                          if (cents !== r.retail_price_cents) {
                            patch(r.product_id, { retail_price_cents: cents });
                          }
                        }}
                        className="w-20 rounded-lg border border-foreground/15 px-2 py-1 text-sm text-foreground tabular-nums"
                      />
                    </label>
                  )}

                  {r.sells_retail &&
                    r.retail_price_cents !== null &&
                    r.unit_cost_cents !== null &&
                    r.unit_cost_cents > 0 && (
                      <span className="text-xs text-muted tabular-nums">
                        {Math.round(
                          ((r.retail_price_cents - r.unit_cost_cents) /
                            r.retail_price_cents) *
                            100,
                        )}
                        % margin
                      </span>
                    )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 max-w-prose text-xs text-muted">
        Changes save as you make them. &ldquo;Needs you&rdquo; is anything for sale
        without a price, or anything the importer couldn&rsquo;t tell apart and marked
        as both — an intro kit especially, since a 68-piece box isn&rsquo;t one of
        anything.
      </p>
    </div>
  );
}
