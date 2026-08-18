import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { lookupCaller } from "../../../../lib/callerLookup";
import { toE164 } from "../../../../lib/phone";
import {
  isFromTwilio,
  readParams,
  webhookUrl,
  xml,
} from "../../../../lib/twilioWebhook";

// What happens when someone rings the salon number.
//
// Point the number's "A call comes in" webhook at this route.
//
// The shape of it: ring Evelyn's mobile, and if she doesn't take it, record a
// voicemail with a salon greeting. The whole reason this route exists is that
// plain carrier forwarding gets the second half wrong — an unanswered forward
// rolls to whatever greeting is on her personal cell, so a client who just
// rang "Threshold Salon" hears Evelyn's private voicemail instead.
//
// Two details do most of the work:
//
// `answerOnBridge` — without it Twilio answers the caller immediately and they
// sit in silence while her phone rings. With it they hear real ringback, so it
// behaves like an ordinary phone call rather than a phone system.
//
// The screening whisper (/api/voice/screen) — this is what actually solves the
// personal-voicemail problem. Her carrier voicemail will happily "answer" a
// forwarded call, and Twilio can't tell that apart from Evelyn answering. So
// the call is only bridged once someone presses a key, which voicemail can't
// do. No keypress, no bridge, and control comes back here for a proper salon
// voicemail.

export async function POST(req: Request) {
  const params = await readParams(req);
  if (!isFromTwilio(req, params, webhookUrl(req, "/api/voice/incoming"))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const owner = process.env.SALON_OWNER_PHONE;
  const from = params.From ?? "";

  // No mobile to ring means there's nothing to try — go straight to voicemail
  // rather than dropping the call.
  if (!owner) {
    return xml(`<Redirect>/api/voice/no-answer</Redirect>`);
  }

  // Greet her by the caller's name if we know them. Looked up here, on the
  // parent call, because the screening leg only ever sees the salon number.
  let name = "";
  const admin = getAdminClient();
  if (admin) {
    const caller = await lookupCaller(admin, from);
    name = caller.fullName ?? "";
  }

  const screenUrl = `/api/voice/screen?name=${encodeURIComponent(name)}`;

  // Show her the client's real number, so her own call log is worth something
  // afterwards — Twilio allows the inbound caller's number as the callerId when
  // forwarding. Withheld numbers arrive as "anonymous", which isn't dialable, so
  // those fall back to the salon number. Either way the whisper tells her whose
  // call it is before she takes it.
  const callerId = /^\+?\d[\d\s().-]+$/.test(from)
    ? toE164(from)
    : (process.env.TWILIO_PHONE_NUMBER ?? "");

  return xml(
    `<Dial answerOnBridge="true" timeout="25" action="/api/voice/no-answer" callerId="${callerId}">` +
      `<Number url="${screenUrl}">${toE164(owner)}</Number>` +
      `</Dial>`,
  );
}
