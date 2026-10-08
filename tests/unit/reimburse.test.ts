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
