import type { SupabaseClient } from "@supabase/supabase-js";

// The salon's settings, with the defaults that were the hardcoded values.
//
// Every number here used to be a constant in a file Evelyn couldn't edit. The
// defaults are those exact constants, so a database that hasn't run migration
// 0033 — or a read that fails — behaves precisely as it did before rather than
// inventing a policy. That matters more than it sounds: a settings read that
// falls back to zero would silently switch off quiet hours and start texting
// clients at 4am.

export type SalonSettings = {
  digestEnabled: boolean;
  digestHour: number;
  digestIncludeMoney: boolean;

  bookingAlertEnabled: boolean;
  bookingAlertHours: number;

  smsAutomationEnabled: boolean;
  confirmationsEnabled: boolean;
  remindersEnabled: boolean;
  reminderLookaheadHours: number;
  quietStartHour: number;
  quietEndHour: number;

  cancelNoticeHours: number;
  minBookingNoticeMinutes: number;
  maxBookingDaysAhead: number;

  monthlyTargetCents: number | null;
};

export const SETTINGS_DEFAULTS: SalonSettings = {
  digestEnabled: true,
  digestHour: 7,
  digestIncludeMoney: true,

  bookingAlertEnabled: true,
  bookingAlertHours: 24,

  smsAutomationEnabled: true,
  confirmationsEnabled: true,
  remindersEnabled: true,
  reminderLookaheadHours: 36,
  quietStartHour: 9,
  quietEndHour: 20,

  cancelNoticeHours: 24,
  minBookingNoticeMinutes: 120,
  maxBookingDaysAhead: 84,

  monthlyTargetCents: null,
};

// Column name → field name. Written out rather than derived from a camelCase
// helper so that renaming a column is a compile error here instead of a
// setting that silently reverts to its default.
type Row = Record<string, unknown>;

function num(row: Row, key: string, fallback: number): number {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function bool(row: Row, key: string, fallback: boolean): boolean {
  const v = row[key];
  return typeof v === "boolean" ? v : fallback;
}

export function parseSettings(row: Row | null | undefined): SalonSettings {
  if (!row) return SETTINGS_DEFAULTS;
  const d = SETTINGS_DEFAULTS;
  return {
    digestEnabled: bool(row, "digest_enabled", d.digestEnabled),
    digestHour: num(row, "digest_hour", d.digestHour),
    digestIncludeMoney: bool(row, "digest_include_money", d.digestIncludeMoney),

    bookingAlertEnabled: bool(row, "booking_alert_enabled", d.bookingAlertEnabled),
    bookingAlertHours: num(row, "booking_alert_hours", d.bookingAlertHours),

    smsAutomationEnabled: bool(row, "sms_automation_enabled", d.smsAutomationEnabled),
    confirmationsEnabled: bool(row, "confirmations_enabled", d.confirmationsEnabled),
    remindersEnabled: bool(row, "reminders_enabled", d.remindersEnabled),
    reminderLookaheadHours: num(row, "reminder_lookahead_hours", d.reminderLookaheadHours),
    quietStartHour: num(row, "quiet_start_hour", d.quietStartHour),
    quietEndHour: num(row, "quiet_end_hour", d.quietEndHour),

    cancelNoticeHours: num(row, "cancel_notice_hours", d.cancelNoticeHours),
    minBookingNoticeMinutes: num(row, "min_booking_notice_minutes", d.minBookingNoticeMinutes),
    maxBookingDaysAhead: num(row, "max_booking_days_ahead", d.maxBookingDaysAhead),

    monthlyTargetCents:
      typeof row["monthly_revenue_target_cents"] === "number"
        ? (row["monthly_revenue_target_cents"] as number)
        : null,
  };
}

// `*` rather than a column list, so a deploy that lands before 0033 gets the
// row it can read and the defaults for everything else, instead of a failed
// select that would take the whole caller down with it.
export async function readSettings(
  db: SupabaseClient,
): Promise<SalonSettings> {
  const { data, error } = await db
    .from("salon_settings")
    .select("*")
    .maybeSingle();
  if (error) return SETTINGS_DEFAULTS;
  return parseSettings(data as Row | null);
}
