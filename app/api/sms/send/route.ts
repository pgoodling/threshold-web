import twilio from "twilio";
import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { toE164 } from "../../../../lib/phone";

// Send a text to a client and log it. Authenticated — only Evelyn's logged-in
// studio session may call this (verified via her Supabase access token). Won't
// send to a client who has opted out. Guarded 503 until Twilio is configured.
export async function POST(req: Request) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }

  // Verify the caller is a signed-in studio user.
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: userData } = await admin.auth.getUser(bearer);
  if (!userData?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { to, body, clientId, appointmentId } = (await req.json()) as {
    to?: string;
    body?: string;
    clientId?: string;
    appointmentId?: string;
  };
  if (!to || !body?.trim()) {
    return NextResponse.json({ error: "Missing number or message." }, { status: 400 });
  }

  // Respect opt-out.
  if (clientId) {
    const { data: client } = await admin
      .from("clients")
      .select("sms_opt_out")
      .eq("id", clientId)
      .single();
    if (client?.sms_opt_out) {
      return NextResponse.json(
        { error: "This client has opted out of texts." },
        { status: 409 },
      );
    }
  }

  if (!sid || !authToken || !from) {
    return NextResponse.json(
      { error: "Texting isn't set up yet (Twilio + A2P pending)." },
      { status: 503 },
    );
  }

  try {
    const client = twilio(sid, authToken);
    const msg = await client.messages.create({ to: toE164(to), from, body: body.trim() });
    await admin.from("messages").insert({
      client_id: clientId ?? null,
      appointment_id: appointmentId ?? null,
      direction: "outbound",
      body: body.trim(),
      from_number: from,
      to_number: toE164(to),
      twilio_sid: msg.sid,
      status: msg.status,
    });
    return NextResponse.json({ sid: msg.sid, status: msg.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "SMS error" },
      { status: 500 },
    );
  }
}
