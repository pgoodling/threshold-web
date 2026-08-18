import {
  isFromTwilio,
  readParams,
  webhookUrl,
  xml,
} from "../../../../lib/twilioWebhook";

// Did Evelyn actually pick up, or did her voicemail?
//
// A key was pressed, so there's a person there: returning empty TwiML ends this
// leg's instructions, which is what bridges the two calls together.
//
// Nothing pressed means the Gather timed out — voicemail, or a phone ringing in
// a bag. Hanging up here hands control back to the <Dial> in /api/voice/incoming,
// whose action URL then takes the salon voicemail.

export async function POST(req: Request) {
  const params = await readParams(req);
  if (!isFromTwilio(req, params, webhookUrl(req, "/api/voice/accept"))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const pressed = (params.Digits ?? "").length > 0;
  return pressed ? xml() : xml(`<Hangup/>`);
}
