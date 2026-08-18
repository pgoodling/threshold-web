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
  const callSid = params.CallSid ?? null;

  // A "voicemail" of a second or two is someone ringing off after the beep, not
  // a message. There's no need to log anything: /api/voice/no-answer already
  // recorded the missed call, and leaving it as a missed call is the truth.
  if (seconds < 2) return xml();

  const upgrade = {
    kind: "voicemail",
    body: `Voicemail — ${mmss(seconds)}`,
    recording_sid: recordingSid,
    recording_seconds: seconds,
  };

  // Twilio does not promise exactly-once webhook delivery, and in practice this
  // callback arrives twice. Every path below has to be safe to run again, so
  // start by asking whether this exact recording is already filed. Without this
  // the second delivery finds nothing left to upgrade (the first already did it)
  // and falls through to the insert, which is how one voicemail became two.
  if (recordingSid) {
    const { data: already } = await admin
      .from("messages")
      .select("id")
      .eq("recording_sid", recordingSid)
      .limit(1);
    if (already?.length) return xml();
  }

  // Normal path: turn the missed call this recording belongs to into a voicemail.
  const { data: upgraded } = await admin
    .from("messages")
    .update(upgrade)
    .eq("twilio_sid", callSid)
    .eq("kind", "missed_call")
    .select("id");

  if (upgraded?.length) return xml();

  // No row to upgrade — the missed-call insert failed, or this deployment
  // predates it. Fall back to logging the voicemail on its own so a real
  // message is never lost to a bookkeeping miss.
  const caller = await lookupCaller(admin, from);
  await admin.from("messages").insert({
    client_id: caller.clientId,
    appointment_id: caller.appointmentId,
    direction: "inbound",
    from_number: from,
    to_number: process.env.TWILIO_PHONE_NUMBER ?? null,
    twilio_sid: callSid,
    status: "received",
    ...upgrade,
  });

  return xml();
}
