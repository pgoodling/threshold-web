"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Trash2,
  Package,
  ClipboardList,
  Receipt,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Segments } from "./ui";
import { nameProduct } from "../../lib/productLine";
import {
  describe,
  isCount,
  dayHeading,
  shortDate,
  salonToday,
  type Movement,
} from "../../lib/stockEvents";

// Activity: what happened to her stock, newest first. Nothing on it does
// anything — every change happens in Inventory, so there is one place to look
// for a button and one place to look for what the buttons did.
//
// Today and Week are the list. Month leads with totals, because a month of
// single bottles is a long scroll and the question at that range is "how much",
// not "which". Month is the calendar month, to line up with her statement.
//
// An order is one line, not fourteen, and a count is one line with what was
// short. Everything else is a line per product — a single bottle going on the
// bar is exactly the level she thinks at.

type Range = "today" | "week" | "month";

type Row = Movement & {
  unit_cost_cents: number | null;
  products: { name: string; brand: string | null; size: string | null } | null;
};

type Line = { key: string; icon: LucideIcon; title: string; sub: string };

type Totals = {
  toBar: number;
  finished: number;
  orders: number;
  missing: number;
  sold: number;
  usedCents: number;
};

const ICON: Record<Movement["kind"], LucideIcon> = {
  used: ArrowRight,
  finished: Trash2,
  received: Package,
  sold: Receipt,
  missing: ClipboardList,
  adjusted: CircleDot,
};

/** "Long & Strong Super Serum" — the range without the brand, then the product. */
function title(p: Row["products"]): string {
  if (!p) return "A product";
  const n = nameProduct(p);
  const range = n.group.includes(" · ") ? n.group.split(" · ")[1] + " " : "";
  return `${range}${n.short}`;
}

function since(range: Range): string {
  const today = salonToday();
  if (range === "today") return today;
  const [y, m, d] = today.split("-").map(Number);
  if (range === "month") return `${today.slice(0, 7)}-01`;
  return new Date(Date.UTC(y, m - 1, d - 6)).toISOString().slice(0, 10);
}

function linesFor(rows: Row[]): Line[] {
  const out: Line[] = [];
  const orders = new Map<string, number>();
  let missing = 0;
  let extra = 0;
  let counted = false;

  for (const r of rows) {
    if (r.kind === "received" && r.invoice_ref) {
      orders.set(r.invoice_ref, (orders.get(r.invoice_ref) ?? 0) + 1);
      continue;
    }
    if (isCount(r)) {
      counted = true;
      if (r.kind === "missing") missing += Math.abs(Number(r.quantity));
      else extra += Number(r.quantity);
      continue;
    }
    out.push({ key: r.id, icon: ICON[r.kind], title: title(r.products), sub: describe(r) });
  }

  // Orders and counts are summarised at the top of their day.
  if (counted) {
    out.unshift({
      key: "count",
      icon: ClipboardList,
      title: "Shelf counted",
      sub: [missing ? `${missing} missing` : "", extra ? `${extra} extra` : ""]
        .filter(Boolean)
        .join(" · "),
    });
  }
  for (const [ref, products] of orders) {
    out.unshift({
      key: `order-${ref}`,
      icon: Package,
      title: `Order ${ref}`,
      sub: `${products} product${products === 1 ? "" : "s"} arrived`,
    });
  }
  return out;
}

function totalsFor(rows: Row[]): Totals {
  const t: Totals = { toBar: 0, finished: 0, orders: 0, missing: 0, sold: 0, usedCents: 0 };
  const refs = new Set<string>();
  for (const r of rows) {
    const q = Math.abs(Number(r.quantity));
    if (r.kind === "used") {
      t.toBar += q;
      t.usedCents += q * (r.unit_cost_cents ?? 0);
    } else if (r.kind === "finished") t.finished += q;
    else if (r.kind === "missing") t.missing += q;
    else if (r.kind === "sold") t.sold += q;
    else if (r.kind === "received" && r.invoice_ref) refs.add(r.invoice_ref);
  }
  t.orders = refs.size;
  return t;
}

const RANGES: [Range, string][] = [
  ["today", "Today"],
  ["week", "Week"],
  ["month", "Month"],
];

export default function MoneyActivity() {
  const [range, setRange] = useState<Range>("today");
  // Tagged with the range they're for, so switching shows "Loading…" rather
  // than a moment of the previous range's list under the new heading.
  const [loaded, setLoaded] = useState<{ range: Range; rows: Row[] } | null>(null);
  const rows = loaded?.range === range ? loaded.rows : null;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("inventory_movements")
      .select(
        "id,kind,quantity,occurred_on,created_at,invoice_ref,note,unit_price_cents,unit_cost_cents,products(name,brand,size)",
      )
      .gte("occurred_on", since(range))
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error: e }) => {
        if (!alive) return;
        if (e) setError(e.message);
        setLoaded({
          range,
          rows: ((data ?? []) as unknown as Row[]).map((r) => ({
            ...r,
            // An embedded parent can come back as a one-element array.
            products: Array.isArray(r.products) ? (r.products[0] ?? null) : r.products,
          })),
        });
      });
    return () => {
      alive = false;
    };
  }, [range]);

  const byDay = new Map<string, Row[]>();
  for (const r of rows ?? []) byDay.set(r.occurred_on, [...(byDay.get(r.occurred_on) ?? []), r]);
  const days = [...byDay.entries()].map(([day, rs]) => ({ day, lines: linesFor(rs) }));
  const totals = range === "month" && rows ? totalsFor(rows) : null;
  const monthName = new Date(`${since("month")}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

  return (
    <div className="max-w-xl">
      <Segments
        label="When"
        options={RANGES.map(([key, label]) => [key, label] as const)}
        value={range}
        onChange={setRange}
      />

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {totals && (
        <div className="mt-4">
          <p className="px-1 text-xs text-muted">{monthName}</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <Tile n={totals.toBar} label="to the bar" />
            <Tile n={totals.finished} label="finished" />
            <Tile n={totals.orders} label={totals.orders === 1 ? "order in" : "orders in"} />
            <Tile n={totals.missing} label="missing" />
            {totals.sold > 0 && <Tile n={totals.sold} label="sold" />}
          </div>
          <div className="mt-2">
            <Tile
              n={`$${Math.round(totals.usedCents / 100).toLocaleString("en-US")}`}
              label="product put to use"
            />
          </div>
        </div>
      )}

      {rows === null ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : days.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nothing {range === "today" ? "today" : range === "week" ? "this week" : "this month"} yet.
        </p>
      ) : (
        days.map(({ day, lines }) => (
          <section key={day} className="mt-5">
            {range !== "today" && (
              <h4 className="px-1 text-xs text-muted">
                {range === "month" ? shortDate(day) : dayHeading(day)}
              </h4>
            )}
            <div className="mt-1.5 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
              {lines.map(({ key, icon: Icon, title: t, sub }) => (
                <div
                  key={key}
                  className="flex gap-3 border-t border-foreground/10 px-3 py-2.5 first:border-t-0"
                >
                  <Icon size={17} className="mt-0.5 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <p className="text-[15px] leading-snug">{t}</p>
                    <p className="text-xs text-muted">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Tile({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-xl bg-foreground/[0.04] px-3 py-2.5">
      <p className="text-xl font-medium leading-tight tabular-nums">{n}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
