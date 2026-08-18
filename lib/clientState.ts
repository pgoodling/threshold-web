// How a client is doing, in four states, on one axis: green is fine, amber is
// soon, red needs you.
//
// This replaces the five-stage lifecycle (new / regular / at risk / lapsed /
// won back) and the hair-regrowth visual that expressed it. Two problems with
// the old model: five states is more than anyone tracks at a glance, and two of
// them ("regular", "won back") were facts about the past rather than things to
// act on. What Evelyn actually needs to know is whether a client needs chasing.
//
// The judgement is made against HER OWN rhythm, not a fixed number of weeks. A
// client who comes every four weeks is late at six; one who comes every twelve
// isn't. A single global threshold would paint half the book red and the other
// half green regardless of what's true.

export type ClientState = "new" | "fine" | "due" | "overdue";

// Used when she hasn't enough history to have a rhythm yet. Six weeks is the
// common colour cycle and matches what the old model assumed.
const DEFAULT_GAP_WEEKS = 6;

// --- The two numbers worth arguing about -----------------------------------
//
// Red means "you may have lost her", not "she's a bit late". Getting that wrong
// in the tight direction is worse than in the loose one: a book that's mostly
// red says nothing at all, and Evelyn stops looking at the colour.
//
// So overdue is THREE times her usual gap, capped at six months. A client who
// comes every four weeks isn't lost at six — she's lost at twelve. One who comes
// twice a year is never called lost before the cap.
const OVERDUE_GAP_MULTIPLE = 3;
const OVERDUE_CEILING_WEEKS = 26;

// "Due" starts a little before her usual gap comes round, because that's when a
// nudge still lands as thoughtful rather than desperate.
const DUE_GAP_MULTIPLE = 1.25;

// --- Palette ---------------------------------------------------------------
//
// Muted earth tones drawn to sit with the cream and terracotta rather than the
// signal-green and signal-red of a dashboard. The overdue colour is deliberately
// a wine rather than a true red: the brand accent (#bd6b4d) is already an
// orange-red, and a red rail beside it read as brand furniture rather than a
// warning.
const FINE_HEX = "#647f5a"; // sage
const DUE_HEX = "#bd8f45"; // honey
const OVERDUE_HEX = "#8f3f4a"; // wine

// Her usual gap between visits, in weeks — the median rather than the mean, so
// one holiday or one illness doesn't drag the whole rhythm out.
//
// Takes attended visit times, any order. Fewer than two visits is no rhythm at
// all, and returns null rather than a guess.
export function usualGapWeeks(visitTimes: (string | number | Date)[]): number | null {
  if (visitTimes.length < 2) return null;

  const ms = visitTimes
    .map((t) => new Date(t).getTime())
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (ms.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 1; i < ms.length; i++) {
    gaps.push((ms[i] - ms[i - 1]) / (7 * 24 * 60 * 60 * 1000));
  }
  gaps.sort((a, b) => a - b);

  const mid = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 1 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;

  // A rhythm of "twice in one afternoon" is a data artefact, not a cadence.
  return median >= 0.5 ? median : null;
}

export function clientState(opts: {
  /** Attended past visits — excludes cancelled and no-show. */
  pastCount: number;
  /** Future booked visits — excludes cancelled. */
  upcomingCount: number;
  /** Weeks since the most recent attended visit. */
  weeksSinceLast: number | null;
  /** Her own cadence, from usualGapWeeks(). Null falls back to the default. */
  gapWeeks?: number | null;
}): ClientState {
  const { pastCount, upcomingCount, weeksSinceLast, gapWeeks } = opts;

  // Nobody has been in the chair yet, so there's nothing to judge. Deliberately
  // its own state rather than a colour — she isn't good or bad, she's unknown.
  if (pastCount === 0 || weeksSinceLast == null) return "new";

  // Already booked back in. Whatever the gap has been, it's handled.
  if (upcomingCount > 0) return "fine";

  const { dueAt, overdueAt } = thresholds(gapWeeks);

  if (weeksSinceLast >= overdueAt) return "overdue";
  if (weeksSinceLast >= dueAt) return "due";
  return "fine";
}

// When she tips into each state, given her own rhythm.
export function thresholds(gapWeeks?: number | null): {
  dueAt: number;
  overdueAt: number;
} {
  const gap = gapWeeks && gapWeeks > 0 ? gapWeeks : DEFAULT_GAP_WEEKS;

  // The ceiling drags the red point down for short cadences, which is its job.
  // But a client whose own rhythm is longer than the ceiling would then be
  // called lost while she's exactly on schedule — someone who comes twice a
  // year, marked overdue at six months. The floor keeps her rhythm winning.
  const capped = Math.min(gap * OVERDUE_GAP_MULTIPLE, OVERDUE_CEILING_WEEKS);
  const floor = gap * 1.5;

  return {
    dueAt: gap * DUE_GAP_MULTIPLE,
    overdueAt: Math.max(capped, floor),
  };
}

// The rail colour. `new` is null on purpose — it renders as a hatch, because
// "no history yet" doesn't belong on a good-to-bad scale.
export const STATE_COLOR: Record<ClientState, string | null> = {
  fine: FINE_HEX,
  due: DUE_HEX,
  overdue: OVERDUE_HEX,
  new: null,
};

function mix(from: string, to: string, t: number): string {
  const p = Math.max(0, Math.min(1, t));
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(ch(from, i) + (ch(to, i) - ch(from, i)) * p),
  );
  return `#${out.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

// The rail colour as a slide rather than three steps: sage while she's on
// rhythm, warming through honey as her gap comes round, deepening to wine as
// she drifts past it.
//
// The four states still exist — they carry the words and drive the filters —
// but the colour moves continuously between them, so a client fourteen weeks
// gone doesn't look identical to one who's been gone a year.
export function railColor(
  state: ClientState,
  weeksSinceLast: number | null,
  gapWeeks?: number | null,
): string | null {
  if (state === "new" || weeksSinceLast == null) return null;

  const { dueAt, overdueAt } = thresholds(gapWeeks);

  // Still on rhythm: hold at sage rather than creeping toward honey the moment
  // she leaves the chair.
  if (weeksSinceLast < dueAt) return FINE_HEX;

  if (weeksSinceLast < overdueAt) {
    return mix(FINE_HEX, DUE_HEX, (weeksSinceLast - dueAt) / (overdueAt - dueAt));
  }

  // Past the line, keep deepening for another full gap before bottoming out, so
  // the truly long-lost still separate from the just-overdue.
  const beyond = (weeksSinceLast - overdueAt) / Math.max(overdueAt, 1);
  return mix(DUE_HEX, OVERDUE_HEX, 0.35 + beyond * 0.65);
}

export const STATE_LABEL: Record<ClientState, string> = {
  fine: "Fine",
  due: "Due",
  overdue: "Overdue",
  new: "New",
};

// The line under her name. Says what the rail means in words, so the card reads
// without relying on colour — which matters on a phone in daylight, and for
// anyone who doesn't separate red and green.
export function stateCaption(
  state: ClientState,
  weeksSinceLast: number | null,
  gapWeeks: number | null,
): string {
  if (state === "new") return "first visit — no history yet";

  const since = weeksSinceLast == null ? null : Math.round(weeksSinceLast);
  const rhythm =
    gapWeeks && gapWeeks > 0 ? `usually every ${Math.round(gapWeeks)} weeks` : null;
  const last =
    since == null
      ? null
      : since <= 0
        ? "in this week"
        : `last in ${since} week${since === 1 ? "" : "s"} ago`;

  return [rhythm, last].filter(Boolean).join(" — ") || "no visits recorded";
}
