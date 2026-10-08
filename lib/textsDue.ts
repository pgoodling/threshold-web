// Which upcoming appointments still need a confirmation or a reminder sent by
// hand. One rule, read by the To send page and by the count beside it in the
// menu, so the number in the menu is always the number on the page.

// How far ahead the reminder list looks. A day and a bit, so an appointment at
// 9am tomorrow is already on the list when she checks at teatime today.
export const REMIND_AHEAD_HOURS = 30;

// Don't offer to confirm anything before this date.
//
// Evelyn hand-texted every September client from her own phone while the
// carrier registration was stuck. Some of those she marked here, some she
// didn't — "I sent them all" is a claim about the world, not a fact in the
// database, and the difference between the two is a client getting the same
// confirmation twice.
//
// So the list starts in October and she can wind it back if she wants to. The
// floor is the safe default; the control is there because she knows things the
// database doesn't.
export const DEFAULT_CONFIRM_FROM = "2026-10-01";

export type DueRow = {
  starts_at: string;
  confirm_sms_sent_at: string | null;
  reminder_sms_sent_at: string | null;
  clients: { phone: string | null } | null;
};

export function textsDue<R extends DueRow>(
  rows: R[],
  nowMs: number,
  confirmFrom: string = DEFAULT_CONFIRM_FROM,
) {
  const cutoff = nowMs + REMIND_AHEAD_HOURS * 3600 * 1000;
  const floor = new Date(`${confirmFrom}T00:00:00-04:00`).getTime();
  return {
    toConfirm: rows.filter(
      (r) =>
        !r.confirm_sms_sent_at &&
        r.clients?.phone &&
        new Date(r.starts_at).getTime() >= floor,
    ),
    toRemind: rows.filter(
      (r) =>
        !r.reminder_sms_sent_at &&
        r.clients?.phone &&
        new Date(r.starts_at).getTime() <= cutoff,
    ),
  };
}
