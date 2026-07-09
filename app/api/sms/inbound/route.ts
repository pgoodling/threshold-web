import twilio from "twilio";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { last10 } from "../../../../lib/phone";

// Twilio inbound-SMS webhook. Twilio POSTs here (form-encoded) whenever a client
// texts the salon number. We verify it's really Twilio, match the sender to a
// client, log the message, and handle STOP/START opt-out. Replies are recorded
// but not auto-sent (that's Phase 2 + needs A2P). Responds with empty TwiML.

const xml = (body = "") =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });

const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
const START_WORDS = ["start", "yes", "unstop"];

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const admin = getAdminClient();
  if (!token || !admin) {
    // Nothing we can safely do without the auth token + DB access.
    return xml();
  }

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  // Verify the request genuinely came from Twilio (signed with our auth token).
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "";
  const url = process.env.TWILIO_WEBHOOK_URL ?? `${proto}://${host}/api/sms/inbound`;
  if (!twilio.validateRequest(token, signature, url, params)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = params.From ?? "";
  const to = params.To ?? "";
  const body = (params.Body ?? "").trim();
  const sid = params.MessageSid ?? params.SmsSid ?? null;

  // Match the sender to a client by the last 10 digits (formats vary).
  const fromKey = last10(from);
  let clientId: string | null = null;
  if (fromKey) {
    const { data: clients } = await admin
      .from("clients")
      .select("id,phone")
      .not("phone", "is", null);
    const match = (clients ?? []).find((c) => last10(c.phone as string) === fromKey);
    clientId = match?.id ?? null;
  }

  // Opt-out handling (Twilio also enforces STOP for compliance; we track it).
  const word = body.toLowerCase();
  if (clientId && STOP_WORDS.includes(word)) {
    await admin.from("clients").update({ sms_opt_out: true }).eq("id", clientId);
  } else if (clientId && START_WORDS.includes(word)) {
    await admin.from("clients").update({ sms_opt_out: false }).eq("id", clientId);
  }

  // Best-effort: link to the client's nearest current/upcoming appointment so
  // the text shows up on the right visit (e.g. a "running late" note).
  let appointmentId: string | null = null;
  if (clientId) {
    const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: appts } = await admin
      .from("appointments")
      .select("id,starts_at")
      .eq("client_id", clientId)
      .gte("starts_at", since)
      .in("status", ["booked", "confirmed", "checked_in"])
      .order("starts_at", { ascending: true })
      .limit(1);
    appointmentId = appts?.[0]?.id ?? null;
  }

  await admin.from("messages").insert({
    client_id: clientId,
    appointment_id: appointmentId,
    direction: "inbound",
    body,
    from_number: from,
    to_number: to,
    twilio_sid: sid,
    status: "received",
  });

  return xml();
}
