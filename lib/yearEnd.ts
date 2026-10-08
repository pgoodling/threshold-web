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

export function yearEnd(rows: YearRow[], opts: { salesTaxCents: number }) {
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
  const grossCents = receipts - opts.salesTaxCents;

  return {
    receiptsCents: receipts,
    receiptRows,
    salesTaxCents: opts.salesTaxCents,
    grossCents,
    lines,
    expensesCents: expenses,
    setup,
    setupCents,
    // The same profit Money → Taxes estimates on: setting-up counted in full.
    netCents: grossCents - expenses - setupCents,
    toSort,
    notOnForm: [...notOnForm.entries()].map(([name, cents]) => ({ name, cents })),
  };
}

export type CheckOuts = { method: string; cents: number }[];

/**
 * Takings recorded at check-out (services + products) by how she was paid,
 * against what reached the bank as income. Card should roughly match deposits;
 * cash, Venmo and Zelle only count if she entered them.
 */
export function compareTakings(checkOuts: CheckOuts, cardDepositsCents: number, otherEnteredCents: number) {
  const card = checkOuts.filter((c) => c.method === "card").reduce((t, c) => t + c.cents, 0);
  const other = checkOuts.filter((c) => c.method !== "card").reduce((t, c) => t + c.cents, 0);
  return {
    cardRecordedCents: card,
    cardDepositedCents: cardDepositsCents,
    otherRecordedCents: other,
    otherEnteredCents,
    /** Non-card takings recorded at check-out but not entered as income. */
    otherMissingCents: Math.max(0, other - otherEnteredCents),
  };
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
  out.push(["1", "Gross receipts (deposits and takings entered)", dollars(y.receiptsCents)]);
  out.push(["", "less sales tax collected (not income)", dollars(-y.salesTaxCents)]);
  out.push(["", "Gross receipts, net of sales tax", dollars(y.grossCents)]);
  for (const l of y.lines)
    out.push([l.line, l.spentCents !== undefined ? `${l.name} (half of ${dollars(l.spentCents)} spent)` : l.name, dollars(l.cents)]);
  out.push(["", "Setting up: furniture, equipment, decor (preparer to assign)", dollars(y.setupCents)]);
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
  add("To sort", y.toSort);
  return out.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
