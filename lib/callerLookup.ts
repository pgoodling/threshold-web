import type { SupabaseClient } from "@supabase/supabase-js";
import { last10 } from "./phone";

// "Who is this?" — shared by the inbound-SMS webhook and the voicemail webhook.
// Both get handed nothing but a phone number and both need the same answer:
// which client, and which of their appointments is this about.

export type Caller = {
  clientId: string | null;
  appointmentId: string | null;
  /** Every client on this number — a household can share one line. */
  candidates: string[];
  fullName: string | null;
};

export async function lookupCaller(
  admin: SupabaseClient,
  fromNumber: string,
): Promise<Caller> {
  const empty: Caller = {
    clientId: null,
    appointmentId: null,
    candidates: [],
    fullName: null,
  };

  // Match on the stored phone_key (migration 0010) so this is an indexed lookup
  // rather than a scan of every client.
  const key = last10(fromNumber);
  if (!key) return empty;

  const { data: clients } = await admin
    .from("clients")
    .select("id, full_name")
    .eq("phone_key", key);

  if (!clients?.length) return empty;

  const candidates = clients.map((c) => c.id as string);
  let clientId = candidates[0];
  let fullName = (clients[0].full_name as string | null) ?? null;

  // Best-effort: link to the nearest current/upcoming appointment so the
  // message lands on the right visit. When a household shares a number this
  // also decides which of them is calling — whoever is due in the chair
  // soonest.
  let appointmentId: string | null = null;
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: appts } = await admin
    .from("appointments")
    .select("id, client_id")
    .in("client_id", candidates)
    .gte("starts_at", since)
    .in("status", ["booked", "confirmed", "checked_in"])
    .order("starts_at", { ascending: true })
    .limit(1);

  if (appts?.[0]) {
    appointmentId = appts[0].id as string;
    clientId = appts[0].client_id as string;
    fullName = clients.find((c) => c.id === clientId)?.full_name ?? fullName;
  }

  return { clientId, appointmentId, candidates, fullName };
}
