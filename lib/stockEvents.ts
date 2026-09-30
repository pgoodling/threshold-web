// What happened to a product, in her words rather than the ledger's.
//
// Shared by a product's history and the This week list, so "to the back bar"
// can't be called one thing in one place and something else in the other.

import { TZ } from "./format";

export type Movement = {
  id: string;
  kind: "received" | "sold" | "used" | "finished" | "missing" | "adjusted";
  quantity: number;
  occurred_on: string;
  created_at: string;
  invoice_ref: string | null;
  note: string | null;
  unit_price_cents: number | null;
};

/** A count writes these; everything else that adjusts stock doesn't. */
export const isCount = (m: Pick<Movement, "kind" | "note">) =>
  m.kind === "missing" || (m.kind === "adjusted" && (m.note ?? "").startsWith("Counted"));

const n = (q: number) => Math.abs(Number(q));

/** "1 to the back bar", "2 arrived · order 891488", "counted, 1 missing". */
export function describe(m: Movement): string {
  const q = n(m.quantity);
  switch (m.kind) {
    case "received":
      return `${q} arrived` + (m.invoice_ref ? ` · order ${m.invoice_ref}` : "");
    case "used":
      return `${q} to the back bar`;
    case "finished":
      return q === 1 ? "finished" : `${q} finished`;
    case "sold":
      return (
        `${q} sold` +
        (m.unit_price_cents != null ? ` · $${(m.unit_price_cents / 100).toFixed(2)}` : "")
      );
    case "missing":
      return `counted, ${q} missing`;
    case "adjusted":
      if (isCount(m)) return `counted, ${q} extra`;
      return m.note ?? (Number(m.quantity) > 0 ? `${q} added` : `${q} removed`);
  }
}

/** "Sep 29" — occurred_on is a plain date, so no timezone games. */
export function shortDate(ymd: string): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Today in the salon, as YYYY-MM-DD. */
export const salonToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** "Today", "Yesterday", then the weekday — the list only goes back a week. */
export function dayHeading(ymd: string): string {
  const today = salonToday();
  const [y, mo, d] = today.split("-").map(Number);
  const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(
    new Date(Date.UTC(y, mo - 1, d - 1)),
  );
  if (ymd === today) return "Today";
  if (ymd === yesterday) return "Yesterday";
  const [yy, mm, dd] = ymd.split("-").map(Number);
  return new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}
