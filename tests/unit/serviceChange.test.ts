// Changing an appointment's service (lib/serviceChange): the preview she sees
// before saving. The database derives the same end (appointments_set_span).

import test from "node:test";
import assert from "node:assert/strict";
import { newEnd, lengthLabel, timingLabel } from "../../lib/serviceChange";

const colour = { duration_minutes: 180, start_minutes: 60, process_minutes: 45, finish_minutes: 75 };
const cut = { duration_minutes: 60, start_minutes: 60, process_minutes: 0, finish_minutes: 0 };

test("a 10 AM cut changed to a colour ends at 1 PM", () => {
  // 10:00 EDT = 14:00Z; + 180 min = 17:00Z = 1 PM.
  assert.equal(newEnd("2026-10-15T14:00:00.000Z", colour), "2026-10-15T17:00:00.000Z");
});

test("lengths read the way she'd say them", () => {
  assert.equal(lengthLabel(15), "15 min");
  assert.equal(lengthLabel(60), "1 hr");
  assert.equal(lengthLabel(90), "1 hr 30");
  assert.equal(lengthLabel(180), "3 hr");
});

test("timing shows the three parts only when there's processing", () => {
  assert.equal(timingLabel(colour), "60 · 45 · 75");
  assert.equal(timingLabel(cut), "1 hr");
});
