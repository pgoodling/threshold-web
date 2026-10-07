"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Plus, ClipboardList, Search, X, PackageOpen, Undo2, Receipt } from "lucide-react";
import MoneyInvoice from "./MoneyInvoice";
import MoneyAddStock from "./MoneyAddStock";
import MoneyCount from "./MoneyCount";
import MoneySell from "./MoneySell";
import MoneyKitBreakout from "./MoneyKitBreakout";
import { supabase } from "../../lib/supabase";
import { nameProduct, byName, type Named } from "../../lib/productLine";
import { describe, shortDate, type Movement } from "../../lib/stockEvents";

// Inventory: the one place stock changes.
//
// Four things move a bottle, and each has exactly one way in:
//
//   arrives            Add stock — an order PDF, or by hand
//   goes into use      Put one on the bar       shelf −1, bar +1
//   is empty           Finished one             bar −1
//   the number's wrong Count                    what's short is "missing"
//
// Sales are the fifth: at check-out, or with Sell here for someone buying
// without an appointment. Both go through record_retail_sale (0047).
//
// There is no − and + on a product, on purpose. A − would be indistinguishable
// from "I opened one", but it wouldn't be recorded as use, so her product cost
// would quietly read low; a + would bring stock in with no cost attached.
//
// Two numbers per product because she thinks in two places: what's sealed on
// the shelf, and what's open on the back bar. See migration 0046.
//
// Phone first. The supplier's names run range, product and size together, and
// on a phone the part that matters is the part that gets cut off — so the
// range is a heading and each row carries only the rest, wrapped, never
// truncated.

type Row = {
  product_id: string;
  sku: string | null;
  supplier: string | null;
  brand: string | null;
  name: string;
  size: string | null;
  unit_cost_cents: number | null;
  retail_price_cents: number | null;
  sells_retail: boolean;
  used_at_backbar: boolean;
  on_hand: number;
  /** False once she's removed it. Hidden, never deleted, while it has history. */
  active: boolean;
  /** Absent until migration 0046 has run. */
  on_bar?: number;
};

type Filter = "all" | "bar" | "sale" | "price" | "removed";
type Panel = null | "sell" | "add" | "count";

const needsPrice = (r: Row) => r.sells_retail && r.retail_price_cents === null;

/** A box of things rather than a thing — an intro kit nobody has opened up. */
const looksLikeKit = (r: Row) => r.on_hand > 0 && /\bintro\b|\b\d+\s*pc\b/i.test(r.name);

const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

function toCents(raw: string): number | null | undefined {
  const s = raw.replace(/[$,\s]/g, "");
  if (s === "") return null;
  const c = Math.round(Number(s) * 100);
  return Number.isFinite(c) && c >= 0 ? c : undefined;
}

// Two panes from 1024px: an iPad held sideways. Not 768 — the studio's own
// sidebar takes 224px of an upright iPad, which leaves Inventory about 460px,
// and two columns in that are two cramped lists rather than one good one.
const WIDE = "(min-width: 1024px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

export default function MoneyInventory({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Switching list closes whatever was open. Otherwise a product removed in
  // All turns up already expanded under Removed, and the first tap closes it.
  const pickFilter = (f: Filter) => {
    setFilter(f);
    setOpenId(null);
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const wide = useWide();

  useEffect(() => {
    let alive = true;
    supabase
      .from("product_stock")
      .select("*")
      // Removed products come too, for the Removed filter. Everything else
      // works from `live`.
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

  const named = useMemo(() => {
    const m = new Map<string, Named>();
    for (const r of rows) m.set(r.product_id, nameProduct(r));
    return m;
  }, [rows]);

  const live = useMemo(() => rows.filter((r) => r.active), [rows]);
  const removedCount = rows.length - live.length;
  const priceCount = useMemo(() => live.filter(needsPrice).length, [live]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = (filter === "removed" ? rows.filter((r) => !r.active) : live)
      .filter((r) => {
        if (filter === "bar") return (r.on_bar ?? 0) > 0;
        if (filter === "sale") return r.sells_retail;
        if (filter === "price") return needsPrice(r);
        return true;
      })
      .filter((r) =>
        needle === ""
          ? true
          : `${r.name} ${r.brand ?? ""} ${r.sku ?? ""}`.toLowerCase().includes(needle),
      );

    const by = new Map<string, Row[]>();
    for (const r of shown) {
      const g = named.get(r.product_id)!.group;
      by.set(g, [...(by.get(g) ?? []), r]);
    }
    return [...by.entries()]
      .sort(([a], [b]) => byName(a, b))
      .map(([g, rs]) => ({
        group: g,
        rows: rs.sort((a, b) =>
          byName(named.get(a.product_id)!.short, named.get(b.product_id)!.short),
        ),
      }));
  }, [rows, live, named, filter, q]);

  // Optimistic: pricing 27 bottles one round trip at a time would feel broken.
  async function patch(id: string, change: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.product_id === id ? { ...r, ...change } : r)));
    const { error: e } = await supabase.from("products").update(change).eq("id", id);
    if (e) {
      setError(e.message);
      reload();
    }
  }

  /** Move the numbers locally after a tap — she's between clients. */
  function nudge(id: string, shelf: number, bar: number) {
    setRows((rs) =>
      rs.map((r) =>
        r.product_id === id
          ? { ...r, on_hand: r.on_hand + shelf, on_bar: (r.on_bar ?? 0) + bar }
          : r,
      ),
    );
  }

  function changed() {
    reload();
    onChanged?.();
  }

  const selected = openId ? rows.find((r) => r.product_id === openId) : undefined;

  function closePanel() {
    setPanel(null);
    reload();
  }

  const TABS: [Filter, string][] = [
    ["all", "All"],
    ["bar", "On back bar"],
    ["sale", "For sale"],
  ];

  const panelView = panel && (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl">
          {panel === "sell" ? "Sell" : panel === "add" ? "Add stock" : "Count"}
        </h3>
        <button
          onClick={closePanel}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted transition hover:text-foreground"
        >
          <X size={20} />
        </button>
      </div>
      {panel === "sell" ? (
        <MoneySell onSold={changed} />
      ) : panel === "add" ? (
        <>
          <MoneyInvoice onImported={changed} />
          <MoneyAddStock products={live} named={named} onAdded={changed} />
        </>
      ) : (
        <MoneyCount onSaved={changed} />
      )}
    </div>
  );

  const buttons = (
    <div className="flex gap-2 lg:justify-end">
      {(
        [
          ["sell", "Sell", Receipt],
          ["add", "Add stock", Plus],
          ["count", "Count", ClipboardList],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          key={key}
          onClick={() => {
            setPanel(key);
            setOpenId(null);
          }}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-2 py-2.5 text-sm font-medium shadow-sm transition sm:px-3 lg:flex-none lg:px-4 ${
            key === "sell"
              ? "border-accent bg-accent text-white hover:bg-accent-dark"
              : `bg-white hover:border-foreground/30 ${panel === key ? "border-accent" : "border-foreground/15"}`
          }`}
        >
          <Icon size={16} /> {label}
        </button>
      ))}
    </div>
  );

  const list = (
    <>
      <div className="flex items-center gap-2 rounded-xl border border-foreground/15 bg-white px-3 py-2 shadow-sm">
        <Search size={15} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          className="w-full bg-transparent text-base outline-none sm:text-sm"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-b border-foreground/10 text-sm">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => pickFilter(key)}
            className={`-mb-px border-b-2 pb-2 transition ${
              filter === key
                ? "border-accent font-medium"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        {priceCount > 0 && (
          <button
            onClick={() => pickFilter("price")}
            className={`-mb-px border-b-2 pb-2 text-red-700 transition ${
              filter === "price" ? "border-accent font-medium" : "border-transparent"
            }`}
          >
            Needs price {priceCount}
          </button>
        )}
        {removedCount > 0 && (
          <button
            onClick={() => pickFilter("removed")}
            className={`-mb-px border-b-2 pb-2 transition ${
              filter === "removed" ? "border-accent font-medium" : "border-transparent text-muted"
            }`}
          >
            Removed {removedCount}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing here.</p>
      ) : (
        groups.map(({ group, rows: rs }) => (
          <section key={group} className="mt-5">
            <h4 className="px-1 font-display text-base">{group}</h4>
            <div className="mt-1.5 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
              {rs.map((r) => (
                <Product
                  key={r.product_id}
                  row={r}
                  name={named.get(r.product_id)!}
                  open={openId === r.product_id}
                  inline={!wide}
                  pricing={filter === "price"}
                  onToggle={() => {
                    // On an iPad a tap always shows the product; tapping the
                    // one already showing shouldn't blank the right side.
                    if (wide) {
                      setOpenId(r.product_id);
                      setPanel(null);
                    } else setOpenId(openId === r.product_id ? null : r.product_id);
                  }}
                  onPatch={(c) => patch(r.product_id, c)}
                  onNudge={(s, b) => nudge(r.product_id, s, b)}
                  onReload={changed}
                  onError={setError}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );

  // ---- Phone: one column; Add stock and Count take the page over ----------
  if (!wide) {
    return (
      <div className="max-w-xl">
        {panelView || (
          <>
            {buttons}
            <div className="mt-3">{list}</div>
          </>
        )}
      </div>
    );
  }

  // ---- iPad and wider: the list stays put, everything opens on the right --
  return (
    <div className="max-w-5xl">
      {buttons}
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-6">
        <div>{list}</div>
        <aside className="sticky top-4 max-h-[calc(100vh-2rem)] self-start overflow-y-auto rounded-xl border border-foreground/15 bg-white p-5 shadow-sm">
          {panelView ||
            (selected ? (
              <Selected
                key={selected.product_id}
                row={selected}
                name={named.get(selected.product_id)!}
                onPatch={(c) => patch(selected.product_id, c)}
                onNudge={(s, b) => nudge(selected.product_id, s, b)}
                onReload={changed}
                onError={setError}
              />
            ) : (
              <p className="py-16 text-center text-sm text-muted">Pick a product</p>
            ))}
        </aside>
      </div>
    </div>
  );
}

/** The right-hand side on an iPad: the product's name and numbers, large. */
function Selected({
  row: r,
  name,
  ...rest
}: {
  row: Row;
  name: Named;
  onPatch: (c: Partial<Row>) => void;
  onNudge: (shelf: number, bar: number) => void;
  onReload: () => void;
  onError: (m: string) => void;
}) {
  const big = (n: number, label: string) => {
    const v = Number(n);
    return (
      <div>
        <p
          className={`text-3xl font-medium leading-none tabular-nums ${
            v < 0 ? "text-red-700" : v === 0 ? "text-foreground/35" : ""
          }`}
        >
          {Number.isInteger(v) ? v : v.toFixed(1)}
        </p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    );
  };
  return (
    <div>
      <p className="text-xs text-muted">{name.group}</p>
      <h3 className="mt-0.5 font-display text-2xl leading-tight">
        {name.short}
        {name.size && <span className="ml-2 font-sans text-sm text-muted">{name.size}</span>}
      </h3>
      <div className="mb-4 mt-4 flex gap-8">
        {big(r.on_hand, "on the shelf")}
        {big(r.on_bar ?? 0, "on the bar")}
      </div>
      <div className="-mx-3">
        <Detail row={r} {...rest} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Product({
  row: r,
  name,
  open,
  inline,
  pricing,
  onToggle,
  onPatch,
  onNudge,
  onReload,
  onError,
}: {
  row: Row;
  name: Named;
  open: boolean;
  /** Phone: the product opens in the list. iPad: it opens on the right. */
  inline: boolean;
  pricing: boolean;
  onToggle: () => void;
  onPatch: (c: Partial<Row>) => void;
  onNudge: (shelf: number, bar: number) => void;
  onReload: () => void;
  onError: (m: string) => void;
}) {
  const bar = r.on_bar ?? 0;
  const noPrice = needsPrice(r);

  const sub = [
    name.size,
    r.sells_retail && r.retail_price_cents !== null ? `$${dollars(r.retail_price_cents)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex border-t border-foreground/10 first:border-t-0">
      {/* What it's for, on the left: terracotta if she sells it. */}
      <span
        className={`w-1 shrink-0 ${r.sells_retail ? "bg-accent" : "bg-foreground/20"}`}
        aria-hidden
      />
      <div className={`min-w-0 flex-1 ${open ? "bg-foreground/[0.03]" : ""}`}>
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
          aria-expanded={open}
        >
          <span className="min-w-0 flex-1">
            <span className={`block text-[15px] leading-snug ${open ? "font-medium" : ""}`}>
              {name.short}
            </span>
            {(sub || noPrice) && (
              <span className="block text-xs text-muted">
                {sub}
                {noPrice && <span className="text-red-700">{sub ? " · " : ""}No price</span>}
              </span>
            )}
          </span>
          <Count n={r.on_hand} label="shelf" />
          <Count n={bar} label="bar" />
        </button>

        {/* Pricing the "Needs price" list shouldn't mean opening 27 rows. */}
        {pricing && !(open && inline) && (
          <div className="px-3 pb-3">
            <PriceField row={r} onPatch={onPatch} />
          </div>
        )}

        {open && inline && (
          <Detail
            row={r}
            onPatch={onPatch}
            onNudge={onNudge}
            onReload={onReload}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  const v = Number(n);
  return (
    <span className="w-10 shrink-0 text-center">
      <span
        className={`block text-lg font-medium leading-tight tabular-nums ${
          v < 0 ? "text-red-700" : v === 0 ? "text-foreground/35" : ""
        }`}
      >
        {Number.isInteger(v) ? v : v.toFixed(1)}
      </span>
      <span className="block text-[11px] text-muted">{label}</span>
    </span>
  );
}

// Price and cost side by side: seeing what a bottle cost her is what makes
// the price easy to set (Evelyn, 2026-09-30). A price box only needs to hold
// "$32.00", so it stays small. Products she doesn't sell show the cost alone.
function PriceField({ row: r, onPatch }: { row: Row; onPatch: (c: Partial<Row>) => void }) {
  const [v, setV] = useState(dollars(r.retail_price_cents));
  const bad = toCents(v) === undefined;
  const cost = r.unit_cost_cents === null ? "—" : `$${dollars(r.unit_cost_cents)}`;
  return (
    <div className="flex items-center gap-2 text-sm">
      {r.sells_retail && (
        <label className="flex items-center gap-2">
          <span className="text-muted">Price</span>
          <span
            className={`flex w-24 items-center rounded-lg border bg-white px-2.5 py-1.5 ${
              r.retail_price_cents === null || bad ? "border-red-300" : "border-foreground/15"
            }`}
          >
            <span className="text-muted">$</span>
            <input
              inputMode="decimal"
              value={v}
              onChange={(e) => setV(e.target.value)}
              onBlur={() => {
                const c = toCents(v);
                if (c !== undefined && c !== r.retail_price_cents) onPatch({ retail_price_cents: c });
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-full min-w-0 bg-transparent pl-1 text-base tabular-nums outline-none"
            />
          </span>
        </label>
      )}
      <span className={r.sells_retail ? "ml-3" : ""}>
        <span className="text-muted">Cost </span>
        <span className="tabular-nums">{cost}</span>
      </span>
    </div>
  );
}

function Detail({
  row: r,
  onPatch,
  onNudge,
  onReload,
  onError,
}: {
  row: Row;
  onPatch: (c: Partial<Row>) => void;
  onNudge: (shelf: number, bar: number) => void;
  onReload: () => void;
  onError: (m: string) => void;
}) {
  const [history, setHistory] = useState<Movement[] | null>(null);
  const [busy, setBusy] = useState(false);
  // What she did since opening this product, so a mis-tap can be undone.
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [splitting, setSplitting] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase
      .from("inventory_movements")
      .select("id,kind,quantity,occurred_on,created_at,invoice_ref,note,unit_price_cents")
      .eq("product_id", r.product_id)
      // By the day it happened, then the order it was entered. Sorting on
      // entry alone put a sale dated back to 7 Sep under a later delivery.
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (alive) setHistory((data ?? []) as Movement[]);
      });
    return () => {
      alive = false;
    };
  }, [r.product_id, historyKey]);

  async function record(kind: "used" | "finished") {
    // The buttons already refuse these; this holds if two taps race the
    // refetch after the last bottle left.
    if (kind === "used" && Number(r.on_hand) <= 0) return;
    if (kind === "finished" && Number(r.on_bar ?? 0) <= 0) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("inventory_movements")
      .insert({
        product_id: r.product_id,
        kind,
        quantity: -1,
        // The cost is taken when it's opened; finishing it isn't a cost.
        unit_cost_cents: kind === "used" ? r.unit_cost_cents : null,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      onError(
        error?.message.includes("kind_check")
          ? "The back bar isn't switched on in the database yet."
          : (error?.message ?? "Couldn't save that."),
      );
      return;
    }
    if (kind === "used") onNudge(-1, +1);
    else onNudge(0, -1);
    setMine((s) => new Set(s).add(String(data.id)));
    setHistoryKey((k) => k + 1);
  }

  async function undo(m: Movement) {
    const { error } = await supabase.from("inventory_movements").delete().eq("id", m.id);
    if (error) return onError(error.message);
    if (m.kind === "used") onNudge(+1, -1);
    else if (m.kind === "finished") onNudge(0, +1);
    setMine((s) => {
      const next = new Set(s);
      next.delete(m.id);
      return next;
    });
    setHistoryKey((k) => k + 1);
  }

  const [confirming, setConfirming] = useState(false);

  // Removing hides a product; its history stays, so past months' costs,
  // sales and sales tax don't move. Only a product with no history at all —
  // added by mistake, never received, opened or sold — is truly deleted,
  // because then there's nothing to lose.
  async function remove() {
    setBusy(true);
    const { count } = await supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("product_id", r.product_id);
    const { error } =
      count === 0
        ? await supabase.from("products").delete().eq("id", r.product_id)
        : await supabase.from("products").update({ active: false }).eq("id", r.product_id);
    setBusy(false);
    setConfirming(false);
    if (error) return onError(error.message);
    onReload();
  }

  const bar = r.on_bar ?? 0;
  const shelf = Number(r.on_hand);

  if (!r.active) {
    return (
      <div className="px-3 pb-3">
        <p className="text-sm text-muted">Removed from inventory. Its history is kept.</p>
        <button
          onClick={() => onPatch({ active: true })}
          className="mt-2 rounded-lg border border-foreground/20 bg-white px-3 py-2 text-sm font-medium hover:border-foreground/40"
        >
          Bring it back
        </button>
        <History history={history} mine={mine} onUndo={undo} />
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      {(r.used_at_backbar || bar > 0) && (
        <div className="flex gap-2">
          {/* Nothing on the shelf, nothing to open. Only a sale may take the
              shelf below zero — a bottle in her hand at the till means the
              count is wrong — but opening one she doesn't have is a mis-tap. */}
          {r.used_at_backbar &&
            (shelf > 0 ? (
              <button
                onClick={() => record("used")}
                disabled={busy}
                className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-60"
              >
                Put one on bar
              </button>
            ) : (
              <button
                disabled
                className="flex-1 cursor-not-allowed rounded-lg border border-foreground/10 bg-foreground/[0.04] px-3 py-2.5 text-sm text-muted"
              >
                None on the shelf
              </button>
            ))}
          {bar > 0 && (
            <button
              onClick={() => record("finished")}
              disabled={busy}
              className="flex-1 rounded-lg border border-foreground/20 bg-white px-3 py-2.5 text-sm font-medium transition hover:border-foreground/40 disabled:opacity-60"
            >
              Finished one
            </button>
          )}
        </div>
      )}

      <div className="mt-3">
        <PriceField row={r} onPatch={onPatch} />
      </div>

      <div className="mt-3 flex gap-5 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={r.sells_retail}
            onChange={(e) => onPatch({ sells_retail: e.target.checked })}
          />
          Sell
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={r.used_at_backbar}
            onChange={(e) => onPatch({ used_at_backbar: e.target.checked })}
          />
          Back bar
        </label>
      </div>

      {looksLikeKit(r) && (
        <div className="mt-3">
          {splitting ? (
            <MoneyKitBreakout
              productId={r.product_id}
              productName={r.name}
              brand={r.brand}
              supplier={r.supplier}
              unitCostCents={r.unit_cost_cents}
              onDone={() => {
                setSplitting(false);
                onReload();
              }}
            />
          ) : (
            <button
              onClick={() => setSplitting(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-sm font-medium text-accent"
            >
              <PackageOpen size={14} /> What was in it?
            </button>
          )}
        </div>
      )}

      <History history={history} mine={mine} onUndo={undo} />

      {/* Rare, so a quiet link rather than a button, and one confirm. */}
      <div className="mt-3 text-xs">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-muted">
              {history && history.length === 0
                ? "Delete this product? It has no history."
                : "Remove from the list? Its history is kept."}
            </span>
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-md border border-red-300 px-2.5 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {history && history.length === 0 ? "Delete" : "Remove"}
            </button>
            <button onClick={() => setConfirming(false)} className="text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-muted underline hover:text-foreground">
            Remove from inventory
          </button>
        )}
      </div>
    </div>
  );
}

function History({
  history,
  mine,
  onUndo,
}: {
  history: Movement[] | null;
  mine: Set<string>;
  onUndo: (m: Movement) => void;
}) {
  return (
    <div className="mt-3 border-t border-foreground/10 pt-2 text-xs leading-6 text-muted">
      {history === null ? (
        "…"
      ) : history.length === 0 ? (
        "Nothing yet."
      ) : (
        history.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3">
            <span>
              {shortDate(m.occurred_on)} · {describe(m)}
            </span>
            {mine.has(m.id) && (
              <button
                onClick={() => onUndo(m)}
                className="inline-flex items-center gap-1 text-muted hover:text-foreground"
              >
                <Undo2 size={12} /> Undo
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
