import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { lookupCaller } from "../../../../lib/callerLookup";
import { isFromTwilio, readParams, webhookUrl, xml } from "../../../../lib/twilioWebhook";

// The voicemail is recorded — file it.
//
// This is the recordingStatusCallback rather than the <Record> action on
// purpose. The action URL isn't requested when the caller simply hangs up,
// which is how most people end a voicemail, so hanging the write off it would
// lose exactly the messages that matter.
//
// The row goes in `messages`, not a table of its own, so it inherits the
// conversation grouping and the unread badge and lands in the same thread as
// the client's texts. The transcription arrives separately a few seconds later
// (see /api/voice/transcription) — until then the body is the duration, so the
// Messages tab has something to show immediately.

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const params = await readParams(req);
  if (
    !isFromTwilio(
      req,
      params,
      webhookUrl(req, `/api/voice/voicemail${url.search}`),
    )
  ) {
    return new Response("Invalid signature", { status: 403 });
  }

  const admin = getAdminClient();
  if (!admin) return xml();

  const from = url.searchParams.get("from") ?? "";
  const recordingSid = params.RecordingSid ?? null;
  const seconds = Number(params.RecordingDuration ?? "0");

  // A "voicemail" of a second or two is someone ringing off after the beep, not
  // a message. Logging those trains her to ignore the badge.
  if (seconds < 2) return xml();

  const caller = await lookupCaller(admin, from);

  await admin.from("messages").insert({
    client_id: caller.clientId,
    appointment_id: caller.appointmentId,
    direction: "inbound",
    kind: "voicemail",
    body: `Voicemail — ${mmss(seconds)}`,
    from_number: from,
    to_number: process.env.TWILIO_PHONE_NUMBER ?? null,
    twilio_sid: params.CallSid ?? null,
    recording_sid: recordingSid,
    recording_seconds: seconds,
    status: "received",
  });

  return xml();
}
