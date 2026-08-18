import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164 } from "./phone";
import { TZ } from "./format";

// Every automated text goes through here.
//
// Manual replies from the Messages tab go via /api/sms/send, where Evelyn is
// the one deciding. Automation has no such judgement, so the rules a person
// would apply have to be written down: don't text someone who never agreed,
// don't text someone who said stop, and don't text anyone at 3am.
//
// Each of those is a distinct refusal reason rather than a silent no-op, so a
// cron run can report "12 sent, 4 no_consent, 1 quiet_hours" and Paul can tell
// a working system from a broken one at a glance.

export type SendResult =
  | { ok: true; sid: string }
  | { ok: false; reason: string };

// The master switch. Automated sending stays off until the A2P campaign clears
// — the sends would fail at the carrier anyway, but an explicit flag means the
// day it clears is a config change, not a deploy, and means a half-tested cron
// can't quietly start texting 159 people.
export function automationEnabled(): boolean {
  return process.env.SMS_AUTOMATION_ENABLED === "true";
}

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER,
  );
}

// Quiet hours, in salon-local time. The TCPA's own rule is 8am–9pm local, and
// carriers treat texting outside it as a complaint risk; this is deliberately
// tighter, because a salon texting at 8:59pm reads as a business with no
// manners even when it's legal.
const QUIET_START_HOUR = 9; // first hour an automated text may go out
const QUIET_END_HOUR = 20; // last hour (i.e. nothing from 20:00 onward)

export function withinQuietHours(now = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  return hour < QUIET_START_HOUR || hour >= QUIET_END_HOUR;
}

type ClientConsent = {
  phone: string | null;
  sms_opt_out: boolean | null;
  sms_consent_at: string | null;
};

// Send an automated text to a client, and log it. Returns why it didn't send
// rather than throwing — a reminder that can't go out must never take down the
// run for the twenty clients after it.
export async function sendClientSms(
  admin: SupabaseClient,
  opts: {
    clientId: string;
    appointmentId?: string | null;
    body: string;
    /** Skip the quiet-hours check for something genuinely time-critical, like
     *  "you're due now, are you on your way?" — useless an hour later. */
    ignoreQuietHours?: boolean;
  },
): Promise<SendResult> {
  if (!automationEnabled()) return { ok: false, reason: "automation_off" };
  if (!smsConfigured()) return { ok: false, reason: "sms_unconfigured" };
  if (!opts.ignoreQuietHours && withinQuietHours()) {
    return { ok: false, reason: "quiet_hours" };
  }

  const { data: client } = await admin
    .from("clients")
    .select("phone, sms_opt_out, sms_consent_at")
    .eq("id", opts.clientId)
    .single<ClientConsent>();

  if (!client?.phone) return { ok: false, reason: "no_phone" };
  if (client.sms_opt_out) return { ok: false, reason: "opted_out" };
  // Consent is what separates this from spam, and it's per-client: the clients
  // imported from her paper book have none until they tick the box on a future
  // booking, and they get no automated texts until they do.
  if (!client.sms_consent_at) return { ok: false, reason: "no_consent" };

  const from = process.env.TWILIO_PHONE_NUMBER as string;
  const to = toE164(client.phone);

  try {
    const msg = await twilio(
      process.env.TWILIO_ACCOUNT_SID as string,
      process.env.TWILIO_AUTH_TOKEN as string,
    ).messages.create({ to, from, body: opts.body });

    await admin.from("messages").insert({
      client_id: opts.clientId,
      appointment_id: opts.appointmentId ?? null,
      direction: "outbound",
      kind: "sms",
      body: opts.body,
      from_number: from,
      to_number: to,
      twilio_sid: msg.sid,
      status: msg.status,
    });

    return { ok: true, sid: msg.sid };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? `twilio_error: ${e.message}` : "twilio_error",
    };
  }
}
