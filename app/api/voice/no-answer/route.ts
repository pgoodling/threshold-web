import {
  isFromTwilio,
  readParams,
  webhookUrl,
  xml,
} from "../../../../lib/twilioWebhook";

// Reached when the <Dial> in /api/voice/incoming finishes. Either they spoke
// and there's nothing left to do, or nobody took the call and this is where the
// salon voicemail lives — the greeting a client should have been getting all
// along instead of Evelyn's personal one.
//
// Telling those two apart is fiddlier than it looks. A declined screening leg
// still reports DialCallStatus "completed", because Twilio did answer it to
// play the whisper; what separates a real conversation from a rejected one is
// that only the real one was ever bridged, and so only the real one has a
// non-zero DialCallDuration.

export async function POST(req: Request) {
  const params = await readParams(req);
  if (!isFromTwilio(req, params, webhookUrl(req, "/api/voice/no-answer"))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const status = params.DialCallStatus ?? "";
  const seconds = Number(params.DialCallDuration ?? "0");
  if (status === "completed" && seconds > 0) {
    return xml(); // They talked. Ending the TwiML ends the call.
  }

  // Carry the caller's number to the recording callback: the recording webhook
  // is about the recording, and doesn't repeat who was on the phone.
  const from = params.From ?? "";
  const q = `?from=${encodeURIComponent(from)}`;

  return xml(
    `<Say voice="Polly.Joanna">Thanks for calling Threshold Salon. ` +
      `We're with a client at the moment. Leave your name, your number, and ` +
      `what you'd like booked, and we'll call you straight back.</Say>` +
      `<Record maxLength="120" timeout="4" playBeep="true" finishOnKey="#" ` +
      `transcribe="true" transcribeCallback="/api/voice/transcription" ` +
      `recordingStatusCallback="/api/voice/voicemail${q}" ` +
      `recordingStatusCallbackEvent="completed" />` +
      // Only reached if they rang off without saying anything.
      `<Say voice="Polly.Joanna">We didn't catch that. Please call again, or ` +
      `book online at threshold dot salon.</Say>`,
  );
}
