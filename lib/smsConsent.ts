// The SMS consent disclosure shown at booking, in one place.
//
// A2P 10DLC campaign vetting asks how end users consent to receive messages,
// and carriers expect the disclosure to name the business, say what will be
// sent, state that rates may apply, and give the opt-out keyword. Keeping the
// wording here means the campaign submission and the booking page can never
// quote different text, and git history dates any change to it — that dated
// history is the audit trail for what a client agreed to, since
// `clients.sms_consent_at` records only when they agreed.
//
// If this wording changes, update the campaign submission in the Twilio console
// to match.

export const SMS_CONSENT_HEADING = "Text me about my appointment";

export const SMS_CONSENT_TEXT =
  "Threshold Salon will text booking confirmations, appointment reminders, " +
  "and replies from Evelyn to this number. Message frequency varies. " +
  "Message and data rates may apply. Reply STOP to opt out or HELP for help. " +
  "Consent isn't required to book.";
