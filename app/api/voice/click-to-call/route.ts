import twilio from "twilio";
import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { toE164 } from "../../../../lib/phone";

// Call a client FROM the salon number, without Evelyn's mobile ever showing.
//
// Twilio has no dialer app, so we bridge instead of dialling: Twilio rings
// EVELYN first, and when she picks up it dials the client and joins the two
// legs. The client sees the salon number because that's the callerId on the
// second leg. From her side it's an ordinary incoming call — no microphone
// permission, no WebRTC, no dependence on her data connection. It works on
// whatever phone she happens to be holding.
//
// Voice is not A2P-gated, so unlike texting this works today.
//
// Locked down the same way as /api/sms/send: only a signed-in studio session
// may trigger a call, and the destination is read from the database by client
// id rather than taken from the request, so a caller can't use this to dial
// arbitrary numbers on the salon's account.

export async function POST(req: Request) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const owner = process.env.SALON_OWNER_PHONE;

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

  if (!sid || !token || !from) {
    return NextResponse.json({ error: "Calling isn't set up yet." }, { status: 503 });
  }
  if (!owner) {
    return NextResponse.json(
      { error: "Add SALON_OWNER_PHONE (Evelyn's mobile) to enable calling." },
      { status: 503 },
    );
  }

  const { clientId } = (await req.json().catch(() => ({}))) as { clientId?: string };
  if (!clientId) {
    return NextResponse.json({ error: "Which client?" }, { status: 400 });
  }

  // The number comes from her records, never from the request body.
  const { data: client } = await admin
    .from("clients")
    .select("full_name, phone")
    .eq("id", clientId)
    .single();

  if (!client?.phone) {
    return NextResponse.json({ error: "No phone number on file." }, { status: 400 });
  }

  const target = toE164(client.phone);

  try {
    const call = await twilio(sid, token).calls.create({
      // Leg 1: ring Evelyn. Showing the salon number tells her at a glance
      // that this is the app connecting her, not a client calling in.
      to: toE164(owner),
      from,
      // Leg 2, once she answers: dial the client as the salon.
      twiml:
        `<Response><Say voice="alice">Connecting you to ` +
        `${(client.full_name ?? "your client").split(" ")[0]}.</Say>` +
        `<Dial callerId="${from}">${target}</Dial></Response>`,
    });
    return NextResponse.json({ sid: call.sid, status: call.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't place the call." },
      { status: 500 },
    );
  }
}
