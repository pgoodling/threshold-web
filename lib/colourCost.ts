// What a colour actually costs her in product.
//
// Not measured — estimated, on purpose, and the screens must say so.
//
// THE METHOD
//
// She buys colour in lumps and uses it continuously. So the unit of analysis
// is the CONSUMPTION WINDOW: a purchase, and everything that happened between
// it and the next purchase. That stock is assumed to have covered exactly the
// appointments in that window.
//
// The signal costs her nothing. The next purchase is the end of the previous
// window, and the bank feed already knows when she buys. Any design that asks
// her to record "I've run out" is a design that stops being true in week three.
//
// WHY NOT CALENDAR MONTHS
//
// Buying is lumpy and using is smooth. A $340 order on 2 March makes March
// look ruinous and April look free, when in truth one paid for the other.
// Depletion windows put the cost where the work was.
//
// WHY WEIGHT BY DURATION
//
// Dividing a window's spend equally across its appointments makes a root
// touch-up look as expensive as a full head of foils. Length is a free and
// roughly honest proxy for how much product went on a head — a three-hour
// highlight really does use more than a one-hour gloss — and every appointment
// already carries its start and end.
//
// It is a proxy, not a measurement. A long cut-and-style uses almost no
// colour, which is why only colour services are counted in the first place.
//
// ACCURACY
//
// Low, and deliberately so. The question is "am I charging enough for a
// colour", and a ±20% answer decides that as well as an exact one would. The
// output is rounded and the UI says "about". Anything that reads as precise
// here is lying.

export type Purchase = {
  /** ISO date. */
  postedOn: string;
  /** Positive cents. Callers pass the absolute value of a spend. */
  amountCents: number;
  merchant: string | null;
  /**
   * True when this was stocking up rather than replenishing — an opening
   * order, or a bulk buy. Excluded from the average entirely: her first order
   * was $2,043.38 for a brand-new salon, and averaging that in would price her
   * first colour at eighty dollars.
   */
  isStockUp?: boolean;
};

export type ColourAppointment = {
  id: string;
  /** ISO timestamp. */
  startsAt: string;
  /** Minutes. Used as the weight. */
  minutes: number;
};

export type Window = {
  from: string;
  /** Null for the open window — the current stock, not yet used up. */
  to: string | null;
  spentCents: number;
  appointments: number;
  totalMinutes: number;
  /** Null when the window has no colour appointments to carry the cost. */
  perAppointmentCents: number | null;
  perMinuteCents: number | null;
  /** True while this window is still running; its average is provisional. */
  open: boolean;
};

export type ColourCostEstimate = {
  windows: Window[];
  /**
   * The headline. Weighted across every CLOSED window — an open one is still
   * being consumed, so its apparent cost per appointment starts absurdly high
   * and falls all month.
   */
  averagePerAppointmentCents: number | null;
  averagePerMinuteCents: number | null;
  closedWindows: number;
  totalAppointments: number;
  /** Everything the caller needs to decide whether to trust the number. */
  confidence: "none" | "weak" | "fair";
  caveat: string;
};

const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * Does this service put colour on a head?
 *
 * Matched on the service name, the same loose way `serviceColors` in
 * lib/format does, so a service renamed in the Services tab keeps working
 * without a migration. Cuts, blowouts and treatments are excluded — they
 * consume almost no colour, and counting them would drag the average down
 * while making a long cut look expensive.
 */
export function isColourService(name: string | undefined | null): boolean {
  const n = (name ?? "").toLowerCase();
  if (n.includes("cut") && !n.includes("color") && !n.includes("colour")) return false;
  return (
    n.includes("highlight") ||
    n.includes("color") ||
    n.includes("colour") ||
    n.includes("balayage") ||
    n.includes("gloss") ||
    n.includes("toner") ||
    n.includes("bleach") ||
    n.includes("foil")
  );
}

/**
 * Build consumption windows from purchases, and spread each window's spend
 * across the colour appointments inside it, weighted by length.
 */
export function estimateColourCost(
  purchases: Purchase[],
  appointments: ColourAppointment[],
): ColourCostEstimate {
  const real = purchases
    .filter((p) => !p.isStockUp && p.amountCents > 0)
    .sort((a, b) => a.postedOn.localeCompare(b.postedOn));

  if (real.length === 0) {
    return {
      windows: [],
      averagePerAppointmentCents: null,
      averagePerMinuteCents: null,
      closedWindows: 0,
      totalAppointments: 0,
      confidence: "none",
      caveat: "No colour purchases yet, so there is nothing to divide.",
    };
  }

  const appts = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const windows: Window[] = real.map((p, i) => {
    const from = dayOf(p.postedOn);
    const next = real[i + 1];
    const to = next ? dayOf(next.postedOn) : null;

    // Half-open: [from, to). An appointment on the day of the next order is
    // counted against the new stock, not the old — she ordered because the old
    // ran out, so whatever she did that day was likely on the new tube.
    const inside = appts.filter((a) => {
      const d = dayOf(a.startsAt);
      return d >= from && (to === null || d < to);
    });

    const totalMinutes = inside.reduce((t, a) => t + Math.max(a.minutes, 0), 0);

    return {
      from,
      to,
      spentCents: p.amountCents,
      appointments: inside.length,
      totalMinutes,
      perAppointmentCents:
        inside.length > 0 ? Math.round(p.amountCents / inside.length) : null,
      perMinuteCents: totalMinutes > 0 ? p.amountCents / totalMinutes : null,
      open: to === null,
    };
  });

  // Only closed windows can say anything. An open one is still being used, so
  // its cost per appointment starts at the whole order price and falls all
  // month — quoting it would be worse than quoting nothing.
  const closed = windows.filter((w) => !w.open && w.appointments > 0);

  if (closed.length === 0) {
    return {
      windows,
      averagePerAppointmentCents: null,
      averagePerMinuteCents: null,
      closedWindows: 0,
      totalAppointments: 0,
      confidence: "none",
      caveat:
        "Only one colour order so far, and that stock is still being used. " +
        "The next order is what makes an estimate possible.",
    };
  }

  const spent = closed.reduce((t, w) => t + w.spentCents, 0);
  const count = closed.reduce((t, w) => t + w.appointments, 0);
  const minutes = closed.reduce((t, w) => t + w.totalMinutes, 0);

  // Confidence is about how much evidence there is, and nothing else. Two
  // windows is a coincidence; four starts to be a pattern.
  const confidence: ColourCostEstimate["confidence"] =
    closed.length >= 4 && count >= 20 ? "fair" : "weak";

  return {
    windows,
    averagePerAppointmentCents: Math.round(spent / count),
    averagePerMinuteCents: minutes > 0 ? spent / minutes : null,
    closedWindows: closed.length,
    totalAppointments: count,
    confidence,
    caveat:
      confidence === "fair"
        ? `Averaged over ${closed.length} restock cycles and ${count} colour appointments.`
        : `Only ${closed.length} restock cycle${closed.length === 1 ? "" : "s"} so far — ` +
          "treat this as a first impression rather than a number to price from.",
  };
}

/**
 * What one appointment's share of its window costs, weighted by length.
 *
 * Falls back to the flat per-appointment figure when a window has no usable
 * durations, which is better than returning nothing for an appointment whose
 * end time was never set.
 */
export function shareForAppointment(
  window: Window,
  minutes: number,
): number | null {
  if (window.perMinuteCents !== null && minutes > 0) {
    return Math.round(window.perMinuteCents * minutes);
  }
  return window.perAppointmentCents;
}
