// Copies supabase/migrations into the rig's own folder, so a fresh local
// database is built from exactly the SQL that built production.
//
// One wrinkle: two migrations were both numbered 0032 (two sessions on
// 9 Sep 2026). Production didn't care — they were pasted into the SQL editor —
// but the Supabase CLI keys migrations by number and refuses duplicates. The
// real files are left alone; the copies get 00321 and 00322, in the order they
// actually ran (booking alerts 17:27, stop late-arrival texts 17:40).

import { readdirSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "supabase", "migrations");
const dest = join(here, "supabase", "migrations");

const RENAME = {
  "0032_booking_alerts.sql": "00321_booking_alerts.sql",
  "0032_stop_late_arrival_texts.sql": "00322_stop_late_arrival_texts.sql",
};

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const files = readdirSync(src).filter((f) => f.endsWith(".sql")).sort();
const seen = new Map();
for (const f of files) {
  const out = RENAME[f] ?? f;
  const version = out.split("_")[0];
  if (seen.has(version)) {
    throw new Error(`Two migrations share version ${version}: ${seen.get(version)} and ${f}. Add one to RENAME.`);
  }
  seen.set(version, f);
  copyFileSync(join(src, f), join(dest, out));
}
console.log(`Copied ${files.length} migrations into the rig.`);
