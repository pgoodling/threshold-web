import { createClient } from "@supabase/supabase-js";

// Public, browser-safe credentials. These are inlined at build time by Next.js
// (NEXT_PUBLIC_* vars). Row-Level Security on the database is what actually
// protects data — the anon key only grants what RLS policies allow.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in your Supabase project values.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
