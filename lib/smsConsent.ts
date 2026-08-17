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

// Appointment texts are a checkbox again, and this is why.
//
// The LAW doesn't require it: under the TCPA, giving a business your mobile
// number to book is prior express consent for messages about that booking, and
// written consent is only needed for marketing. We briefly moved to notice at
// the point of collection on that basis.
//
// But A2P campaign vetting isn't applying the legal minimum, it's applying CTIA
// best practice, and Twilio's web-form requirements are explicit: "Checkbox for
// consent (must NOT be pre-selected)" and "must be actively selected by the
// user, not pre-checked." A form without one gets the campaign rejected, and
// each rejection is another 10–15 day cycle.
//
// So the box is back. It carries every element their checklist asks for:
// what you'll receive, frequency, rates, HELP, STOP, and that it isn't a
// condition of booking. The form links to the terms next to it.
export const SMS_CONSENT_HEADING = "Text me about my appointment";

export const SMS_CONSENT_TEXT =
  "Threshold Salon will text booking confirmations, appointment reminders, " +
  "and replies from Evelyn to this number. Message frequency varies. " +
  "Message and data rates may apply. Reply STOP to opt out or HELP for help. " +
  "Consent isn't required to book.";

// Marketing is a SEPARATE opt-in, and deliberately so. Promotional texts need
// prior express written consent under the TCPA — a higher bar than the
// transactional consent above, and it does not carry over. Someone who agreed
// to appointment reminders has not agreed to offers, so bundling the two into
// one checkbox would make both unsafe to rely on.
//
// "Consent is not a condition of any purchase" is not filler: it's part of what
// makes written consent valid for marketing.
export const SMS_MARKETING_HEADING = "Send me offers and news";

export const SMS_MARKETING_TEXT =
  "Threshold Salon may text promotions, special offers, and salon news to this " +
  "number. Message frequency varies. Message and data rates may apply. Reply " +
  "STOP to opt out or HELP for help. Consent is not a condition of any purchase.";
