import test from "node:test";
import assert from "node:assert/strict";
import { tidyName } from "../../lib/tidyName";

test("all-lowercase and all-caps names are capitalised", () => {
  assert.equal(tidyName("emma jackowski"), "Emma Jackowski");
  assert.equal(tidyName("Marriah hoff"), "Marriah Hoff");
  assert.equal(tidyName("CAYLA MATLOW"), "Cayla Matlow");
  assert.equal(tidyName("  mary-jane  o'neil "), "Mary-Jane O'Neil");
});

test("a name typed with care is left alone", () => {
  for (const n of ["McDonald", "DeLuca", "Sarah McKenzie", "O'Brien", "JJ Abrams"]) assert.equal(tidyName(n), n);
});
