// When the salon opens.
//
// Lived in OpeningCountdown until the welcome text needed it too. A message
// that says "we open Monday" has to stop saying that on Tuesday, and the only
// way to be sure it does is for both places to read the same constant.

export const OPENING = new Date("2026-09-07T09:00:00-04:00");

/** True while opening day is still ahead of us. */
export function beforeOpening(now: Date = new Date()): boolean {
  return now.getTime() < OPENING.getTime();
}
