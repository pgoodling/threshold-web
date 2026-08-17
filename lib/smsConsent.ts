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

// Appointment texts are NOT a checkbox. Giving the salon a mobile number in
// order to book is consent to be texted about that booking — written consent is
// only required for marketing. So this is notice at the point of collection
// rather than an opt-in: it tells the client plainly what they'll get and how
// to stop it, which is also the honest answer to the A2P campaign's "how do end
// users consent?" question.
export const SMS_NOTICE_HEADING = "About text messages";

export const SMS_NOTICE_TEXT =
  "We'll text booking confirmations, appointment reminders, and replies from " +
  "Evelyn to the number above. Message frequency varies. Message and data " +
  "rates may apply. Reply STOP any time to stop appointment texts, or HELP " +
  "for help.";

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
