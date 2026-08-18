import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { lookupCaller } from "../../../../lib/callerLookup";
import {
  isFromTwilio,
  readParams,
  webhookUrl,
  xml,
} from "../../../../lib/twilioWebhook";

// Twilio inbound-SMS webhook. Twilio POSTs here (form-encoded) whenever a client
// texts the salon number. We verify it's really Twilio, match the sender to a
// client, log the message, and handle STOP/START opt-out. Replies are recorded
// but not auto-sent (that's Phase 2 + needs A2P). Responds with empty TwiML.

const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
const START_WORDS = ["start", "yes", "unstop"];

export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) {
    // Nothing we can safely do without DB access.
    return xml();
  }

  const params = await readParams(req);

  // Verify the request genuinely came from Twilio (signed with our auth token).
  // TWILIO_WEBHOOK_URL is an escape hatch for when the URL can't be inferred
  // from the request headers and must be stated exactly.
  const url =
    process.env.TWILIO_WEBHOOK_URL ?? webhookUrl(req, "/api/sms/inbound");
  if (!isFromTwilio(req, params, url)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = params.From ?? "";
  const to = params.To ?? "";
  const body = (params.Body ?? "").trim();
  const sid = params.MessageSid ?? params.SmsSid ?? null;

  // Who texted, and about which visit. A household can share one number, so
  // this may match several people — resolved by whoever is in the chair soonest.
  const caller = await lookupCaller(admin, from);

  // Opt-out handling (Twilio also enforces STOP for compliance; we track it).
  // Twilio blocks the NUMBER, not the person, so STOP from a shared household
  // line has to opt out everyone who uses it.
  const word = body.toLowerCase();
  if (caller.candidates.length && STOP_WORDS.includes(word)) {
    await admin
      .from("clients")
      .update({ sms_opt_out: true })
      .in("id", caller.candidates);
  } else if (caller.candidates.length && START_WORDS.includes(word)) {
    await admin
      .from("clients")
      .update({ sms_opt_out: false })
      .in("id", caller.candidates);
  }

  await admin.from("messages").insert({
    client_id: caller.clientId,
    appointment_id: caller.appointmentId,
    direction: "inbound",
    body,
    from_number: from,
    to_number: to,
    twilio_sid: sid,
    status: "received",
  });

  return xml();
}
