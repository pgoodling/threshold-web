import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only admin client (service-role key). NEVER import this into a client
// component — the service-role key bypasses Row-Level Security and must never
// reach the browser. Use only in trusted server routes (e.g. the Twilio
// webhook, which has no logged-in user). Returns null if unconfigured so
// callers can respond 503 gracefully.
export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
