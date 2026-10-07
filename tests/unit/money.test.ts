// Money: sales tax, earnings per hour, Overview's periods and totals, bank
// names, and the tax estimate. Every expected number is worked by hand in the
// comment above it.

import test from "node:test";
import assert from "node:assert/strict";
import { totals, type SaleLine } from "../../lib/retailMath";
import { cardFeeRate, serviceRows, handRate, sumVisits, type EarningsAppt } from "../../lib/serviceEarnings";
import {
  periodOf,
  periodsBack,
  visiblePeriods,
  bucketTotals,
  breakdown,
  type OverviewAppt,
  type OverviewSale,
  type OverviewTxn,
} from "../../lib/overview";
import { readableTxn } from "../../lib/bankNames";
import { estimateTax, type RateRow } from "../../lib/tax";

// ---- Sales tax (lib/retail) ----------------------------------------------

const line = (cents: number, quantity = 1): SaleLine => ({
  key: String(Math.random()), product_id: null, description: "x", sub: "", unit_price_cents: cents, quantity,
});

// $32 + $30 + $8 = $70.00. Tax per unit, rounded: 240 + 225 + 60 = 525.
// The same answer the database gave in the rolled-back test of 30 Sep.
test("check-out with two bottles and a comb: $70.00 + $5.25", () => {
  assert.deepEqual(totals([line(3200), line(3000), line(800)], 0.075), { sub: 7000, tax: 525, total: 7525 });
});

// $50 × 7.5% = $3.75.
test("one $50 serum: $53.75", () => {
  assert.deepEqual(totals([line(5000)], 0.075), { sub: 5000, tax: 375, total: 5375 });
});

// Liz Driver, 7 Sep: $30 each, tax included. 3000 / 1.075 = 2790.70 → 2791;
// 2791 × 0.075 = 209.33 → 209 a bottle. Two: 5582 + 418 = 6000 exactly.
test("Liz Driver's two $30 bottles, tax included, come to exactly $60", () => {
  assert.deepEqual(totals([line(2791), line(2791)], 0.075), { sub: 5582, tax: 418, total: 6000 });
});

// The case that tells per-unit rounding from per-line rounding: two $27.91
// bottles on ONE line. Per unit: 2791 × 0.075 = 209.325 → 209, × 2 = 418.
// Rounding the line instead would give round(418.65) = 419 — a cent off the
// database, which rounds per unit (record_retail_sale, 0047).
test("two of the same bottle on one line round per bottle, like the database", () => {
  assert.deepEqual(totals([line(2791, 2)], 0.075), { sub: 5582, tax: 418, total: 6000 });
});

test("quantity multiplies the rounded per-unit tax", () => {
  // 3 × $34: 3 × 255 tax.
  assert.deepEqual(totals([line(3400, 3)], 0.075), { sub: 10200, tax: 765, total: 10965 });
});

// ---- Earnings per hour of her hands (lib/serviceEarnings) ----------------

// Intuit took $4.53 + $18.03 = $22.56 on deposits of $196.90 + $784.10 = $981.00.
// 2256 / 98100 = 0.0229969…
test("the card fee rate is her own Intuit fees over Intuit deposits", () => {
  const rate = cardFeeRate([
    { amount_cents: 19690, category: "Card revenue (Intuit)" },
    { amount_cents: -453, category: "Card processing fees" },
    { amount_cents: 78410, category: "Card revenue (Intuit)" },
    { amount_cents: -1803, category: "Card processing fees" },
    { amount_cents: -25000, category: "Studio rent" },
  ]);
  assert.ok(Math.abs(rate - 2256 / 98100) < 1e-12);
});

test("no deposits yet means no fee rate, not a divide by zero", () => {
  assert.equal(cardFeeRate([]), 0);
});

const highlight = {
  name: "Custom Cut & Partial Highlight", price_cents: 15000,
  start_minutes: 60, process_minutes: 45, finish_minutes: 75, duration_minutes: 180,
};
const appt = (over: Partial<EarningsAppt>): EarningsAppt => ({
  id: String(Math.random()), starts_at: "2026-09-12T14:00:00Z", paid_cents: 20000, payment_method: "card",
  start_minutes: null, process_minutes: null, finish_minutes: null, block_processing: null, services: highlight, ...over,
});

// A $200 highlight by card at 2.3%: fee 460. Hands = 60 + 75 = 135 min
// (processing is free for another client). (20000 − 460) ÷ 135 × 60 = 8684.44.
test("a highlight is earned over her hands, not the 3 hours in the chair", () => {
  const [row] = serviceRows([appt({})], 0.023);
  const v = row.visits[0];
  assert.equal(v.feeCents, 460);
  assert.equal(v.handMinutes, 135);
  assert.equal(v.chairMinutes, 180);
  assert.equal(v.processMinutes, 45);
  assert.ok(Math.abs(handRate(row) - (19540 / 135) * 60) < 1e-9);
});

// Blocked processing: nobody else could be booked, so all 180 minutes are hers.
test("blocked processing counts the whole visit as hers", () => {
  const [row] = serviceRows([appt({ block_processing: true })], 0.023);
  assert.equal(row.visits[0].handMinutes, 180);
  assert.equal(row.visits[0].processMinutes, 0);
});

// A blowout she stretched to 120 minutes on the visit itself: $45 cash, no fee.
// 4500 ÷ 120 × 60 = 2250 — what it really earned that day.
test("a visit's own timing beats the service's", () => {
  const blowout = { name: "Blowouts", price_cents: 4500, start_minutes: 45, process_minutes: 0, finish_minutes: 0, duration_minutes: 45 };
  const [row] = serviceRows([appt({ services: blowout, paid_cents: 4500, payment_method: "cash", start_minutes: 120 })], 0.023);
  assert.equal(row.visits[0].feeCents, 0);
  assert.equal(row.visits[0].handMinutes, 120);
  assert.equal(handRate(row), 2250);
});

// The Services page check from 30 Sep, against SQL: five visits paid
// $225 + $200 + $150 + $175 + $220 = $970; fees at 2.3% = 518 + 460 + 345 + 403 + 506
// = 2232 (Math.round each: 517.5→518, 402.5→403, 506 exactly). Hands 150 + 135×4 = 690.
// (97000 − 2232) ÷ 690 × 60 = 8240.70 → $82.41 an hour.
test("the five Cut & Partial Highlight visits come to $82.41 an hour", () => {
  const visits = [
    appt({ paid_cents: 22500, start_minutes: 75 }), // one visit set to 75 + 75 = 150 hands
    appt({ paid_cents: 20000 }),
    appt({ paid_cents: 15000 }),
    appt({ paid_cents: 17500 }),
    appt({ paid_cents: 22000 }),
  ];
  const [row] = serviceRows(visits, 0.023);
  assert.equal(sumVisits(row.visits, "paidCents"), 97000);
  assert.equal(sumVisits(row.visits, "feeCents"), 2232);
  assert.equal(sumVisits(row.visits, "handMinutes"), 690);
  assert.equal(Math.round(handRate(row)), 8241);
});

test("unpaid visits and free consultations are left out", () => {
  assert.equal(serviceRows([appt({ paid_cents: 0 }), appt({ paid_cents: null })], 0.023).length, 0);
});

// ---- Overview: periods (lib/overview) ------------------------------------

test("weeks start on Monday", () => {
  assert.equal(periodOf("2026-10-07", "week"), "2026-10-05"); // Wed → Mon
  assert.equal(periodOf("2026-10-05", "week"), "2026-10-05"); // Mon → itself
  assert.equal(periodOf("2026-10-11", "week"), "2026-10-05"); // Sun → the Monday before
});

test("months, quarters and years key the obvious way", () => {
  assert.equal(periodOf("2026-09-30", "month"), "2026-09");
  assert.equal(periodOf("2026-09-30", "quarter"), "2026-Q3");
  assert.equal(periodOf("2026-10-01", "quarter"), "2026-Q4");
  assert.equal(periodOf("2026-10-01", "year"), "2026");
});

test("periodsBack ends with the current period, oldest first", () => {
  assert.deepEqual(periodsBack("month", 3, "2026-10-07"), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(periodsBack("quarter", 2, "2026-10-07"), ["2026-Q3", "2026-Q4"]);
  assert.deepEqual(periodsBack("week", 2, "2026-10-07"), ["2026-09-28", "2026-10-05"]);
});

test("a month-end day doesn't skip a month going back", () => {
  // From 31 Oct, one month back must be September, not October 1 → "Oct 1".
  assert.deepEqual(periodsBack("month", 3, "2026-10-31"), ["2026-08", "2026-09", "2026-10"]);
});

test("the chart starts at the first month with money in it", () => {
  const txns = [{ ...txn("2026-08-11", -24737, "Back bar and supplies", "product") }];
  assert.deepEqual(visiblePeriods("month", "2026-10-07", [], [], txns), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(visiblePeriods("month", "2026-10-07", [], [], []), ["2026-10"]);
});

// ---- Overview: totals ----------------------------------------------------

function txn(posted_on: string, amount_cents: number, name: string, kind: string): OverviewTxn {
  return { id: String(Math.random()), posted_on, amount_cents, merchant: null, description: null, expense_categories: { name, kind } };
}

// September, in miniature:
//   revenue  = $160 Liz (her service after the bottles) + $55 cut + $55.82 bottles before tax = $270.82
//   running  = $250 rent + $157.50 SalonCentric + $4.53 fee − $10 refund = $402.03
//   setup    = $1,208 furniture
//   not counted: $705 transfer to savings, $40 owner draw, $300 personal
const appts: OverviewAppt[] = [
  { starts_at: "2026-09-07T17:00:00Z", paid_cents: 16000, services: { name: "Custom Cut & Partial Highlight" } },
  { starts_at: "2026-09-10T14:00:00Z", paid_cents: 5500, services: { name: "Cut & Style" } },
  // 11:30 pm on 30 Sep in Kettering is 03:30 UTC on 1 Oct: still September.
  { starts_at: "2026-10-01T03:30:00Z", paid_cents: 0, services: { name: "Cut & Style" } },
];
const sales: OverviewSale[] = [{ sold_on: "2026-09-07", subtotal_cents: 5582 }];
const txns: OverviewTxn[] = [
  txn("2026-09-18", -25000, "Studio rent", "fixed"),
  txn("2026-09-24", -15750, "Back bar and supplies", "product"),
  txn("2026-09-30", -453, "Card processing fees", "variable"),
  txn("2026-09-25", 1000, "Back bar and supplies", "product"), // a refund
  txn("2026-09-21", -120800, "Furniture and fixtures", "capital"),
  txn("2026-09-19", -70500, "Transfer between accounts", "owner"),
  txn("2026-09-20", -4000, "Owner draw", "owner"),
  txn("2026-09-22", -30000, "Personal", "excluded"),
  txn("2026-09-30", 19690, "Card revenue (Intuit)", "revenue"), // deposits are not revenue here
];

test("September's revenue, running expenses and setting up", () => {
  const b = bucketTotals(["2026-09"], "month", appts, sales, txns).get("2026-09")!;
  assert.equal(b.revenue, 16000 + 5500 + 5582);
  assert.equal(b.expenses, 25000 + 15750 + 453 - 1000);
  assert.equal(b.setup, 120800);
});

test("profit is shown both ways", () => {
  const b = bucketTotals(["2026-09"], "month", appts, sales, txns).get("2026-09")!;
  assert.equal(b.revenue - b.expenses, 27082 - 40203); // before setting up: −$131.21
  assert.equal(b.revenue - b.expenses - b.setup, 27082 - 40203 - 120800);
});

test("the late appointment lands in its salon day, not UTC's", () => {
  const sep = breakdown("2026-09", "month", appts, sales, txns);
  const cuts = sep.services.find(([n]) => n === "Cut & Style")![1];
  assert.equal(cuts.visits, 2);
});

test("the breakdown lists expenses largest first and keeps setting up apart", () => {
  const sep = breakdown("2026-09", "month", appts, sales, txns);
  assert.deepEqual(sep.running.map(([n, v]) => [n, v.cents]), [
    ["Studio rent", 25000],
    ["Back bar and supplies", 14750],
    ["Card processing fees", 453],
  ]);
  assert.deepEqual(sep.setup.map(([n, v]) => [n, v.cents]), [["Furniture and fixtures", 120800]]);
  assert.equal(sep.productCents, 5582);
  assert.equal(sep.cats.has("Transfer between accounts"), false);
  assert.equal(sep.cats.has("Personal"), false);
});

// ---- Bank names ----------------------------------------------------------

test("bank lines get names a person would use", () => {
  assert.equal(readableTxn({ merchant: "INTUIT 31309943", description: null, amount_cents: 19690 }), "Card payments (Intuit)");
  assert.equal(readableTxn({ merchant: "INTUIT 27823273", description: null, amount_cents: -588 }), "Intuit fee");
  assert.equal(readableTxn({ merchant: "SALON LOFTS", description: null, amount_cents: -25000 }), "Salon Lofts");
  assert.equal(readableTxn({ merchant: "WALGREENS 01234 KETTERING", description: null, amount_cents: -300 }), "Walgreens");
  assert.equal(readableTxn({ merchant: "SalonCentric", description: null, amount_cents: -15750 }), "SalonCentric");
});

// ---- The tax estimate (lib/tax) ------------------------------------------

const r = (jurisdiction: string, rate: number, over: Partial<RateRow> = {}): RateRow => ({
  jurisdiction, label: jurisdiction, rate, filing_status: null, bracket_floor_cents: null, cap_cents: null,
  exempt_below_cents: null, source_url: "", checked_on: "2026-09-23", notes: null, ...over,
});
const RATES: RateRow[] = [
  r("federal_se_ss", 0.124, { cap_cents: 17_610_000 }),
  r("federal_se_medicare", 0.029),
  r("federal_qbi", 0.2),
  r("federal_standard_deduction", 0, { filing_status: "single", exempt_below_cents: 1_500_000 }),
  r("federal_income", 0.1, { filing_status: "single", bracket_floor_cents: 0 }),
  r("federal_income", 0.12, { filing_status: "single", bracket_floor_cents: 1_000_000 }),
  r("ohio", 0.03, { exempt_below_cents: 25_000_000 }),
  r("kettering", 0.0225),
  r("oakwood", 0.025),
  r("oakwood_credit", 0.9),
];

// $60,000 profit, single, no other income:
//   SE base 0.9235 × 6,000,000 = 5,541,000; SS 12.4% = 687,084; Medicare 2.9% = 160,689 → 847,773
//   half SE 423,887 (423,886.5 rounds up); QBI 20% × (6,000,000 − 423,887) = 1,115,223
//   taxable 6,000,000 − 423,887 − 1,115,223 − 1,500,000 = 2,960,890
//   income tax 10% × 1,000,000 + 12% × 1,960,890 = 100,000 + 235,306.8 → 335,307
//   Ohio: under $250,000 → 0
//   Kettering 2.25% → 135,000; Oakwood 2.5% = 150,000 less 90% × 135,000 = 121,500 → 28,500
//   total 847,773 + 335,307 + 0 + 135,000 + 28,500 = 1,346,580
test("$60,000 of profit, line by line", () => {
  const est = estimateTax({ profitCents: 6_000_000, rates: RATES, filingStatus: "single", otherIncomeCents: 0 });
  const by = Object.fromEntries(est.lines.map((l) => [l.key, l.cents]));
  assert.equal(by.federal_se, 847_773);
  assert.equal(by.federal_income, 335_307);
  assert.equal(by.ohio, 0);
  assert.equal(by.kettering, 135_000);
  assert.equal(by.oakwood, 28_500);
  assert.equal(est.totalCents, 1_346_580);
});

// 1,346,580 / 6,000,000 = 22.4% → rounded up to the next 5¢ = 25¢.
test("the set-aside rounds up and never drops below a quarter", () => {
  const est = estimateTax({ profitCents: 6_000_000, rates: RATES, filingStatus: "single", otherIncomeCents: 0 });
  assert.ok(Math.abs(est.effectiveRate - 1_346_580 / 6_000_000) < 1e-12);
  assert.equal(est.suggestedRate, 0.25);
});

test("Oakwood is the 0.475% that gets missed", () => {
  const est = estimateTax({ profitCents: 1_000_000, rates: RATES, filingStatus: "single", otherIncomeCents: 0 });
  assert.equal(est.lines.find((l) => l.key === "oakwood")!.cents, 4_750); // 0.475% of $10,000
});

test("not saying how she files is flagged, and assumed single", () => {
  const est = estimateTax({ profitCents: 6_000_000, rates: RATES, filingStatus: null, otherIncomeCents: null });
  assert.ok(est.missing.some((m) => /single or jointly/.test(m)));
  assert.equal(est.totalCents, 1_346_580);
});

test("no profit, no tax", () => {
  const est = estimateTax({ profitCents: -50_000, rates: RATES, filingStatus: "single", otherIncomeCents: 0 });
  assert.equal(est.totalCents, 0);
  assert.equal(est.lines.length, 0);
});
