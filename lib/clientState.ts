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

// However patient her cycle, someone unseen for a quarter is a worry.
const OVERDUE_CEILING_WEEKS = 12;

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

  const gap = gapWeeks && gapWeeks > 0 ? gapWeeks : DEFAULT_GAP_WEEKS;
  const overdueAt = Math.min(gap * 1.5, OVERDUE_CEILING_WEEKS);

  if (weeksSinceLast >= overdueAt) return "overdue";
  if (weeksSinceLast >= gap) return "due";
  return "fine";
}

// The rail colour. `new` is null on purpose — it renders as a hatch, because
// "no history yet" doesn't belong on a good-to-bad scale.
export const STATE_COLOR: Record<ClientState, string | null> = {
  fine: "#1e7a46",
  due: "#b07d18",
  overdue: "#a32d2d",
  new: null,
};

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
