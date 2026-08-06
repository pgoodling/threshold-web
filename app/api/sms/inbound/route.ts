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

  // Match the sender by the last 10 digits, via the stored phone_key (migration
  // 0010) so this is an indexed lookup rather than a scan of every client.
  // A household can share one number, so this may return several people —
  // resolved below by whoever is actually in the chair soonest.
  const fromKey = last10(from);
  let clientId: string | null = null;
  let candidates: string[] = [];
  if (fromKey) {
    const { data: clients } = await admin
      .from("clients")
      .select("id")
      .eq("phone_key", fromKey);
    candidates = (clients ?? []).map((c) => c.id as string);
    clientId = candidates[0] ?? null;
  }

  // Opt-out handling (Twilio also enforces STOP for compliance; we track it).
  // Twilio blocks the NUMBER, not the person, so STOP from a shared household
  // line has to opt out everyone who uses it.
  const word = body.toLowerCase();
  if (candidates.length && STOP_WORDS.includes(word)) {
    await admin.from("clients").update({ sms_opt_out: true }).in("id", candidates);
  } else if (candidates.length && START_WORDS.includes(word)) {
    await admin.from("clients").update({ sms_opt_out: false }).in("id", candidates);
  }

  // Best-effort: link to the nearest current/upcoming appointment so the text
  // shows up on the right visit (e.g. a "running late" note). When a household
  // shares a number this also picks which of them is texting — whoever is due
  // in the chair soonest.
  let appointmentId: string | null = null;
  if (candidates.length) {
    const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: appts } = await admin
      .from("appointments")
      .select("id,starts_at,client_id")
      .in("client_id", candidates)
      .gte("starts_at", since)
      .in("status", ["booked", "confirmed", "checked_in"])
      .order("starts_at", { ascending: true })
      .limit(1);
    if (appts?.[0]) {
      appointmentId = appts[0].id as string;
      clientId = appts[0].client_id as string;
    }
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
