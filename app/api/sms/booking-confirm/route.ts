import twilio from "twilio";
import { NextResponse } from "next/server";

// Normalize a US phone to E.164 (+1XXXXXXXXXX) for Twilio.
function toE164(raw: string) {
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// Sends a booking-confirmation text to the client. Server-only (Twilio auth
// token never reaches the browser). Best-effort — the booking already
// succeeded before this is called.
export async function POST(req: Request) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    return NextResponse.json({ error: "SMS not configured." }, { status: 503 });
  }

  try {
    const { to, name, service, startsAt } = (await req.json()) as {
      to?: string;
      name?: string;
      service?: string;
      startsAt?: string;
    };
    if (!to) {
      return NextResponse.json({ error: "Missing phone." }, { status: 400 });
    }

    const when = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(startsAt ?? Date.now()));

    const first = name?.trim().split(" ")[0] || "there";
    const body = `Hi ${first}! You're booked at Threshold for ${service} on ${when}. Reply here if you need anything. — Evelyn`;

    const client = twilio(sid, token);
    const msg = await client.messages.create({ to: toE164(to), from, body });
    return NextResponse.json({ sid: msg.sid, status: msg.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "SMS error" },
      { status: 500 },
    );
  }
}
