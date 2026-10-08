// What the business owes Evelyn: money she moved into Relay from her own bank
// to start it (Owner contribution), and business costs she paid herself
// before Relay existed (the "Paid outside Relay" account, via MoneyManual --
// already expenses, counted when she paid them). Every transfer back to her
// is filed "Paid back to Evelyn" (0050, renamed 0051), which no screen counts
// as spending: nothing is deducted twice and nothing is taxed.

export const PAID_PERSONALLY_ACCOUNT = "Paid outside Relay";
export const REIMBURSEMENT_CATEGORY = "Paid back to Evelyn";

export type Paid = { id: string; posted_on: string; amount_cents: number; payee: string; category: string | null };

export function owed(paid: Paid[], repaid: Paid[], putIn: Paid[] = []) {
  // Purchases are stored negative; a refund on that account (positive) reduces what she's owed.
  const receiptsCents = paid.reduce((t, p) => t - p.amount_cents, 0);
  // Transfers in are positive.
  const putInCents = putIn.reduce((t, p) => t + p.amount_cents, 0);
  const repaidCents = repaid.reduce((t, p) => t + Math.abs(p.amount_cents), 0);
  const paidCents = receiptsCents + putInCents;
  return { receiptsCents, putInCents, paidCents, repaidCents, owedCents: paidCents - repaidCents };
}

// ---- The entry form: several receipts, one total -------------------------

export type DraftLine = { key: string; postedOn: string; payee: string; amount: string; categoryId: string; note: string };

/** A new line, carrying the date and category of `from` (the line above). */
export function blankLine(from?: DraftLine): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    postedOn: from?.postedOn ?? "",
    categoryId: from?.categoryId ?? "",
    payee: "",
    amount: "",
    note: "",
  };
}

/** "2043.38", "$1,200", "+12" → signed cents (money out negative; a leading + is a refund). */
export function lineCents(amount: string): number | null {
  const t = amount.trim();
  if (!t) return null;
  const n = Number(t.replace(/[$,\s+]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  const c = Math.round(Math.abs(n) * 100);
  return t.startsWith("+") ? c : -c;
}

/**
 * Which lines are ready to record, their total, and the first problem.
 * A line left completely blank is ignored rather than an error.
 */
export function checkLines(lines: DraftLine[]) {
  const ready: (DraftLine & { cents: number })[] = [];
  let problem: string | null = null;
  lines.forEach((l, i) => {
    const blank = !l.payee.trim() && !l.amount.trim() && !l.note.trim();
    if (blank) return;
    const cents = lineCents(l.amount);
    const missing = [!l.postedOn && "a date", !l.payee.trim() && "who it was paid to", cents === null && "an amount", !l.categoryId && "a category"].filter(Boolean);
    if (missing.length) {
      problem ??= `Line ${i + 1} needs ${missing.join(", ")}.`;
      return;
    }
    ready.push({ ...l, cents: cents! });
  });
  return { ready, totalCents: ready.reduce((t, l) => t + l.cents, 0), problem };
}
