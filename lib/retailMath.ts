// The arithmetic of a sale, with nothing that talks to the database, so tests
// can import it without a Supabase connection. lib/retail re-exports it.
//
// Tax is worked per unit and rounded, then multiplied — the same way
// record_retail_sale (migration 0047) does it, so screen and database agree
// to the cent.

export type SaleLine = {
  key: string;
  product_id: string | null;
  description: string;
  sub: string;
  unit_price_cents: number;
  quantity: number;
};

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
