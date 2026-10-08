import { costGroup, type CostGroup } from "./costGroups";

// The year on Schedule C lines, for whoever prepares her return (built
// 2026-10-08). Same rows as Money → Taxes -- business bank rows posted in the
// year -- grouped by the Schedule C line each category already carries (0036),
// so the estimate she's been saving against and the summary can't disagree.
//
// It lays the figures out; it doesn't make the preparer's decisions. Setting-up
// purchases are listed item by item rather than assigned a line, and the
// reconciliation figures (check-outs vs deposits, stock on hand) are there
// because a preparer will ask for them.

export type YearRow = {
  id: string;
  posted_on: string;
  amount_cents: number;
  merchant: string | null;
  description: string | null;
  category: { name: string; kind: string; schedule_c_line: string | null } | null;
};

// Schedule C (Form 1040) line names, as printed on the form.
export const LINE_NAMES: Record<string, string> = {
  "1": "Gross receipts or sales",
  "8": "Advertising",
  "9": "Car and truck expenses",
  "10": "Commissions and fees",
  "11": "Contract labor",
  "13": "Depreciation and section 179",
  "15": "Insurance (other than health)",
  "16b": "Interest (other)",
  "17": "Legal and professional services",
  "18": "Office expense",
  "20a": "Rent or lease: vehicles, machinery, equipment",
  "20b": "Rent or lease: other business property",
  "21": "Repairs and maintenance",
  "22": "Supplies",
  "23": "Taxes and licenses",
  "24a": "Travel",
  "24b": "Deductible meals",
  "25": "Utilities",
  "27a": "Other expenses",
  P3: "Part III: purchases for resale",
};

/** "8" < "10" < "20b" < "27a" < "P3", the order they appear on the form. */
export function lineOrder(a: string, b: string) {
  const key = (l: string) => (l.startsWith("P") ? 1000 + Number(l.slice(1)) : parseFloat(l) + (/[a-z]$/.test(l) ? (l.charCodeAt(l.length - 1) - 96) / 10 : 0));
  return key(a) - key(b);
}

export type Line = {
  line: string;
  name: string;
  /** What the form gets: for 24b, half of what was spent. */
  cents: number;
  /** What was actually spent, when it differs (24b). */
  spentCents?: number;
  categories: string[];
  rows: YearRow[];
};

const EXPENSE_KINDS = ["fixed", "product", "variable", "resale"];

// ---- Before opening ---------------------------------------------------------
//
// Spending before the salon opened isn't an ordinary expense of the year it
// was paid. Startup costs (26 U.S.C. § 195) are claimed from the year the
// business began -- up to $5,000 that year, less any amount by which they
// exceed $50,000, and the rest spread evenly over 180 months from the month it
// opened. Furniture and equipment, and product, aren't startup costs and are
// kept apart (lib/costGroups.ts). The preparer makes the call; this lays it
// out and does the arithmetic the statute describes.

const FIRST_YEAR_CENTS = 500_000;
const PHASEOUT_FROM_CENTS = 5_000_000;
const MONTHS = 180;

/** What the startup costs deduct in `year`, given when the business opened. */
export function startupDeduction(startupCents: number, openedOn: string, year: number) {
  const [oy, om] = openedOn.split("-").map(Number);
  if (startupCents <= 0 || year < oy) return { firstYearCents: 0, monthlyCents: 0, months: 0, cents: 0 };
  const first = Math.min(startupCents, Math.max(0, FIRST_YEAR_CENTS - Math.max(0, startupCents - PHASEOUT_FROM_CENTS)));
  const monthly = (startupCents - first) / MONTHS;
  const firstYearMonths = 12 - om + 1;
  const elapsed = year === oy ? 0 : firstYearMonths + (year - oy - 1) * 12;
  const months = Math.max(0, Math.min(year === oy ? firstYearMonths : 12, MONTHS - elapsed));
  const thisYearFirst = year === oy ? first : 0;
  return {
    firstYearCents: thisYearFirst,
    monthlyCents: monthly,
    months,
    cents: thisYearFirst + Math.round(monthly * months),
  };
}

export type PreOpening = {
  openedOn: string;
  /** This summary's year is the year she opened, so the costs are claimed here. */
  claimedHere: boolean;
  groups: Record<CostGroup, { cents: number; rows: YearRow[] }>;
  startup: ReturnType<typeof startupDeduction>;
  /** Deducted in this year: equipment and product in full (opening year), startup per § 195. */
  deductedCents: number;
};

export function yearEnd(
  allRows: YearRow[],
  opts: { salesTaxCents: number; offBankCents?: number; year?: number; openedOn?: string | null },
) {
  // Which rows belong to this year's ordinary lines, and which are pre-opening.
  const year = opts.year;
  const openedOn = opts.openedOn ?? null;
  const inYear = (r: YearRow) => year === undefined || r.posted_on.slice(0, 4) === String(year);
  const preOpeningSpend = (r: YearRow) =>
    !!openedOn && r.posted_on < openedOn && !!r.category && costGroup(r.category) !== null;
  const rows = allRows.filter((r) => inYear(r) && !preOpeningSpend(r));
  let pre: PreOpening | null = null;
  if (openedOn && year !== undefined) {
    const before = allRows.filter(preOpeningSpend);
    const groups: PreOpening["groups"] = {
      equipment: { cents: 0, rows: [] },
      product: { cents: 0, rows: [] },
      other: { cents: 0, rows: [] },
    };
    for (const r of before) {
      const g = groups[costGroup(r.category!)!];
      g.cents -= r.amount_cents; // spending is negative; refunds reduce it
      g.rows.push(r);
    }
    const oy = Number(openedOn.slice(0, 4));
    const startup = startupDeduction(groups.other.cents, openedOn, year);
    const claimedHere = year === oy;
    // Shown in the opening year, in a later year still amortising, and in an
    // earlier year that has pre-opening receipts (to say where they went).
    const paidThisYear = before.some((r) => r.posted_on.slice(0, 4) === String(year));
    if (before.length > 0 && (claimedHere || startup.cents > 0 || (year < oy && paidThisYear)))
      pre = {
        openedOn,
        claimedHere,
        groups,
        startup,
        deductedCents: (claimedHere ? groups.equipment.cents + groups.product.cents : 0) + startup.cents,
      };
  }

  const byLine = new Map<string, Line>();
  const setup: YearRow[] = [];
  const toSort: YearRow[] = [];
  const notOnForm = new Map<string, number>();
  let receipts = 0;
  const receiptRows: YearRow[] = [];

  for (const r of rows) {
    const c = r.category;
    if (!c) {
      toSort.push(r);
      continue;
    }
    if (c.kind === "revenue") {
      receipts += Math.abs(r.amount_cents);
      receiptRows.push(r);
    } else if (c.kind === "capital") {
      setup.push(r);
    } else if (EXPENSE_KINDS.includes(c.kind) && c.schedule_c_line) {
      const l = byLine.get(c.schedule_c_line) ?? {
        line: c.schedule_c_line,
        name: LINE_NAMES[c.schedule_c_line] ?? `Line ${c.schedule_c_line}`,
        cents: 0,
        categories: [],
        rows: [],
      };
      l.cents += Math.abs(r.amount_cents);
      if (!l.categories.includes(c.name)) l.categories.push(c.name);
      l.rows.push(r);
      byLine.set(c.schedule_c_line, l);
    } else {
      // Owner money in and out, transfers, personal: real, but not on the form.
      notOnForm.set(c.name, (notOnForm.get(c.name) ?? 0) + r.amount_cents);
    }
  }

  // Meals: the form takes half of what was spent.
  const meals = byLine.get("24b");
  if (meals) {
    meals.spentCents = meals.cents;
    meals.cents = Math.round(meals.cents / 2);
  }

  const lines = [...byLine.values()].filter((l) => l.cents !== 0).sort((a, b) => lineOrder(a.line, b.line));
  const expenses = lines.reduce((t, l) => t + l.cents, 0);
  const setupCents = setup.reduce((t, r) => t + Math.abs(r.amount_cents), 0);
  // Cash (and any Venmo/Zelle) taken at check-out never reaches the bank, so
  // it's added from the check-outs themselves (lib/takings.ts).
  const offBank = opts.offBankCents ?? 0;
  const depositsCents = receipts;
  receipts += offBank;
  const grossCents = receipts - opts.salesTaxCents;

  return {
    depositsCents,
    offBankCents: offBank,
    receiptsCents: receipts,
    receiptRows,
    salesTaxCents: opts.salesTaxCents,
    grossCents,
    lines,
    expensesCents: expenses,
    setup,
    setupCents,
    // The same profit Money → Taxes estimates on: setting-up counted in full,
    // pre-opening spending as described above.
    netCents: grossCents - expenses - setupCents - (pre?.deductedCents ?? 0),
    preOpening: pre,
    toSort,
    notOnForm: [...notOnForm.entries()].map(([name, cents]) => ({ name, cents })),
  };
}

export type CheckOuts = { method: string; cents: number }[];

/**
 * Card taken at check-out against card deposits. Deposits run higher by the
 * tips, which go through the reader but are kept in another service.
 */
export function compareCard(checkOuts: CheckOuts, cardDepositsCents: number) {
  const card = checkOuts.filter((c) => c.method === "card").reduce((t, c) => t + c.cents, 0);
  return { cardRecordedCents: card, cardDepositedCents: cardDepositsCents, tipsCents: Math.max(0, cardDepositsCents - card) };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dollars = (c: number) => (c / 100).toFixed(2);

/** One file a preparer can open: the summary, then every transaction behind it. */
export function toCsv(year: number, y: ReturnType<typeof yearEnd>) {
  const out: (string | number)[][] = [];
  out.push([`Threshold Salon -- ${year} -- Schedule C summary`]);
  out.push([]);
  out.push(["Line", "Name", "Amount"]);
  out.push(["1", "Gross receipts", dollars(y.receiptsCents)]);
  out.push(["", "  of which deposits (card, incl. tips)", dollars(y.depositsCents)]);
  out.push(["", "  of which cash and other taken at check-out", dollars(y.offBankCents)]);
  out.push(["", "less sales tax collected (not income)", dollars(-y.salesTaxCents)]);
  out.push(["", "Gross receipts, net of sales tax", dollars(y.grossCents)]);
  for (const l of y.lines)
    out.push([l.line, l.spentCents !== undefined ? `${l.name} (half of ${dollars(l.spentCents)} spent)` : l.name, dollars(l.cents)]);
  out.push(["", "Setting up: furniture, equipment, decor (preparer to assign)", dollars(y.setupCents)]);
  if (y.preOpening) {
    const p = y.preOpening;
    out.push(["", `Before opening (${p.openedOn})${p.claimedHere ? "" : " -- claimed in the opening year"}`, ""]);
    out.push(["", "  Furniture and equipment", dollars(p.groups.equipment.cents)]);
    out.push(["", "  Product", dollars(p.groups.product.cents)]);
    out.push(["", "  Startup costs (other business costs)", dollars(p.groups.other.cents)]);
    out.push(["", "  Startup costs deducted this year (§ 195)", dollars(p.startup.cents)]);
  }
  out.push(["31", "Net profit, setting up counted in full", dollars(y.netCents)]);
  out.push([]);
  out.push(["Date", "Line", "Category", "Description", "Amount"]);
  const add = (line: string, rows: YearRow[]) => {
    for (const r of [...rows].sort((a, b) => a.posted_on.localeCompare(b.posted_on)))
      out.push([r.posted_on, line, r.category?.name ?? "", r.merchant || r.description || "", dollars(r.amount_cents)]);
  };
  add("1", y.receiptRows);
  for (const l of y.lines) add(l.line, l.rows);
  add("Setting up", y.setup);
  if (y.preOpening) {
    add("Before opening: furniture and equipment", y.preOpening.groups.equipment.rows);
    add("Before opening: product", y.preOpening.groups.product.rows);
    add("Before opening: startup costs", y.preOpening.groups.other.rows);
  }
  add("To sort", y.toSort);
  return out.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
