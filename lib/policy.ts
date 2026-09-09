// The salon's booking policy, in one place.
//
// This number appears in the cancellation copy at booking, in the confirmation,
// on the appointment page, and in the route that enforces it. Four copies of
// "24" is three chances for the policy she tells clients to disagree with the
// policy the software applies — and the one that would be wrong is whichever
// nobody remembered to change.

/** Free cancellation up to this many hours before the appointment. */
export const CANCEL_NOTICE_HOURS = 24;

/** Absolute, because a text has no origin to resolve a relative link against. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://threshold.salon"
).replace(/\/$/, "");

/**
 * The Google review link, from the Business Profile's own "ask for reviews"
 * short URL. It opens the review box directly rather than the listing, which is
 * the difference between a review and a good intention.
 */
export const GOOGLE_REVIEW_URL = "https://g.page/r/Cb3Vr4qTlT9JEBM/review";

/**
 * The one link a client gets for an appointment: what and when, the hair-notes
 * form if they haven't filled it in, and a way to cancel.
 *
 * One URL rather than several, because each of these goes out in a text and a
 * 36-character appointment id already costs a segment on its own.
 */
export const appointmentUrl = (appointmentId: string) =>
  `${SITE_URL}/appointment/${appointmentId}`;
