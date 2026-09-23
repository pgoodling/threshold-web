"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  estimateColourCost,
  isColourService,
  type ColourCostEstimate,
  type Purchase,
  type ColourAppointment,
} from "../../lib/colourCost";

// "About what a colour costs."
//
// Deliberately hedged everywhere. The method divides each colour order by the
// appointments it covered before the next order, weighted by how long each one
// took — which is an approximation resting on an assumption (that she rebuys
// roughly when she runs out) that is true on average and wrong in any given
// month.
//
// So the screen shows the working, not just the answer. The windows are
// listed, because "$247.37 over 3 appointments" is the only honest way to
// explain a number that looks too high, and because she is the only one who
// can say "that order was a stock-up, ignore it".

const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const short = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function MoneyColourCost() {
  const [est, setEst] = useState<ColourCostEstimate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      // Colour stock she's bought. Reviewed and business only — an unreviewed
      // row might be personal, and guessing here would put her grocery run
      // into the cost of a highlight.
      supabase
        .from("bank_transactions")
        .select("posted_on,amount_cents,merchant,expense_categories(name,kind)")
        .eq("is_business", true)
        .lt("amount_cents", 0)
        .order("posted_on", { ascending: true }),
      supabase
        .from("appointments")
        .select("id,starts_at,ends_at,services(name)")
        .not("status", "in", "(cancelled,no_show)")
        .order("starts_at", { ascending: true }),
      supabase.from("salon_settings").select("opened_on").limit(1).maybeSingle(),
    ]).then(([tx, ap, st]) => {
      if (!alive) return;

      const openedOn = (st.data?.opened_on as string | null) ?? null;

      const purchases: Purchase[] = (tx.data ?? [])
        .filter((r) => {
          const c = r.expense_categories as unknown as { name?: string } | null;
          return (c?.name ?? "") === "Colour and developer";
        })
        .map((r) => ({
          postedOn: String(r.posted_on),
          amountCents: Math.abs(Number(r.amount_cents)),
          merchant: (r.merchant as string | null) ?? null,
          // Anything bought before she opened was stocking an empty salon, not
          // replenishing one. That is exactly what a stock-up is, and it means
          // the $2,043 opening order excludes itself without anyone flagging it.
          isStockUp: openedOn !== null && String(r.posted_on) < openedOn,
        }));

      const appts: ColourAppointment[] = (ap.data ?? [])
        .filter((a) => {
          const s = a.services as unknown as { name?: string } | null;
          return isColourService(s?.name);
        })
        .map((a) => {
          const start = new Date(String(a.starts_at)).getTime();
          const end = a.ends_at ? new Date(String(a.ends_at)).getTime() : start;
          return {
            id: String(a.id),
            startsAt: String(a.starts_at),
            minutes: Math.max(Math.round((end - start) / 60000), 0),
          };
        });

      setEst(estimateColourCost(purchases, appts));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return null;
  if (!est) return null;

  const headline = est.averagePerAppointmentCents;

  return (
    <div className="mt-10 border-t border-foreground/15 pt-8">
      <h3 className="flex items-center gap-2 font-display text-lg">
        <FlaskConical size={17} className="text-muted" />
        What a colour costs her
      </h3>

      {headline === null ? (
        <p className="mt-2 max-w-prose text-sm text-muted">{est.caveat}</p>
      ) : (
        <>
          <p className="mt-3 text-3xl font-medium tabular-nums">
            about {money(headline)}
            <span className="ml-2 align-middle text-sm font-normal text-muted">
              of product, per colour appointment
            </span>
          </p>
          <p className="mt-2 max-w-prose text-sm text-muted">{est.caveat}</p>
        </>
      )}

      {est.windows.length > 0 && (
        <div className="mt-4 max-w-prose overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
          {est.windows.map((w) => (
            <div
              key={w.from}
              className="flex items-center gap-3 border-t border-foreground/10 first:border-t-0"
            >
              <span
                className={`w-1 shrink-0 self-stretch ${w.open ? "bg-amber-400" : "bg-accent/40"}`}
                aria-hidden
              />
              <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 pr-4">
                <p className="text-sm">
                  {short(w.from)} → {w.to ? short(w.to) : "now"}
                  <span className="ml-2 text-xs text-muted">
                    {money(w.spentCents)} · {w.appointments} colour
                    {w.appointments === 1 ? "" : "s"}
                  </span>
                </p>
                <p className="text-sm font-medium tabular-nums">
                  {w.open ? (
                    <span className="text-xs font-normal text-muted">
                      still being used
                    </span>
                  ) : w.perAppointmentCents !== null ? (
                    money(w.perAppointmentCents)
                  ) : (
                    <span className="text-xs font-normal text-muted">
                      no colour appointments
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 max-w-prose text-xs text-muted">
        Each colour order is divided across the appointments it covered before the next
        order, weighted by how long each one took. It assumes she rebuys roughly when she
        runs out — true on average, wrong in any given month — so this is a guide to
        whether her prices work, not a figure to put on an invoice. Orders placed before
        she opened are treated as stocking up and left out.
      </p>
    </div>
  );
}
