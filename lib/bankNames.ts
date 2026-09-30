// What a bank line should be called on screen.
//
// Relay passes the card processor's reference through as the merchant, so
// every deposit reads "INTUIT 31309943" and every fee "INTUIT 27823273" —
// true, and useless. Shared by Bank and Overview so a row has one name.

export function readableTxn(t: {
  merchant: string | null;
  description: string | null;
  amount_cents: number;
}): string {
  const raw = (t.merchant || t.description || "—").trim();
  if (/^intuit\b/i.test(raw)) return t.amount_cents > 0 ? "Card payments (Intuit)" : "Intuit fee";
  if (raw !== raw.toUpperCase()) return raw;
  return raw
    .toLowerCase()
    .replace(/\s+\d{3,}.*$/, "") // trailing store numbers
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
