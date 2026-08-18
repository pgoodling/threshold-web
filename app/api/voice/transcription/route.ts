import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { isFromTwilio, readParams, webhookUrl, xml } from "../../../../lib/twilioWebhook";

// Twilio's transcription of the voicemail, which lands a few seconds after the
// recording itself.
//
// Worth the cent it costs: a transcript can be read at a glance between clients,
// where audio can't — she'd have to stop, find headphones or clear the room, and
// listen to the whole thing to learn it was a supplier. The audio stays available
// either way; this just means she usually won't need it.
//
// Matched back to its row by RecordingSid. If transcription failed we leave the
// "Voicemail — 0:34" placeholder alone rather than overwriting it with nothing.

export async function POST(req: Request) {
  const params = await readParams(req);
  if (!isFromTwilio(req, params, webhookUrl(req, "/api/voice/transcription"))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const admin = getAdminClient();
  const recordingSid = params.RecordingSid;
  const text = (params.TranscriptionText ?? "").trim();

  if (
    admin &&
    recordingSid &&
    params.TranscriptionStatus === "completed" &&
    text
  ) {
    await admin
      .from("messages")
      .update({ body: text })
      .eq("recording_sid", recordingSid);
  }

  return xml();
}
