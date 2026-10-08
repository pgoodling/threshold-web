// Product cost per visit (lib/productCost). Every expected figure is worked by
// hand from her real inventory prices, in the comment above it.

import test from "node:test";
import assert from "node:assert/strict";
import {
  contents,
  measured,
  finishedBottles,
  pool,
  isChemical,
  inWashPool,
  usesWash,
  usesMask,
  INGREDIENTS,
  type InvProduct,
  type Movement,
} from "../../lib/productCost";

// Her inventory, as it is on 2026-10-08 (the parts that matter).
const INV: InvProduct[] = [
  { name: "Blonde IQ 7 Calibrated Powder Lightener", size: "1.1 lb", unit_cost_cents: 2300 },
  { name: "Pro-Oxide Oil Developer 20 Volume", size: "1 litre", unit_cost_cents: 750 },
  { name: "GLOSS COLLECTION 10.3G 2 Fl. Oz.", size: null, unit_cost_cents: 730 },
  { name: "GLOSS COLLECTION 7.1A 2 Fl. Oz.", size: null, unit_cost_cents: 730 },
  { name: "GLOSS COLLECTION CLEAR BOOSTER 2 Fl. Oz.", size: null, unit_cost_cents: 700 },
  { name: "GLOSS COLLECTION LIQUID ACTIVATOR Liter", size: null, unit_cost_cents: 900 },
  { name: "Tinta 6- Dark Blonde 2 Fl. Oz.", size: null, unit_cost_cents: 935 },
  { name: "Tinta 8.4- Light Copper Blonde 2 Fl. Oz.", size: null, unit_cost_cents: 935 },
  { name: "Tinta Developer 3% 10 Vol. Liter", size: null, unit_cost_cents: 1190 },
  { name: "Tinta Tinta, So Pure, & 1922 by J.M. Keune Developer 6% 20 Vol. Liter", size: null, unit_cost_cents: 1190 },
];

const near = (a: number, b: number, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test("bottle contents: lb to g, fl oz to ml, Liter alone, and a shade isn't grams", () => {
  // 1.1 × 453.592 = 498.95 g
  near(contents(INV[0])!.amount, 498.95, 0.01);
  assert.equal(contents(INV[0])!.unit, "g");
  assert.equal(contents(INV[1])!.amount, 1000);
  // 2 × 29.5735 = 59.147 ml -- and "10.3G" is a gloss shade, not 10.3 g.
  near(contents(INV[2])!.amount, 59.147, 0.001);
  assert.equal(contents(INV[2])!.unit, "ml");
  assert.equal(contents({ name: "Vital Nutrition Nourishing Shampoo Liter", size: null })!.amount, 1000);
});

test("colour and colour developer don't swallow each other", () => {
  assert.ok(INGREDIENTS.colourDev.match.test(INV[9].name));
  assert.ok(!INGREDIENTS.colour.match.test(INV[9].name));
  assert.ok(INGREDIENTS.colour.match.test("Tinta Clear 2 Fl. Oz."));
  assert.ok(!INGREDIENTS.gloss.match.test("GLOSS COLLECTION CLEAR BOOSTER 2 Fl. Oz."));
});

test("full highlight: $7.91 measured", () => {
  // Lightener 60 g × (2300 ÷ 498.95) = 276.6¢
  // Developer 120 ml × (750 ÷ 1000)  =  90.0¢
  // Gloss 30 ml × (730 ÷ 59.147)     = 370.3¢
  // Activator 60 ml × (900 ÷ 1000)   =  54.0¢
  //                                   = 790.9¢
  const m = measured("Custom Full Highlight", INV);
  const cents = m.lines.map((l) => l.cents);
  near(cents[0], 276.6);
  near(cents[1], 90);
  near(cents[2], 370.3);
  near(cents[3], 54);
  near(cents.reduce((a, b) => a + b), 790.9);
  assert.deepEqual(m.waiting, ["Foils"]);
});

test("partial is half the lightening with the same toner: $6.08", () => {
  // 138.3 + 45.0 + 370.3 + 54.0 = 607.6¢
  near(measured("Custom Cut & Partial Highlight", INV).lines.reduce((t, l) => t + l.cents, 0), 607.6);
});

test("all-over colour $8.80, root half; toner only 'if toned'", () => {
  // Tinta 50 ml × (935 ÷ 59.147) = 790.4¢; developer 75 ml × 1.19 = 89.25¢ → 879.6¢
  const all = measured("Signature Color", INV);
  near(all.lines.reduce((t, l) => t + l.cents, 0), 879.6);
  near(measured("Root Retouch", INV).lines.reduce((t, l) => t + l.cents, 0), 439.8);
  // 370.3 + 54.0
  near(all.maybe.reduce((t, l) => t + l.cents, 0), 424.3);
});

test("a cut has no measured product; a consultation uses nothing", () => {
  assert.equal(measured("Cut & Style", INV).lines.length, 0);
  assert.ok(usesWash("Cut & Style"));
  assert.ok(!usesWash("Signature Consultation"));
  assert.ok(usesMask("Customized Treatment w/ Blowout"));
  assert.ok(!usesMask("Keratin Treatment"));
});

test("chemicals stay out of the learned pool; masks have their own", () => {
  for (const n of ["Blonde IQ 7 Calibrated Powder Lightener", "GLOSS COLLECTION 7.1A 2 Fl. Oz.", "Tinta 6- Dark Blonde 2 Fl. Oz.", "Pro-Oxide Oil Developer 20 Volume"])
    assert.ok(isChemical(n) && !inWashPool(n), n);
  assert.ok(!inWashPool("Vital Nutrition Nourishing Mask 8.5 oz."));
  assert.ok(inWashPool("Absolute Volume Amplifying Shampoo 10.1 Fl. Oz."));
});

const mv = (product_name: string, kind: string, quantity: number, occurred_on: string, unit_cost_cents: number | null = 1500): Movement => ({
  product_name, kind, quantity, occurred_on, unit_cost_cents, created_at: `${occurred_on}T12:00:00Z`,
});

test("bottles pair first-in first-out; −2 on the bar is two bottles", () => {
  const moves = [
    mv("Hair Gloss", "used", -1, "2026-09-25"),
    mv("Hair Gloss", "used", -2, "2026-09-29"),
    mv("Hair Gloss", "finished", -1, "2026-09-30", null),
    mv("Hair Gloss", "finished", -1, "2026-09-30", null),
  ];
  const { done, stillOpen } = finishedBottles(moves, () => true);
  // Finished: the 25th's bottle and the first of the 29th's. One still open.
  assert.deepEqual(done.map((b) => b.opened), ["2026-09-25", "2026-09-29"]);
  assert.equal(stillOpen, 1);
});

test("pool: $30 of finished bottles over the 3 visits inside their window = $10 a visit", () => {
  const moves = [
    mv("Shampoo", "used", -1, "2026-09-25"),
    mv("Shampoo", "finished", -1, "2026-09-30", null),
    mv("Conditioner", "used", -1, "2026-09-25"),
    mv("Conditioner", "finished", -1, "2026-09-30", null),
    mv("Serum", "used", -1, "2026-09-25"), // still open: not counted
  ];
  // 24 Sep and 1 Oct fall outside 25–30 Sep.
  const p = pool(moves, () => true, ["2026-09-24", "2026-09-25", "2026-09-27", "2026-09-30", "2026-10-01"], "2026-09-01");
  assert.equal(p.costCents, 3000);
  assert.equal(p.visits, 3);
  assert.equal(p.perVisit, 1000);
  assert.equal(p.stillOpen, 1);
});

test("bottles from the back bar's setup (before 1 Oct) aren't counted", () => {
  const moves = [mv("Shampoo", "used", -1, "2026-09-25"), mv("Shampoo", "finished", -1, "2026-09-30", null)];
  assert.equal(pool(moves, () => true, ["2026-09-26"]).perVisit, null);
  const later = [mv("Shampoo", "used", -1, "2026-10-02"), mv("Shampoo", "finished", -1, "2026-10-20", null)];
  // $15 over the 2 visits from 2 to 20 Oct.
  assert.equal(pool(later, () => true, ["2026-10-01", "2026-10-02", "2026-10-20"]).perVisit, 750);
});

test("pool says nothing until a bottle is finished", () => {
  assert.equal(pool([mv("Shampoo", "used", -1, "2026-09-25")], () => true, ["2026-09-25"]).perVisit, null);
});
