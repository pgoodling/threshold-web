import { dailyLine } from "../../lib/dailyLine";

// The line under the greeting on the studio home screen.
//
// It used to live inside the opening countdown's compact band, which meant that
// removing the countdown would have taken the line with it — and the line is
// the part she actually reads. So it's its own thing now, and it outlives the
// event that introduced it.
//
// The day is passed in rather than read here. Overview already knows what day
// it is in the salon's timezone, and a second component reading the clock
// during render would be a second chance to disagree with the first about what
// "today" means — around midnight, on the machine of someone in another
// timezone, that's how the schedule and the line end up on different days.
export default function DailyLine({ dayKey }: { dayKey: string }) {
  return (
    <p
      className="mt-4 border-l-2 border-accent/40 py-0.5 pl-4 font-display text-base italic leading-snug text-foreground/75"
      // Not a heading and not a status. It's an aside, and screen readers
      // should treat it as one rather than announcing it before the schedule.
      role="note"
    >
      {dailyLine(dayKey)}
    </p>
  );
}
