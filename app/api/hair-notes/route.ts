import { NextResponse } from "next/server";
import { getAdminClient } from "../../../lib/supabaseAdmin";
// The same vocabulary the form renders from. Imported rather than restated:
// two copies of a list of allowed values is two copies that drift, and the one
// that drifts silently is the validator.
import {
  HAIR_TYPE,
  STRAND,
  DENSITY,
  LENGTH,
  LAST_CUT,
  STRUGGLES,
} from "../../../lib/hairNotes";

// Where the hair-notes form submits.
//
// It used to write straight to Supabase with the anon key, which meant the
// table needed an anon UPDATE policy, and an anon UPDATE policy can't be scoped
// to one row without granting a read that would expose other clients' answers.
// So it was `using (true)`: every anonymous caller could rewrite every row.
// Migration 0030 drops that and the write comes here instead.
//
// What guards this route is the same thing that guards the page: the caller
// holds an unguessable v4 appointment id. That is deliberately NOT a session —
// the client has just booked and has no account, and putting a login between
// someone and an optional form means nobody fills it in. What the id buys is
// checked before anything is written: the appointment must exist and must not
// be cancelled.
//
// The difference from before is that the id now bounds what can be touched.
// Holding one appointment's id writes one appointment's row, which was always
// the intent.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Free text the client types. Long enough for anything anyone actually wants to
// say, short enough that the column isn't a place to store a novel.
const MAX_TEXT = 2000;

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, MAX_TEXT);
  return t || null;
};

// Only values the form offers. An unrecognised one isn't dangerous — it's
// parameterized either way — but it would render as a blank in the studio and
// leave Evelyn wondering what the client meant.
const pick = (
  v: unknown,
  allowed: readonly { value: string }[],
): string | null => {
  const t = clean(v);
  return t && allowed.some((o) => o.value === t) ? t : null;
};

const STRUGGLE_VALUES = STRUGGLES.map((s) => s.value);

export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const appointmentId = clean(body.appointmentId);
  if (!appointmentId || !UUID_RE.test(appointmentId)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // The id has to name a real, live appointment. This is the whole check —
  // without it the route would be as open as the policy it replaces.
  const { data: appt } = await admin
    .from("appointments")
    .select("id, client_id, status")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appt || appt.status === "cancelled") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // client_id comes from the appointment row, never from the request. A caller
  // holding one appointment's id can't attach answers to a different client.
  const struggles = Array.isArray(body.struggles)
    ? body.struggles.filter(
        (s): s is string =>
          typeof s === "string" && STRUGGLE_VALUES.includes(s),
      )
    : [];

  const { error } = await admin.from("appointment_intake").upsert(
    {
      appointment_id: appointmentId,
      client_id: appt.client_id,
      hair_type: pick(body.hairType, HAIR_TYPE),
      strand: pick(body.strand, STRAND),
      density: pick(body.density, DENSITY),
      length: pick(body.length, LENGTH),
      last_cut: pick(body.lastCut, LAST_CUT),
      struggles,
      allergies: clean(body.allergies),
      note: clean(body.note),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "appointment_id" },
  );

  if (error) {
    return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
