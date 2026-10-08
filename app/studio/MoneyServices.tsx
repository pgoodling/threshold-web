"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "../../lib/supabase";
import { BackHeader } from "./ui";
import {
  cardFeeRate,
  serviceRows,
  sumVisits as sum,
  perHour,
  handRate,
  fixedCostLine,
  type EarningsAppt,
  type ServiceRow,
} from "../../lib/serviceEarnings";
import {
  measured,
  pool,
  inWashPool,
  isMask,
  usesWash,
  usesMask,
  type InvProduct,
  type Movement,
  type Pool,
  LEARN_FROM,
  averageRows,
} from "../../lib/productCost";

// Services: what each one earns per hour of her hands.
//
// PER HOUR OF HER HANDS, NOT OF THE BOOKING. A highlight holds the chair for
// three hours, but forty-five minutes of that is processing, when she can take
// another client. So the headline divides by the time she's actually working
// on that head, and the chair figure sits beside it for days the gap goes
// unfilled. Blocked processing counts in full. Timing comes from the visit
// where she set its own (a blowout stretched to two hours earned what it
// earned), otherwise from the service.
//
// AFTER PRODUCT (2026-10-08), from her own list of what each service uses --
// see lib/productCost.ts. Colour and lightener are measured (her grams × what
// she paid); bowl and styling products are learned from back-bar bottles she
// has finished. The first version spread every product order across every
// visit, and Paul was right that it was the wrong model: an order isn't used up
// the month it arrives, and a tube of colour doesn't touch a blowout. Anything
// not yet known says so rather than being guessed.
//
// CARD FEES come from her own statement: what Intuit charged over what it
// deposited, applied to card visits only.
//
// Every figure can be checked: a service lists the visits behind it.

type Row = ServiceRow;

const MIN_VISITS = 2;

const whole = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const exact = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hm = (m: number) => {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${h} h${r ? ` ${r}` : ""}` : `${r} min`;
};

export default function MoneyServices() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [feeRate, setFeeRate] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [line, setLine] = useState<ReturnType<typeof fixedCostLine>>(null);
  const [moves, setMoves] = useState<Movement[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase
        .from("appointments")
        .select(
          "id,starts_at,paid_cents,payment_method,status,start_minutes,process_minutes,finish_minutes,block_processing,services(name,price_cents,start_minutes,process_minutes,finish_minutes,duration_minutes)",
        )
        .in("status", ["checked_out", "completed"]),
      supabase
        .from("bank_transactions")
        .select("posted_on,amount_cents,expense_categories(name,kind)")
        .eq("is_business", true)
        .not("reviewed_at", "is", null),
      supabase.from("products").select("name,size,unit_cost_cents").eq("active", true),
      supabase
        .from("inventory_movements")
        .select("kind,quantity,unit_cost_cents,occurred_on,created_at,products(name)")
        .in("kind", ["used", "finished"]),
    ]).then(([a, t, p, m]) => {
      if (!alive) return;
      if (a.error || t.error) setError((a.error ?? t.error)!.message);
      const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);

      const rate = cardFeeRate(
        (t.data ?? []).map((r) => ({
          amount_cents: Number(r.amount_cents),
          category: one(r.expense_categories as unknown as { name: string } | null)?.name ?? "",
        })),
      );
      const built = serviceRows((a.data ?? []) as unknown as EarningsAppt[], rate);
      setRows(built);
      setLine(
        fixedCostLine(
          (t.data ?? []).map((r) => ({
            posted_on: r.posted_on as string,
            amount_cents: Number(r.amount_cents),
            kind: one(r.expense_categories as unknown as { kind: string } | null)?.kind ?? null,
          })),
          built.flatMap((r) => r.visits),
        ),
      );
      setFeeRate(rate);
      setProducts((p.data ?? []) as InvProduct[]);
      setMoves(
        (m.data ?? []).map((r) => ({
          kind: r.kind as string,
          quantity: Number(r.quantity),
          unit_cost_cents: r.unit_cost_cents as number | null,
          occurred_on: r.occurred_on as string,
          created_at: r.created_at as string,
          product_name: one(r.products as unknown as { name: string } | null)?.name ?? "",
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  // The two learned pools, each over the visits that draw on it.
  const pools = useMemo(() => {
    const days = (test: (s: string) => boolean) =>
      (rows ?? []).filter((r) => test(r.name)).flatMap((r) => r.visits.map((v) => v.day));
    return {
      wash: pool(moves, inWashPool, days(usesWash)),
      mask: pool(moves, isMask, days(usesMask)),
    };
  }, [rows, moves]);

  // Product per visit for each service: measured lines + its share of the pools.
  const productBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? [])
    {
      const mm = measured(r.name, products);
      const rows = averageRows(r.visits.map((v) => v.paidCents));
      m.set(
        r.name,
        mm.lines.reduce((t, l) => t + l.cents, 0) +
          mm.perRow.reduce((t, l) => t + l.cents, 0) * rows +
          (usesWash(r.name) ? (pools.wash.perVisit ?? 0) : 0) +
          (usesMask(r.name) ? (pools.mask.perVisit ?? 0) : 0),
      );
    }
    return m;
  }, [rows, products, pools]);
  const productOf = (name: string) => productBy.get(name) ?? 0;
  const rate = useMemo(() => (r: Row) => handRate(r, productBy.get(r.name) ?? 0), [productBy]);

  const ranked = useMemo(
    () => (rows ?? []).filter((r) => r.visits.length >= MIN_VISITS).sort((a, b) => rate(b) - rate(a)),
    [rows, rate],
  );
  const few = (rows ?? []).filter((r) => r.visits.length < MIN_VISITS);
  const top = ranked[0] ? rate(ranked[0]) : 1;
  const lowBar = top * 0.5;

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (rows === null) return <p className="text-sm text-muted">Loading…</p>;

  // ---- One service, opened, with its working ----------------------------------
  const r = open ? (rows.find((x) => x.name === open) ?? null) : null;
  if (r) {
    const n = r.visits.length;
    const paid = sum(r.visits, "paidCents");
    const fee = sum(r.visits, "feeCents");
    const hands = sum(r.visits, "handMinutes");
    const chair = sum(r.visits, "chairMinutes");
    const proc = sum(r.visits, "processMinutes");
    const listGap = r.listCents && r.listCents > 0 ? paid / n / r.listCents - 1 : 0;
    const product = productOf(r.name);
    const net = paid - fee - product * n;

    return (
      <div className="max-w-xl">
        <BackHeader onBack={() => setOpen(null)} backLabel="Services" title={r.name} />
        <p className="mt-1 text-sm text-muted">
          {n} paid visit{n === 1 ? "" : "s"}
        </p>

        <div className="mt-4 flex gap-8">
          <div>
            <p className="text-3xl font-medium tabular-nums">{whole(perHour(net, hands))}</p>
            <p className="text-xs text-muted">per hour of your hands</p>
          </div>
          {proc > 0 && (
            <div>
              <p className="text-3xl font-medium tabular-nums text-muted">
                {whole(perHour(net, chair))}
              </p>
              <p className="text-xs text-muted">per hour in the chair</p>
            </div>
          )}
        </div>

        {line && (
          <p className="mt-2 text-sm text-muted">
            {perHour(net, hands) >= line.perHourCents ? (
              <>
                After its share of fixed costs ({whole(line.perHourCents)} an hour):{" "}
                <span className="font-medium text-foreground">{whole(perHour(net, hands) - line.perHourCents)} an hour</span>
              </>
            ) : (
              <span className="text-[#8f3f4a]">
                Under the fixed-cost line of {whole(line.perHourCents)} an hour, by{" "}
                {whole(line.perHourCents - perHour(net, hands))}
              </span>
            )}
          </p>
        )}

        <div className="mt-5 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm shadow-sm">
          <Line label="Average paid" value={exact(paid / n)} />
          <Line
            label="Card fee"
            sub={feeRate ? `${(feeRate * 100).toFixed(1)}% on card visits` : undefined}
            value={`−${exact(fee / n)}`}
          />
          <Line label="Product" sub="per visit, so far: below" value={`−${exact(product)}`} />
          <Line label="Left, after product" value={exact(net / n)} strong />
        </div>

        <ProductWorking
          name={r.name}
          products={products}
          pools={pools}
          rows={averageRows(r.visits.map((v) => v.paidCents))}
        />

        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm shadow-sm">
          <Line
            label="Your hands on it"
            sub={
              proc > 0
                ? `${Math.round(sum(r.visits, "startMinutes") / n)} min before + ${Math.round(sum(r.visits, "finishMinutes") / n)} min after`
                : undefined
            }
            value={hm(hands / n)}
          />
          {proc > 0 && <Line label="Processing" sub="free for another client" value={hm(proc / n)} />}
        </div>

        {Math.abs(listGap) >= 0.15 && r.listCents && (
          <p className="mt-3 text-sm text-muted">
            Listed at {whole(r.listCents)}, but clients have paid {whole(paid / n)} on average —
            add-ons, a discount, or the price in Services is out of date.
          </p>
        )}

        {/* The working, visit by visit, so the arithmetic can be checked by
            hand: (total paid − total fees) ÷ total hands minutes × 60. */}
        <h4 className="mt-6 text-sm text-muted">Every visit behind this</h4>
        <div className="mt-1.5 overflow-x-auto rounded-xl border border-foreground/15 bg-white shadow-sm">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted">
              <tr className="text-left">
                <th className="px-3 py-2 font-normal">Date</th>
                <th className="px-2 py-2 text-right font-normal">Paid</th>
                <th className="px-2 py-2 text-right font-normal">Fee</th>
                <th className="px-3 py-2 text-right font-normal">Hands</th>
              </tr>
            </thead>
            <tbody>
              {r.visits
                .slice()
                .sort((a, b) => b.day.localeCompare(a.day))
                .map((v) => (
                  <tr key={v.id} className="border-t border-foreground/10">
                    <td className="px-3 py-1.5">
                      {new Date(`${v.day}T12:00:00Z`).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                      {!v.card && <span className="ml-1 text-xs text-muted">not card</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">{exact(v.paidCents)}</td>
                    <td className="px-2 py-1.5 text-right">{v.feeCents ? exact(v.feeCents) : "—"}</td>
                    <td className="px-3 py-1.5 text-right">{v.handMinutes} min</td>
                  </tr>
                ))}
              <tr className="border-t border-foreground/20 font-medium">
                <td className="px-3 py-1.5">Total</td>
                <td className="px-2 py-1.5 text-right">{exact(paid)}</td>
                <td className="px-2 py-1.5 text-right">{exact(fee)}</td>
                <td className="px-3 py-1.5 text-right">{hands} min</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          ({exact(paid)} − {exact(fee)} − {n} × {exact(product)} product) ÷ {hands} min × 60 ={" "}
          {exact(perHour(net, hands))} an hour
        </p>
      </div>
    );
  }

  // ---- The ranking --------------------------------------------------------------
  return (
    <div className="max-w-xl">
      <p className="text-sm text-muted">What each service earns</p>
      <p className="text-[15px]">per hour of your hands, after product so far</p>

      {/* The fixed-cost line (lib/serviceEarnings.ts): rent and other fixed
          costs per hour she works. A service under it isn't covering its share
          of the overhead -- the one to think about raising. */}
      {line && (
        <div className="mt-3 rounded-r-xl border border-l-[3px] border-foreground/15 border-l-[#8f3f4a] bg-white px-3 py-2">
          <p className="text-sm">
            Your fixed costs come to <span className="font-medium">{whole(line.perHourCents)} an hour</span> you work
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {exact(line.costCents)} of rent and other fixed costs, {dayShort(line.from)}–{dayShort(line.to)}, ÷{" "}
            {Math.round(line.hours * 10) / 10} hours of your hands
          </p>
        </div>
      )}

      {ranked.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Not enough paid visits yet.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          {ranked.map((x) => {
            const ph = rate(x);
            const low = ph < lowBar;
            return (
              <button
                key={x.name}
                onClick={() => setOpen(x.name)}
                className="min-h-11 flex w-full items-center gap-3 border-t border-foreground/10 px-3 text-left first:border-t-0 hover:bg-foreground/[0.02]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">{x.name}</span>
                  <span className="block text-xs text-muted">
                    {x.visits.length} visits · avg {whole(sum(x.visits, "paidCents") / x.visits.length)}
                  </span>
                  <span className="relative mt-1 block h-1.5">
                    <span
                      className={`block h-1.5 rounded-r-full ${low ? "bg-red-400/70" : "bg-[#1D9E75]/55"}`}
                      style={{ width: `${Math.max(3, (ph / top) * 100)}%` }}
                    />
                    {line && line.perHourCents < top && (
                      <span
                        aria-hidden="true"
                        className="absolute -bottom-1 -top-1 border-l-2 border-dashed border-[#8f3f4a]"
                        style={{ left: `${(line.perHourCents / top) * 100}%` }}
                      />
                    )}
                  </span>
                </span>
                <span className={`shrink-0 text-base font-medium tabular-nums ${low ? "text-red-700" : ""}`}>
                  {whole(ph)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {few.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">{few.length} with only one visit so far</summary>
          <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
            {few
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((x) => (
                <button
                  key={x.name}
                  onClick={() => setOpen(x.name)}
                  className="min-h-11 flex w-full justify-between gap-3 border-t border-foreground/10 px-3 text-left first:border-t-0"
                >
                  <span className="min-w-0">{x.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{whole(rate(x))}/h</span>
                </button>
              ))}
          </div>
        </details>
      )}

      <p className="mt-4 text-xs text-muted">
        Product: color and lightener from her measures; bowl and styling from back-bar bottles
        she&rsquo;s finished. Open a service to see the working.
      </p>
    </div>
  );
}

function Line({
  label,
  sub,
  value,
  strong,
}: {
  label: string;
  sub?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-foreground/10 px-4 py-2.5 first:border-t-0">
      <span className={strong ? "font-medium" : ""}>
        {label}
        {sub && <span className="block text-xs font-normal text-muted">{sub}</span>}
      </span>
      <span className={`shrink-0 tabular-nums ${strong ? "font-medium" : ""}`}>{value}</span>
    </div>
  );
}

const day = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const cents2 = (c: number) => `$${(c / 100).toFixed(2)}`;

// The product figure, line by line, with where each number comes from.
function ProductWorking({
  name,
  products,
  pools,
  rows,
}: {
  name: string;
  products: InvProduct[];
  pools: { wash: Pool; mask: Pool };
  /** Average rows per visit, for extensions (paid ÷ $115). */
  rows: number;
}) {
  const m = measured(name, products);
  const learned: [string, Pool][] = [
    ...(usesWash(name) ? ([["Bowl and styling", pools.wash]] as [string, Pool][]) : []),
    ...(usesMask(name) ? ([["Mask", pools.mask]] as [string, Pool][]) : []),
  ];
  if (m.lines.length === 0 && m.perRow.length === 0 && learned.length === 0 && m.waiting.length === 0)
    return <p className="mt-3 text-sm text-muted">No product used.</p>;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm shadow-sm">
      <p className="px-4 pt-2.5 text-xs uppercase tracking-wider text-muted">Product per visit</p>
      {m.lines.length > 0 && <p className="px-4 pt-2 text-xs text-muted">Measured: her amounts × what she paid</p>}
      {m.lines.map((l) => (
        <Line
          key={l.label}
          label={
            l.say ??
            (l.unit === "foils" ? `${Math.round(l.amount * 10) / 10} foils` : `${l.label} ${Math.round(l.amount * 10) / 10} ${l.unit}`)
          }
          sub={l.working}
          value={cents2(l.cents)}
        />
      ))}
      {m.maybe.length > 0 && (
        <Line
          label="Toner, when she tones"
          sub="not counted in the total"
          value={`+${cents2(m.maybe.reduce((t, l) => t + l.cents, 0))}`}
        />
      )}
      {m.perRow.length > 0 && (
        <p className="px-4 pt-2 text-xs text-muted">
          Per row; {Math.round(rows * 10) / 10} row{rows === 1 ? "" : "s"} a visit on average (paid ÷ $115)
        </p>
      )}
      {m.perRow.map((l) => (
        <Line
          key={l.label}
          label={l.say ?? l.label}
          sub={`${l.working} · ${cents2(l.cents)} a row`}
          value={cents2(l.cents * rows)}
        />
      ))}
      {m.missing.map((w) => (
        <Line key={w} label={w} sub="no price in inventory" value="—" />
      ))}
      {m.waiting.map((w) => (
        <Line key={w} label={w} sub="waiting: not known yet" value="—" />
      ))}
      {learned.length > 0 && (
        <p className="px-4 pt-2 text-xs text-muted">Learned: finished back-bar bottles ÷ visits</p>
      )}
      {learned.map(([label, p]) => (
        <Line
          key={label}
          label={label}
          sub={
            p.perVisit === null
              ? `Learning: no bottle put on the bar since ${day(LEARN_FROM)} is finished yet`
              : `${p.bottles.length} bottle${p.bottles.length === 1 ? "" : "s"} finished (${cents2(p.costCents)}), ${day(p.from!)}–${day(p.to!)}, ÷ ${p.visits} visits. ${p.stillOpen} still open.`
          }
          value={p.perVisit === null ? "—" : cents2(p.perVisit)}
        />
      ))}
    </div>
  );
}

const dayShort = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
