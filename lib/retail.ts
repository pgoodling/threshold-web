// Selling product: the numbers both check-out and Sell need.
//
// The rate comes from tax_rates, not a constant, so a rate change is a row,
// not a deploy. The database works the tax out again when the sale is saved
// (record_retail_sale, migration 0047); this copy is only for the screen, and
// uses the same per-unit rounding so the two agree to the cent.

import { supabase } from "./supabase";

/** Montgomery County, 2026 — used only if the rate can't be read. */
const FALLBACK_RATE = 0.075;

export type SaleLine = {
  key: string;
  product_id: string | null;
  description: string;
  sub: string;
  unit_price_cents: number;
  quantity: number;
};

export type SaleContext = { rate: number };

export async function loadSaleContext(): Promise<SaleContext> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date(),
  );
  const r = await supabase
    .from("tax_rates")
    .select("rate")
    .eq("jurisdiction", "ohio_sales_tax")
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rate = Number(r.data?.rate);
  return { rate: Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_RATE };
}

export function totals(lines: SaleLine[], rate: number) {
  let sub = 0;
  let tax = 0;
  for (const l of lines) {
    sub += Math.round(l.unit_price_cents * l.quantity);
    tax += Math.round(Math.round(l.unit_price_cents * rate) * l.quantity);
  }
  return { sub, tax, total: sub + tax };
}

export const usd = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const percent = (rate: number) => `${+(rate * 100).toFixed(3)}%`;

/** Save a sale. At check-out, pass the appointment and the service amount. */
export async function recordSale(opts: {
  lines: SaleLine[];
  paymentMethod: string;
  clientId?: string | null;
  appointmentId?: string | null;
  servicePaidCents?: number | null;
}) {
  return supabase.rpc("record_retail_sale", {
    p_lines: opts.lines.map((l) => ({
      product_id: l.product_id,
      description: l.description,
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
    })),
    p_payment_method: opts.paymentMethod,
    p_client_id: opts.clientId ?? null,
    p_appointment_id: opts.appointmentId ?? null,
    p_service_paid_cents: opts.servicePaidCents ?? null,
  });
}
