import {
  isFromTwilio,
  readParams,
  webhookUrl,
  xml,
} from "../../../../lib/twilioWebhook";

// What the caller hears after the recording stops.
//
// This exists because <Record> without an `action` falls through to whatever
// verb comes next, which meant anyone who left a message and then stopped
// talking was told "We didn't catch that" — the one line that should never
// follow a message we did catch. Only callers who hung up mid-sentence escaped
// it, which is the wrong way round.
//
// Recordings ending by hangup never reach here at all; Twilio skips the action
// URL in that case. So this is specifically the caller who finished speaking
// and waited, or who rang off without saying anything.

export async function POST(req: Request) {
  const params = await readParams(req);
  if (!isFromTwilio(req, params, webhookUrl(req, "/api/voice/voicemail-done"))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const seconds = Number(params.RecordingDuration ?? "0");

  // Same two-second threshold the voicemail logger uses, so what the caller is
  // told matches what Evelyn ends up seeing.
  if (seconds < 2) {
    return xml(
      `<Say voice="Polly.Joanna">Sorry, we didn't catch that. ` +
        `Please call again, or book online at threshold dot salon.</Say>` +
        `<Hangup/>`,
    );
  }

  return xml(
    `<Say voice="Polly.Joanna">Got it — we'll call you back shortly. ` +
      `Thanks for calling Threshold Salon.</Say><Hangup/>`,
  );
}
