// Hours for one day (lib/dayHours) -- the same rule as the database's
// hours_on(): a date's own row wins, otherwise the week.

import test from "node:test";
import assert from "node:assert/strict";
import { resolveHours, hoursLabel, outsideWindows, weekdayOf } from "../../lib/dayHours";

// The rig's week: Mon/Tue 9-7, Fri 9-6, Sat 9-5.
const WEEK = [
  { weekday: 1, start_time: "09:00:00", end_time: "19:00:00" },
  { weekday: 2, start_time: "09:00:00", end_time: "19:00:00" },
  { weekday: 5, start_time: "09:00:00", end_time: "18:00:00" },
  { weekday: 6, start_time: "09:00:00", end_time: "17:00:00" },
];

test("15 Oct 2026 is a Thursday; 16 Oct a Friday", () => {
  assert.equal(weekdayOf("2026-10-15"), 4);
  assert.equal(weekdayOf("2026-10-16"), 5);
});

test("no row: the week. Friday 9-6, Thursday closed", () => {
  assert.deepEqual(resolveHours("2026-10-16", WEEK, []), {
    changed: false,
    windows: [{ start_time: "09:00:00", end_time: "18:00:00" }],
  });
  assert.deepEqual(resolveHours("2026-10-15", WEEK, []).windows, []);
});

test("a row wins: longer Friday, opened Thursday, closed Saturday", () => {
  const rows = [
    { day: "2026-10-16", start_time: "09:00", end_time: "21:00" },
    { day: "2026-10-15", start_time: "10:00", end_time: "14:00" },
    { day: "2026-10-17", start_time: null, end_time: null },
  ];
  assert.equal(hoursLabel(resolveHours("2026-10-16", WEEK, rows).windows), "9 AM – 9 PM");
  assert.equal(hoursLabel(resolveHours("2026-10-15", WEEK, rows).windows), "10 AM – 2 PM");
  const sat = resolveHours("2026-10-17", WEEK, rows);
  assert.equal(sat.changed, true);
  assert.equal(hoursLabel(sat.windows), "Closed");
  // The following Friday has no row: back to 9-6.
  assert.equal(hoursLabel(resolveHours("2026-10-23", WEEK, rows).windows), "9 AM – 6 PM");
});

test("half hours read as 9:30 AM, noon as 12 PM", () => {
  assert.equal(hoursLabel([{ start_time: "09:30", end_time: "12:00" }]), "9:30 AM – 12 PM");
});

test("who'd be left outside: shortening Friday to 9-3 strands the 4 PM, not the 10 AM", () => {
  // 10:00-11:00 = 600-660; 16:00-17:00 = 960-1020. 9-3 = 540-900.
  const booked = [{ id: "a", startMin: 600, endMin: 660 }, { id: "b", startMin: 960, endMin: 1020 }];
  assert.deepEqual(outsideWindows(booked, [{ start_time: "09:00", end_time: "15:00" }]).map((x) => x.id), ["b"]);
  // A visit that runs past close is outside too: 14:30-15:30 against 9-3.
  assert.equal(outsideWindows([{ startMin: 870, endMin: 930 }], [{ start_time: "09:00", end_time: "15:00" }]).length, 1);
  // Closed strands everyone.
  assert.equal(outsideWindows(booked, []).length, 2);
});
