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
  rowsFor,
  averageRows,
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
  { name: "Framar Embossed Pop Up Foil Medium Diet Coke 5 inch x 11 inch 500 ct.", size: null, unit_cost_cents: 2399 },
  { name: "Framar Embossed Foil Roll Medium Extra Dirty 320 ft.", size: null, unit_cost_cents: 1899 },
  { name: "Gloves", size: "100 pieces", unit_cost_cents: 1595 },
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

test("full highlight: $11.03 measured, foils included", () => {
  // Lightener 60 g × (2300 ÷ 498.95) = 276.6¢
  // Developer 120 ml × (750 ÷ 1000)  =  90.0¢
  // Foils 65 × (2399 ÷ 500)          = 311.9¢  (the pop-ups; the roll isn't counted)
  // Gloss 30 ml × (730 ÷ 59.147)     = 370.3¢
  // Activator 60 ml × (900 ÷ 1000)   =  54.0¢
  //                                   = 1,102.7¢
  const m = measured("Custom Full Highlight", INV);
  const by = Object.fromEntries(m.lines.map((l) => [l.label, l.cents]));
  near(by.Lightener, 276.6);
  near(by.Developer, 90);
  near(by.Foils, 311.9);
  near(by.Toner, 370.3);
  near(by["Toner activator"], 54);
  near(m.lines.reduce((t, l) => t + l.cents, 0), 1102.7);
  assert.deepEqual(m.waiting, []);
});

test("a box of foils counts sheets", () => {
  assert.deepEqual(contents(INV[10]), { amount: 500, unit: "foils" });
  assert.ok(isChemical(INV[11].name), "the roll stays out of the learned pool too");
});

test("partial is half the lightening and foils, the same toner: $7.63", () => {
  // 138.3 + 45.0 + 32.5 foils × 4.798 (155.9) + 370.3 + 54.0 = 763.5¢
  near(measured("Custom Cut & Partial Highlight", INV).lines.reduce((t, l) => t + l.cents, 0), 763.5);
});

test("all-over colour $9.21 with gloves and a cap; root $4.72 with gloves; toner only 'if toned'", () => {
  // Tinta 50 ml × (935 ÷ 59.147) = 790.4¢; developer 75 ml × 1.19 = 89.25¢ → 879.6¢
  // Gloves: a pair = 2 × (1595 ÷ 100) = 31.9¢. Cap: 939 ÷ 100 = 9.39¢ (Paul's price).
  // All-over 879.6 + 31.9 + 9.39 = 920.9¢. Root 439.8 + 31.9 = 471.7¢ (no cap).
  const all = measured("Signature Color", INV);
  near(all.lines.reduce((t, l) => t + l.cents, 0), 920.9);
  near(measured("Root Retouch", INV).lines.reduce((t, l) => t + l.cents, 0), 471.7);
  assert.ok(!measured("Root Retouch", INV).lines.some((l) => l.label === "Plastic cap"));
  assert.match(all.lines.find((l) => l.label === "Plastic cap")!.working, /not in inventory yet/);
  // 370.3 + 54.0
  near(all.maybe.reduce((t, l) => t + l.cents, 0), 424.3);
});

test("extensions: about 10.5¢ a row; rows are paid ÷ $115", () => {
  // String 2.8 m × (899 ÷ 1,700) = 1.48¢; beads 15 × (1,499 ÷ 2,500) = 8.99¢ → 10.47¢
  const m = measured("Hand-tied Extension Application", INV);
  assert.equal(m.lines.length, 0);
  near(m.perRow.reduce((t, l) => t + l.cents, 0), 10.47, 0.05);
  assert.deepEqual(m.waiting, []);
  // $115 = 1 row, $230 = 2, $345 = 3; a $100 visit still had a row.
  assert.deepEqual([11500, 23000, 34500, 10000].map(rowsFor), [1, 2, 3, 1]);
  // Visits of $115 and $345 average 2 rows.
  assert.equal(averageRows([11500, 34500]), 2);
});

test("gloves, caps, beads and string stay out of the learned pool", () => {
  for (const n of ["Gloves", "Plastic Processing Caps 100 ct.", "Extension Beads", "Extension String"])
    assert.ok(!inWashPool(n), n);
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
