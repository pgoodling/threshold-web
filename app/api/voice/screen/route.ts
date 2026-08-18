import {
  escapeXml,
  isFromTwilio,
  readParams,
  webhookUrl,
  xml,
} from "../../../../lib/twilioWebhook";

// The whisper Evelyn hears, and only Evelyn — the client is still hearing
// ringback at this point and won't hear any of it.
//
// It does two jobs. It tells her who's calling before she commits, so she can
// let a cold sales call go to voicemail while she's got colour developing. And
// requiring a keypress is what stops her personal voicemail from swallowing the
// call: voicemail answers, hears this, and can't press anything, so the leg
// hangs up and the caller gets the salon greeting instead.

export async function POST(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";

  const params = await readParams(req);
  // Twilio signs the URL it requested, query string and all.
  if (
    !isFromTwilio(
      req,
      params,
      webhookUrl(req, `/api/voice/screen${url.search}`),
    )
  ) {
    return new Response("Invalid signature", { status: 403 });
  }

  const who = name ? `from ${escapeXml(name)}` : "from a number we don't know";

  return xml(
    `<Gather numDigits="1" timeout="10" action="/api/voice/accept">` +
      `<Say voice="Polly.Joanna">Threshold call ${who}. ` +
      `Press any key to take it.</Say>` +
      `</Gather>` +
      // Unreachable while the Gather has an action URL (a timeout posts there
      // with no digits), but it means a silent failure drops the leg rather
      // than leaving the caller connected to nothing.
      `<Hangup/>`,
  );
}
