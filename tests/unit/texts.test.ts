// The texts clients get: what they say, and what they cost to send.
//
// A single em dash once made the day-before reminder cost 5 segments instead
// of 2 (30 Sep 2026). These hold every automated text to the cheap alphabet,
// so that can't creep back with a wording change.

import test from "node:test";
import assert from "node:assert/strict";
import {
  reminderText,
  bookingConfirmText,
  confirmedText,
  reviewRequestText,
  ownerNewBookingText,
  welcomeConfirmText,
} from "../../lib/smsTemplates";
import { plainText } from "../../lib/sms";
import { countSegments } from "../../lib/smsSegments";

const ID = "123e4567-e89b-12d3-a456-426614174000";
const AT = "2026-10-03T18:00:00Z"; // Sat 3 Oct, 2:00 PM in Kettering

const automated = {
  "booking confirmation": bookingConfirmText({ clientName: "Sarah Jenkins", service: "Cut & Style", startsAt: AT, appointmentId: ID }),
  "day-before reminder": reminderText({ clientName: "Sarah Jenkins", service: "Cut & Style", startsAt: AT, appointmentId: ID }),
  "reply-C acknowledgement": confirmedText({ startsAt: AT }),
  "review request": reviewRequestText("Sarah Jenkins"),
  "booking alert to Evelyn": ownerNewBookingText({ clientName: "Sarah Jenkins", serviceName: "Cut & Style", startsAt: AT, isNewClient: false }),
};

for (const [name, text] of Object.entries(automated)) {
  test(`${name} stays in the cheap alphabet`, () => {
    const c = countSegments(plainText(text));
    assert.equal(c.encoding, "GSM-7", `forced to UCS-2 by ${c.culprits.join(", ")}`);
  });
}

test("the day-before reminder is 2 segments, not the 5 it was", () => {
  assert.equal(countSegments(plainText(automated["day-before reminder"])).segments, 2);
});

test("the booking confirmation is 2 segments", () => {
  assert.equal(countSegments(plainText(automated["booking confirmation"])).segments, 2);
});

test("the short ones fit in a single segment", () => {
  assert.equal(countSegments(plainText(automated["reply-C acknowledgement"])).segments, 1);
  assert.equal(countSegments(plainText(automated["booking alert to Evelyn"])).segments, 1);
});

// Loft 24 was added 30 Sep 2026: Salon Lofts is a building of suites, and the
// street address alone gets a new client to the car park and no further.
for (const name of ["booking confirmation", "day-before reminder"] as const) {
  test(`${name} says Loft 24 and the street`, () => {
    assert.match(automated[name], /Loft 24 at Salon Lofts, 424 E\. Stroop Rd\./);
  });
}

test("the hand-sent welcome text says Loft 24 too", () => {
  const t = welcomeConfirmText({ clientName: "Sarah Jenkins", service: "Cut & Style", startsAt: AT, appointmentId: ID });
  assert.match(t, /Loft 24 at Salon Lofts/);
});

test("every client-facing automated text carries the opt-out line", () => {
  for (const name of ["booking confirmation", "day-before reminder", "reply-C acknowledgement", "review request"] as const) {
    assert.match(automated[name], /Reply STOP to opt out/, name);
  }
});

test("the reminder names the day, not just the time", () => {
  assert.match(automated["day-before reminder"], /Saturday 2:00\sPM/);
});

// plainText: what an iPhone keyboard and Intl put in, swapped for plain.
test("plainText swaps dashes, curly quotes, ellipses and odd spaces", () => {
  assert.equal(plainText("Can’t make 2:00 PM — “sorry”…"), `Can't make 2:00 PM - "sorry"...`);
  assert.equal(plainText("a b–c"), "a b-c");
});

test("plainText leaves emoji alone (they can't be rescued)", () => {
  assert.equal(plainText("See you 👍"), "See you 👍");
  assert.equal(countSegments("See you 👍").encoding, "UCS-2");
});

// countSegments against the published limits.
test("160 plain characters is one segment; 161 is two", () => {
  assert.equal(countSegments("a".repeat(160)).segments, 1);
  assert.equal(countSegments("a".repeat(161)).segments, 2);
  assert.equal(countSegments("a".repeat(306)).segments, 2); // 2 × 153
  assert.equal(countSegments("a".repeat(307)).segments, 3);
});

test("one em dash makes the whole message UCS-2: 70, then 67 a segment", () => {
  assert.equal(countSegments("—" + "a".repeat(69)).segments, 1);
  assert.equal(countSegments("—" + "a".repeat(70)).segments, 2);
  assert.deepEqual(countSegments("—").culprits, ["U+2014"]);
});

test("extension characters like € count double", () => {
  assert.equal(countSegments("€").length, 2);
});
