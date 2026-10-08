// What the business owes Evelyn for costs she paid herself before Relay
// existed (2026-10-08). The costs are rows on the "Paid outside Relay"
// account (MoneyManual) -- already expenses, counted when she paid them. Relay
// paying her back is filed "Reimbursement to Evelyn" (0050), which no screen
// counts as spending, so nothing is counted twice.

export const PAID_PERSONALLY_ACCOUNT = "Paid outside Relay";
export const REIMBURSEMENT_CATEGORY = "Reimbursement to Evelyn";

export type Paid = { id: string; posted_on: string; amount_cents: number; payee: string; category: string | null };

export function owed(paid: Paid[], repaid: Paid[]) {
  // Purchases are stored negative; a refund on that account (positive) reduces what she's owed.
  const paidCents = paid.reduce((t, p) => t - p.amount_cents, 0);
  const repaidCents = repaid.reduce((t, p) => t + Math.abs(p.amount_cents), 0);
  return { paidCents, repaidCents, owedCents: paidCents - repaidCents };
}
