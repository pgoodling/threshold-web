import {
  isFromTwilio,
  readParams,
  webhookUrl,
  xml,
} from "../../../../lib/twilioWebhook";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { toE164 } from "../../../../lib/phone";

// Second half of a click-to-call: bridge Evelyn to the client, but only once a
// human has pressed a key.
//
// Without this the outbound path had the same hole the inbound path closed
// months ago. Twilio rings Evelyn; if she doesn't reach her phone in time, her
// carrier voicemail answers, and to Twilio "answered" is "answered" — so it
// dialled the client anyway. The client didn't answer either, THEIR voicemail
// picked up, and the two answerphones were connected to each other. The
// client's greeting was recorded into Evelyn's voicemail. That is exactly what
// happened on the first real test.
//
// A keypress is the fix, for the same reason it works inbound: voicemail can
// hear a prompt but it cannot press a key.
//
// The client id travels in the query string, never the phone number. Twilio
// signs the URL it requested, so the id can't be swapped, and the number is
// read from her records here — the same rule the click-to-call route follows.

export async function POST(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? "";

  const params = await readParams(req);
  if (
    !isFromTwilio(
      req,
      params,
      webhookUrl(req, `/api/voice/connect${url.search}`),
    )
  ) {
    return new Response("Invalid signature", { status: 403 });
  }

  // No digits means the Gather timed out — nobody was there, or an answerphone
  // was. Either way, don't dial the client.
  if (!params.Digits) {
    return xml(`<Hangup/>`);
  }

  const from = process.env.TWILIO_PHONE_NUMBER;
  const admin = getAdminClient();
  if (!from || !admin) {
    return xml(
      `<Say voice="Polly.Joanna">Sorry, calling isn't set up.</Say><Hangup/>`,
    );
  }

  const { data: client } = await admin
    .from("clients")
    .select("phone")
    .eq("id", clientId)
    .single();

  if (!client?.phone) {
    return xml(
      `<Say voice="Polly.Joanna">There's no number on file for that client.</Say>` +
        `<Hangup/>`,
    );
  }

  // answerOnBridge so she hears real ringing rather than silence, and stops the
  // salon being billed from the moment the client's carrier picks up.
  return xml(
    `<Dial callerId="${from}" answerOnBridge="true" timeout="30">` +
      `${toE164(client.phone)}</Dial>`,
  );
}
