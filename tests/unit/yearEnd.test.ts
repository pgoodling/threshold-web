// Year-end summary on Schedule C lines (lib/yearEnd). Built from her real
// 2026 category totals as of 2026-10-08, one row per category for clarity.

import test from "node:test";
import assert from "node:assert/strict";
import { yearEnd, compareTakings, toCsv, lineOrder, type YearRow } from "../../lib/yearEnd";

let n = 0;
const row = (name: string, kind: string, line: string | null, cents: number, posted_on = "2026-09-15"): YearRow => ({
  id: String(++n),
  posted_on,
  amount_cents: cents,
  merchant: name,
  description: null,
  category: { name, kind, schedule_c_line: line },
});

const ROWS: YearRow[] = [
  row("Card revenue (Intuit)", "revenue", "1", 668162),
  row("Card processing fees", "variable", "10", -15369),
  row("Professional services", "variable", "17", -17514),
  row("Studio rent", "fixed", "20b", -75000),
  row("Repairs and maintenance", "variable", "21", -8039),
  row("Back bar and supplies", "product", "22", -76208),
  row("Nail care (working hands)", "variable", "27a", -17655),
  row("Software and subscriptions", "fixed", "27a", -2000),
  row("Furniture and fixtures", "capital", null, -163533),
  row("Salon equipment", "capital", null, -30093),
  row("Decor and finishing", "capital", null, -5477),
  row("Owner contribution", "contribution", null, 330000),
  row("Transfer between accounts", "owner", null, -70500),
  { ...row("x", "x", null, -1234), category: null },
];

test("her 2026 so far: lines, setting up, net profit", () => {
  // Sales tax collected $4.18 comes out of receipts: 668,162 − 418 = 667,744.
  const y = yearEnd(ROWS, { salesTaxCents: 418 });
  assert.equal(y.grossCents, 667744);
  // 15,369 + 17,514 + 75,000 + 8,039 + 76,208 + (17,655 + 2,000) = 211,785
  assert.equal(y.expensesCents, 211785);
  assert.deepEqual(y.lines.map((l) => l.line), ["10", "17", "20b", "21", "22", "27a"]);
  assert.equal(y.lines.find((l) => l.line === "27a")!.cents, 19655);
  // 163,533 + 30,093 + 5,477 = 199,103
  assert.equal(y.setupCents, 199103);
  // 667,744 − 211,785 − 199,103 = 256,856
  assert.equal(y.netCents, 256856);
  assert.equal(y.toSort.length, 1);
  assert.deepEqual(y.notOnForm.map((x) => x.name).sort(), ["Owner contribution", "Transfer between accounts"]);
});

test("meals: the form takes half of what was spent", () => {
  const y = yearEnd([row("Meals (deductible half)", "variable", "24b", -5001)], { salesTaxCents: 0 });
  assert.equal(y.lines[0].cents, 2501); // round(5,001 ÷ 2)
  assert.equal(y.lines[0].spentCents, 5001);
});

test("lines sort the way the form prints them", () => {
  assert.deepEqual(["P3", "27a", "8", "20b", "10", "24b", "24a"].sort(lineOrder), ["8", "10", "20b", "24a", "24b", "27a", "P3"]);
});

test("check-outs against the bank: cash not entered as income is flagged", () => {
  // Card $500 at check-out vs $480 deposited; cash and Venmo $120, of which $20 entered.
  const t = compareTakings([{ method: "card", cents: 50000 }, { method: "cash", cents: 8000 }, { method: "venmo", cents: 4000 }], 48000, 2000);
  assert.equal(t.cardRecordedCents, 50000);
  assert.equal(t.otherRecordedCents, 12000);
  assert.equal(t.otherMissingCents, 10000);
});

test("the CSV opens with the summary and lists every row, commas quoted", () => {
  const y = yearEnd([...ROWS, row("Smith, Jones & Co", "variable", "17", -1000)], { salesTaxCents: 418 });
  const csv = toCsv(2026, y);
  assert.match(csv, /^Threshold Salon -- 2026 -- Schedule C summary/);
  assert.match(csv, /\n20b,Rent or lease: other business property,750\.00\n/);
  assert.match(csv, /"Smith, Jones & Co"/);
  assert.match(csv, /To sort/);
});
