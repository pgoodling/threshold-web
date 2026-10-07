// The calendar's day arithmetic: where a service fits, and side-by-side lanes.

import test from "node:test";
import assert from "node:assert/strict";
import { freeGaps, layoutLanes, salonMinutes } from "../../lib/dayLayout";

const H = (h: number, m = 0) => h * 60 + m;

// The rebook mock's day: open 9–5; Lisa 9–11; lunch blocked 12–1; Mike 1–2.
const hours = [{ start: H(9), end: H(17) }];
const taken = [
  { from: H(9), to: H(11) },
  { from: H(12), to: H(13) },
  { from: H(13), to: H(14) },
];

test("an hour-long service fits at 11 and from 2 to 5", () => {
  assert.deepEqual(freeGaps(hours, taken, 60), [
    { from: H(11), to: H(12) },
    { from: H(14), to: H(17) },
  ]);
});

test("a 90-minute service only fits after 2", () => {
  assert.deepEqual(freeGaps(hours, taken, 90), [{ from: H(14), to: H(17) }]);
});

test("a processing gap is free when it's long enough", () => {
  // A colour client 10–1 whose busy blocks are 10–11 and 11:45–1: the 45 minutes
  // between them take a 45-minute cut.
  const busy = [
    { from: H(10), to: H(11) },
    { from: H(11, 45), to: H(13) },
  ];
  const gaps = freeGaps([{ start: H(10), end: H(13) }], busy, 45);
  assert.deepEqual(gaps, [{ from: H(11), to: H(11, 45) }]);
});

test("time off that runs past closing doesn't open a gap after it", () => {
  assert.deepEqual(freeGaps(hours, [{ from: H(15), to: H(20) }], 30), [{ from: H(9), to: H(15) }]);
});

test("a closed day has no gaps", () => {
  assert.deepEqual(freeGaps([], [], 30), []);
});

test("split hours are searched separately, and a gap can't span the break", () => {
  const split = [{ start: H(9), end: H(12) }, { start: H(14), end: H(18) }];
  // 11–12 is an hour: it fits 60 minutes but not 90, and 12–2 is closed.
  assert.deepEqual(freeGaps(split, [{ from: H(9), to: H(11) }], 60), [
    { from: H(11), to: H(12) },
    { from: H(14), to: H(18) },
  ]);
  assert.deepEqual(freeGaps(split, [{ from: H(9), to: H(11) }], 90), [{ from: H(14), to: H(18) }]);
});

// ---- Lanes ---------------------------------------------------------------

const at = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00-04:00`).toISOString();

test("salon minutes are read in Kettering time, not the computer's", () => {
  assert.equal(salonMinutes(at("14:30")), H(14, 30));
});

test("two overlapping visits sit side by side; the next one gets the full width", () => {
  const placed = layoutLanes([
    { id: "lisa", starts_at: at("14:30"), ends_at: at("15:15") },
    { id: "emma", starts_at: at("14:45"), ends_at: at("15:00") },
    { id: "jo", starts_at: at("16:00"), ends_at: at("16:45") },
  ]);
  const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
  assert.equal(by.lisa.laneCount, 2);
  assert.equal(by.emma.laneCount, 2);
  assert.notEqual(by.lisa.lane, by.emma.lane);
  assert.equal(by.jo.laneCount, 1);
});

test("back-to-back visits don't count as overlapping", () => {
  const placed = layoutLanes([
    { id: "a", starts_at: at("10:00"), ends_at: at("11:00") },
    { id: "b", starts_at: at("11:00"), ends_at: at("12:00") },
  ]);
  assert.ok(placed.every((p) => p.laneCount === 1));
});
