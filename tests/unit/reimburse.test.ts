import test from "node:test";
import assert from "node:assert/strict";
import { owed, type Paid } from "../../lib/reimburse";

const p = (amount_cents: number): Paid => ({ id: String(amount_cents), posted_on: "2026-08-24", amount_cents, payee: "x", category: null });

test("owed = paid personally − paid back; a refund on her card reduces it", () => {
  // Paid $2,043.38 + $412.00, refunded $12.00 → $2,443.38; paid back $1,000 → $1,443.38 owed.
  const o = owed([p(-204338), p(-41200), p(1200)], [p(-100000)]);
  assert.equal(o.paidCents, 244338);
  assert.equal(o.repaidCents, 100000);
  assert.equal(o.owedCents, 144338);
});

import { checkLines, lineCents, blankLine, type DraftLine } from "../../lib/reimburse";

const line = (p: Partial<DraftLine>): DraftLine => ({ ...blankLine(), postedOn: "2026-08-24", categoryId: "cat", ...p });

test("amounts: spent is negative, + is a refund, junk is nothing", () => {
  assert.equal(lineCents("2043.38"), -204338);
  assert.equal(lineCents("$1,200"), -120000);
  assert.equal(lineCents("+12"), 1200);
  assert.equal(lineCents("abc"), null);
  assert.equal(lineCents(""), null);
});

test("three receipts total; a blank line is ignored; a half-filled one is named", () => {
  // 2,043.38 + 412.00 + 86.20 = 2,541.58 out
  const ok = checkLines([
    line({ payee: "Keune", amount: "2043.38" }),
    line({ payee: "IKEA", amount: "412" }),
    line({ payee: "Amazon", amount: "86.20" }),
    line({}),
  ]);
  assert.equal(ok.ready.length, 3);
  assert.equal(ok.totalCents, -254158);
  assert.equal(ok.problem, null);
  const bad = checkLines([line({ payee: "IKEA", amount: "412" }), line({ payee: "Amazon", amount: "", categoryId: "" })]);
  assert.equal(bad.problem, "Line 2 needs an amount, a category.");
});

test("a new line carries the date and category of the one above", () => {
  const next = blankLine(line({ payee: "IKEA", amount: "412", note: "x" }));
  assert.equal(next.postedOn, "2026-08-24");
  assert.equal(next.categoryId, "cat");
  assert.equal(next.payee, "");
  assert.equal(next.amount, "");
});
