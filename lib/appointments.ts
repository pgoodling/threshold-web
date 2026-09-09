import type { SupabaseClient } from "@supabase/supabase-js";

export type StudioAppointmentRow = {
  client_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  status: string;
};

// Book an appointment Evelyn is entering herself, at the desk or on the phone.
//
// The only thing this adds over a plain insert is `source: 'studio'`, and it
// exists because that one word is load-bearing: it's what keeps her own
// bookings out of the "booked while you were away" strip on the home screen.
// A strip that shows her the appointment she typed in ten seconds ago is a
// strip she learns to dismiss without reading, and then it fails at the one
// job it has.
//
// The public /book flow doesn't go anywhere near here. It books through
// create_booking, which doesn't name the column at all and so picks up its
// 'online' default — which is why that function didn't have to be redefined a
// tenth time to make this work.
//
// The retry is the house pattern for a column that may not exist yet (see
// saveClient vs migration 0009, writeService vs 0016, create_booking's own
// p_sms_consent retry in app/book/page.tsx). Deploys and SQL move
// independently here, so a deploy that lands before 0032 must still be able to
// take a booking — worst case the appointment turns up in her strip, which is
// cosmetic. Failing to book a client because a dashboard strip wants a column
// would not be.
export async function insertStudioAppointment(
  db: SupabaseClient,
  row: StudioAppointmentRow,
): Promise<{ error: { message: string } | null }> {
  const first = await db
    .from("appointments")
    .insert({ ...row, source: "studio" });
  if (!first.error) return { error: null };

  if (/source|could not find|schema cache/i.test(first.error.message)) {
    const retry = await db.from("appointments").insert(row);
    return { error: retry.error };
  }
  return { error: first.error };
}
