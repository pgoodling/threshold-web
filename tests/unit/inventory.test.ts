// Inventory: names on a phone, what a movement says, bottle sizes.

import test from "node:test";
import assert from "node:assert/strict";
import { nameProduct, byName } from "../../lib/productLine";
import { describe, isCount, shortDate, type Movement } from "../../lib/stockEvents";
import { splitSize } from "../../lib/stockSize";

// ---- Names: range as the heading, the rest on the row --------------------

test("a Keune care product splits into range and product, size pulled out", () => {
  assert.deepEqual(nameProduct({ name: "Long & Strong Strengthening Shampoo 10.1 oz.", brand: "Keune", size: null }), {
    group: "Keune · Long & Strong",
    short: "Strengthening Shampoo",
    size: "10.1 oz",
  });
});

test("a Tinta shade loses the supplier's dash", () => {
  const n = nameProduct({ name: "Tinta 6- Dark Blonde 2 Fl. Oz.", brand: "Keune", size: null });
  assert.equal(n.group, "Keune · Tinta");
  assert.equal(n.short, "6 Dark Blonde");
  assert.equal(n.size, "2 oz");
});

test("the developer's long name gets to the point", () => {
  const n = nameProduct({ name: "Tinta Tinta, So Pure, & 1922 by J.M. Keune Developer 6% 20 Vol. Liter", brand: "Keune", size: null });
  assert.equal(n.short, "Developer 6% 20 Vol.");
  assert.equal(n.size, "1 litre");
});

test("ALL CAPS names are tamed, shade codes kept", () => {
  const n = nameProduct({ name: "GLOSS COLLECTION 10.0N 2 Fl. Oz.", brand: "maria nila", size: null });
  assert.equal(n.group, "Maria Nila · Gloss Collection");
  assert.equal(n.short, "10.0N");
  assert.equal(nameProduct({ name: "MIRROR GLOSS MASK 8.5 Fl. Oz.", brand: "maria nila", size: null }).short, "Mirror Gloss Mask");
});

test("an unknown range falls back to the brand, which is always right", () => {
  const n = nameProduct({ name: "HYDRATING CONDITIONER 2.4 Fl. Oz.", brand: "MOROCCANOIL", size: null });
  assert.equal(n.group, "Moroccanoil");
  assert.equal(n.short, "Hydrating Conditioner");
});

test("a size typed in by hand beats the one in the name", () => {
  assert.equal(nameProduct({ name: "Blonde IQ 7 Calibrated Powder Lightener", brand: "Redken", size: "1.1 lb" }).size, "1.1 lb");
});

test("shades sort as numbers: 9.9P before 10.0N", () => {
  assert.deepEqual(["10.0N", "9.9P", "2"].sort(byName), ["2", "9.9P", "10.0N"]);
});

// ---- What a movement says ------------------------------------------------

const m = (kind: Movement["kind"], quantity: number, extra: Partial<Movement> = {}): Movement => ({
  id: "x", kind, quantity, occurred_on: "2026-09-29", created_at: "", invoice_ref: null, note: null, unit_price_cents: null, ...extra,
});

test("each kind of movement reads in her words", () => {
  assert.equal(describe(m("received", 2, { invoice_ref: "891488" })), "2 arrived · order 891488");
  assert.equal(describe(m("used", -1)), "1 to the back bar");
  assert.equal(describe(m("finished", -1)), "finished");
  assert.equal(describe(m("finished", -2)), "2 finished");
  assert.equal(describe(m("sold", -1, { unit_price_cents: 2791 })), "1 sold · $27.91");
  assert.equal(describe(m("missing", -1, { note: "Counted" })), "counted, 1 missing");
  assert.equal(describe(m("adjusted", 1, { note: "Counted — more on the shelf than expected" })), "counted, 1 extra");
});

test("a count is a missing row, or an adjustment noted Counted — nothing else", () => {
  assert.equal(isCount({ kind: "missing", note: "Counted" }), true);
  assert.equal(isCount({ kind: "adjusted", note: "Counted — more on the shelf than expected" }), true);
  assert.equal(isCount({ kind: "adjusted", note: "Opened and split into 27 products" }), false);
  assert.equal(isCount({ kind: "used", note: "Counted" }), false);
});

test("shortDate has no timezone drift", () => {
  assert.equal(shortDate("2026-09-07"), "Sep 7");
  assert.equal(shortDate("2026-01-01"), "Jan 1");
});

// ---- Bottle sizes --------------------------------------------------------

test("every size format her products use reads back as number and unit", () => {
  assert.deepEqual(splitSize("10.1 oz"), { amount: "10.1", unit: "fl oz" });
  assert.deepEqual(splitSize("1 litre"), { amount: "1", unit: "L" });
  assert.deepEqual(splitSize("1.1 lb"), { amount: "1.1", unit: "lb" });
  assert.deepEqual(splitSize("68 pc"), { amount: "68", unit: "pieces" });
  assert.deepEqual(splitSize("250 ml"), { amount: "250", unit: "ml" });
});

test("no size gives blanks, never a guess", () => {
  assert.deepEqual(splitSize(null), { amount: "", unit: "fl oz" });
  assert.deepEqual(splitSize(""), { amount: "", unit: "fl oz" });
});
