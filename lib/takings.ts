// What she took at check-out that the bank never sees: cash, and Venmo / Zelle
// / other if anyone uses them. Card is left out -- it reaches Relay as Intuit
// deposits, and the bank rows already count it (with the tips, which are
// taken through another service and never recorded at check-out).
//
// Counted straight from check-outs since 2026-10-08, so cash no longer needs
// typing in as income. A cash deposit into Relay is filed as "Cash deposit
// (already counted)" so it isn't counted again.

export type CheckOut = { paid_cents: number | null; payment_method: string | null };
export type Sale = { total_cents: number | null; payment_method: string | null };

/** Non-card takings: services paid plus products sold (tax included -- the summary takes all sales tax out once). */
export function offBankTakings(appts: CheckOut[], sales: Sale[]) {
  const byMethod = new Map<string, number>();
  const add = (m: string | null, c: number) => {
    if (m === "card" || !c) return;
    const k = m ?? "other";
    byMethod.set(k, (byMethod.get(k) ?? 0) + c);
  };
  for (const a of appts) add(a.payment_method, Number(a.paid_cents) || 0);
  for (const s of sales) add(s.payment_method, Number(s.total_cents) || 0);
  const cents = [...byMethod.values()].reduce((t, c) => t + c, 0);
  return { cents, byMethod: [...byMethod.entries()].map(([method, c]) => ({ method, cents: c })) };
}
