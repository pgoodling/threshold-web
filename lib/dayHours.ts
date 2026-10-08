import type { SupabaseClient } from "@supabase/supabase-js";

// Hours for one date: that date's own row in day_hours if it has one, else the
// weekly rules. The database's hours_on() is the rule online booking obeys;
// resolveHours is the same rule for screens that already hold the rows (the
// calendar draws a whole week at once), and hoursOn asks the database.

export type Window = { start_time: string; end_time: string };
export type WeeklyRule = Window & { weekday: number };
/** A day_hours row. Both times null = closed that day. */
export type DayOverride = { day: string; start_time: string | null; end_time: string | null };

export const weekdayOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export function resolveHours(
  day: string,
  weekly: WeeklyRule[],
  overrides: DayOverride[],
): { windows: Window[]; changed: boolean } {
  const own = overrides.find((o) => o.day === day);
  if (own)
    return {
      changed: true,
      windows:
        own.start_time && own.end_time
          ? [{ start_time: own.start_time, end_time: own.end_time }]
          : [],
    };
  const wd = weekdayOf(day);
  return {
    changed: false,
    windows: weekly
      .filter((r) => r.weekday === wd)
      .map(({ start_time, end_time }) => ({ start_time, end_time }))
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  };
}

/** "09:00:00" → minutes past midnight. */
export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** "9 AM – 5 PM", "9:30 AM – 7 PM", or "Closed". */
export function hoursLabel(windows: Window[]) {
  if (windows.length === 0) return "Closed";
  const clock = (t: string) => {
    const h = Number(t.slice(0, 2));
    const m = t.slice(3, 5);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${m === "00" ? "" : `:${m}`} ${h < 12 ? "AM" : "PM"}`;
  };
  return windows.map((w) => `${clock(w.start_time)} – ${clock(w.end_time)}`).join(", ");
}

/** Booked times that fall outside a day's windows: they'd be left stranded. */
export function outsideWindows<T extends { startMin: number; endMin: number }>(
  items: T[],
  windows: Window[],
) {
  return items.filter(
    (a) =>
      !windows.some((w) => toMinutes(w.start_time) <= a.startMin && toMinutes(w.end_time) >= a.endMin),
  );
}

// The date's windows from the database. Falls back to the weekly rules alone
// if hours_on doesn't exist yet (0049 not run) -- the deploy and the
// migration move separately, and a missing function shouldn't read as closed.
export async function hoursOn(db: SupabaseClient, day: string): Promise<Window[]> {
  const r = await db.rpc("hours_on", { p_day: day });
  if (!r.error) return ((r.data ?? []) as Window[]).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const w = await db
    .from("availability_rules")
    .select("start_time,end_time")
    .eq("weekday", weekdayOf(day))
    .eq("active", true)
    .order("start_time");
  return (w.data ?? []) as Window[];
}
