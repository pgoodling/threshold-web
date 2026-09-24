// Reading a supplier order, so she doesn't have to type one.
//
// Built against two real Premier Beauty Supply orders — #888385 ($247.37, 7
// Aug) and #891488 ($2,043.38, 24 Aug). The first reconciles exactly to a bank
// row; the second is one of the purchases the bank never saw.
//
// WHY THIS MATTERS MORE THAN IT LOOKS
//
// A bank row says `Premier Beauty Supply $247.37`. That single row contains
// about $33 of colour and back bar and about $176 of retail stock — two
// different tax treatments, and no per-merchant rule can ever split it. Only
// line items can. So this is not a convenience on top of the bank feed; it is
// the only route to a cost side that is actually correct.
//
// It also removes a decision from her day. Once a product is in the catalogue
// it knows what it is, so an invoice explains its own bank row and nobody
// categorises anything.
//
// THE FORMAT, AND WHY THE PARSING IS LOOSE
//
// The text layer is tab-ish but not reliably so. The same supplier's two
// orders disagree: one writes
//
//   240001 \t maria nila \t GLOSS COLLECTION LIQUID ACTIVATOR Liter \t 1 \t $9.00 \t $9.00
//
// and the other writes
//
//   240000 \t maria nila GLOSS COLLECTION CLEAR BOOSTER 2 Fl. Oz. \t 3 \t $7.00 \t $21.00
//
// with the brand and description run together. So splitting on tabs is out.
// What IS stable is the tail — quantity, unit price, line total — and the SKU
// at the head. Everything between them is the description, and the brand is
// recovered from a known list rather than from position.

export type InvoiceLine = {
  sku: string;
  brand: string | null;
  description: string;
  /** Ship quantity where the order distinguishes them, else order quantity. */
  quantity: number;
  unitCostCents: number;
  totalCents: number;
};

export type SupplierInvoice = {
  /** The supplier's order number, e.g. '888385'. */
  orderRef: string | null;
  /** ISO date the supplier received the order. */
  receivedOn: string | null;
  accountRef: string | null;
  lines: InvoiceLine[];
  subtotalCents: number | null;
  shippingCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  /** Lines that looked like products but couldn't be read. */
  skipped: string[];
  /**
   * Whether the line totals add up to the stated subtotal. Same discipline as
   * the bank CSV's balance chain: a parser that silently drops a line is worse
   * than one that refuses, because the money it loses never shows up anywhere.
   */
  check:
    | { ok: true; summedCents: number }
    | { ok: false; summedCents: number; statedCents: number | null; driftCents: number | null };
};

// Recovered by name, not by column position, because position isn't reliable.
const BRANDS = ["MOROCCANOIL", "maria nila", "Keune", "Redken", "Olaplex", "Wella"];

const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, "")) * 100);

function isoDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${String(Number(mm)).padStart(2, "0")}-${String(Number(dd)).padStart(2, "0")}`;
}

/**
 * A product line: SKU, then free text, then quantity (optionally order AND
 * ship), then unit price, then line total.
 *
 * Anchored on the two money values at the end — that tail is the one thing
 * both layouts agree on.
 */
const LINE_RE =
  /^(\d[\w-]*)\s+(.+?)\s+(\d+)(?:\s+(\d+))?\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s*$/;

function splitBrand(text: string): { brand: string | null; description: string } {
  const cleaned = text.replace(/\s+/g, " ").trim();
  for (const b of BRANDS) {
    if (cleaned.toLowerCase().startsWith(b.toLowerCase())) {
      return { brand: b, description: cleaned.slice(b.length).trim() };
    }
  }
  return { brand: null, description: cleaned };
}

export function parseSupplierInvoice(text: string): SupplierInvoice {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\t/g, " ").trim());

  let orderRef: string | null = null;
  let receivedOn: string | null = null;
  let accountRef: string | null = null;
  let subtotalCents: number | null = null;
  let shippingCents: number | null = null;
  let taxCents: number | null = null;
  let totalCents: number | null = null;

  const out: InvoiceLine[] = [];
  const skipped: string[] = [];

  for (const line of lines) {
    if (!line) continue;

    if (orderRef === null) {
      const m = line.match(/Order\s*#\s*(\d+)/i);
      if (m) {
        orderRef = m[1];
        continue;
      }
    }
    if (receivedOn === null && /^Received:/i.test(line)) {
      receivedOn = isoDate(line);
      continue;
    }
    if (accountRef === null) {
      const m = line.match(/Acct\s*#:?\s*(\d+)/i);
      if (m) {
        accountRef = m[1];
        continue;
      }
    }

    // Totals. Matched before product lines, because "Subtotal: $1,875.35"
    // would otherwise fall through and be reported as unreadable.
    const tot = line.match(/(Subtotal|Shipping|Tax|Total):\s*\$([\d,]+\.\d{2})/i);
    if (tot) {
      const v = cents(tot[2]);
      const label = tot[1].toLowerCase();
      if (label === "subtotal") subtotalCents = v;
      else if (label === "shipping") shippingCents = v;
      else if (label === "tax") taxCents = v;
      else if (label === "total") totalCents = v;
      continue;
    }

    const m = line.match(LINE_RE);
    if (m) {
      const [, sku, middle, qtyOrder, qtyShip, price, total] = m;
      const { brand, description } = splitBrand(middle);
      // Ship quantity when the layout gives both — what actually arrived is
      // what she can put on a shelf.
      const quantity = Number(qtyShip ?? qtyOrder);
      out.push({
        sku,
        brand,
        description,
        quantity,
        unitCostCents: cents(price),
        totalCents: cents(total),
      });
      continue;
    }

    // Anything with two dollar amounts that didn't parse is a product line we
    // failed on, and worth reporting. Everything else is page furniture.
    if ((line.match(/\$[\d,]+\.\d{2}/g) ?? []).length >= 2) skipped.push(line);
  }

  const summedCents = out.reduce((t, l) => t + l.totalCents, 0);
  const check: SupplierInvoice["check"] =
    subtotalCents !== null && summedCents === subtotalCents
      ? { ok: true, summedCents }
      : {
          ok: false,
          summedCents,
          statedCents: subtotalCents,
          driftCents: subtotalCents === null ? null : summedCents - subtotalCents,
        };

  return {
    orderRef,
    receivedOn,
    accountRef,
    lines: out,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents,
    skipped,
    check,
  };
}

/**
 * Spread an intro kit's price across the items that came in it.
 *
 * Suppliers bill a kit as one priced line and then list its contents as
 * separate lines at $0.00. On order #891488:
 *
 *   890326040  GLOSS LARGE INTRO 70 pc.        1 @ $438.00
 *   240030     GLOSS COLLECTION 3.0N 2 Fl.Oz.  2 @ $0.00
 *   240050     GLOSS COLLECTION 5.0N 2 Fl.Oz.  2 @ $0.00
 *   ... 30 such lines, 60 units in total
 *
 * Taken literally that gives 60 tubes worth nothing and one $438 box that
 * cannot be sold, counted or put on a head — so her colour costs come out
 * $438 short and the shelf never matches the ledger.
 *
 * Allocating instead gives $438 / 60 = $7.30 a tube. The same order bills
 * gloss she bought outright at $7.00, which is the confirmation that this
 * reading is right rather than merely tidy.
 *
 * Matched within a brand, because a maria nila kit contains maria nila. A kit
 * whose contents aren't itemised — Keune's "Care Studio Plus Intro 68 pc." on
 * the same order — has nothing to spread across, so it is left exactly as the
 * supplier billed it rather than guessed at.
 */
export function allocateKitContents(lines: InvoiceLine[]): {
  lines: InvoiceLine[];
  allocated: { kit: string; cents: number; across: number }[];
} {
  const isKit = (l: InvoiceLine) =>
    l.unitCostCents > 0 && /\bintro\b|\b\d+\s*pc\b/i.test(l.description);

  const kits = lines.filter(isKit);
  if (kits.length === 0) return { lines, allocated: [] };

  const out = [...lines];
  const allocated: { kit: string; cents: number; across: number }[] = [];

  for (const kit of kits) {
    const brand = (kit.brand ?? "").toLowerCase();
    const contents = out.filter(
      (l) => l !== kit && l.unitCostCents === 0 && (l.brand ?? "").toLowerCase() === brand,
    );
    const units = contents.reduce((t, l) => t + l.quantity, 0);
    if (contents.length === 0 || units <= 0) continue; // nothing to spread onto

    const perUnit = Math.round(kit.totalCents / units);
    for (const l of contents) {
      l.unitCostCents = perUnit;
      l.totalCents = perUnit * l.quantity;
    }

    allocated.push({ kit: kit.description, cents: kit.totalCents, across: units });
    // The kit line is a container, not stock. Its value now lives in what came
    // inside it, and keeping it would double-count both the money and the box.
    out.splice(out.indexOf(kit), 1);
  }

  return { lines: out, allocated };
}

/**
 * Does this line put colour on a head, or go on a shelf?
 *
 * A first guess only — it seeds the product record, and she can correct it
 * once, after which the catalogue remembers. Being wrong here is cheap; being
 * wrong forever would not be, which is why this never overwrites a product
 * that already exists.
 */
export function guessUse(line: InvoiceLine): {
  sellsRetail: boolean;
  usedAtBackbar: boolean;
} {
  const d = `${line.brand ?? ""} ${line.description}`.toLowerCase();

  // Colour, developer, bleach and the tools of applying them. Never retail.
  if (
    /\btinta\b|developer|lifting powder|bleach|\bgloss collection\b|activator|applicator/.test(d)
  ) {
    return { sellsRetail: false, usedAtBackbar: true };
  }

  // Intro kits are a shelf of stock, not one item. Flagged as both so she is
  // forced to look — a 68-piece kit is not a unit of anything.
  if (/\bintro\b|\bpc\.\b/.test(d)) {
    return { sellsRetail: true, usedAtBackbar: true };
  }

  // Travel sizes are retail impulse buys, not back bar.
  if (/\b[0-2]\.\d\s*fl\.?\s*oz/.test(d)) {
    return { sellsRetail: true, usedAtBackbar: false };
  }

  // Everything else — shampoo, conditioner, styling — is plausibly both, and
  // she is the one who knows.
  return { sellsRetail: true, usedAtBackbar: true };
}
