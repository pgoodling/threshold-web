import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";

// Streams a voicemail recording to the studio, and only to the studio.
//
// Twilio's own media URLs are unauthenticated by default — anyone holding the
// link can play the recording. Putting one in the page would mean a client's
// voicemail, with their name and number in it, sitting behind a guessable-ish
// URL on the public internet. So the browser never sees Twilio's URL: it asks
// this route with Evelyn's session token, and the audio is fetched server-side
// with the account credentials and piped back.
//
// The studio fetches this into a blob rather than pointing an <audio src> at it,
// because an <audio> tag can't send an Authorization header.

export async function GET(req: Request) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  const admin = getAdminClient();
  if (!admin || !sid || !token) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: userData } = await admin.auth.getUser(bearer);
  if (!userData?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Shape-checked before it's interpolated into the Twilio URL, so a crafted
  // value can't walk out of the Recordings collection into the rest of the API.
  const recordingSid = new URL(req.url).searchParams.get("sid") ?? "";
  if (!/^RE[0-9a-fA-F]{32}$/.test(recordingSid)) {
    return NextResponse.json({ error: "Not a recording." }, { status: 400 });
  }

  const media = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${recordingSid}.mp3`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      },
    },
  );

  if (!media.ok || !media.body) {
    return NextResponse.json(
      { error: "That recording isn't available." },
      { status: 404 },
    );
  }

  return new Response(media.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      // It's a client's voicemail — no shared caches, ever.
      "Cache-Control": "private, no-store",
    },
  });
}
