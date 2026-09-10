#!/usr/bin/env bash
#
# Which migrations have actually reached the database?
#
# Migrations here are applied by hand in the Supabase SQL editor, and there is
# no schema_migrations table recording what ran. That is fine when one person
# is working in one place. It stops being fine the moment two sessions add a
# migration on the same afternoon — which has already happened once (there are
# two files numbered 0032), and which is exactly when "did that one get run?"
# becomes unanswerable from the filesystem.
#
# So: ask the database.
#
# HOW IT WORKS, AND WHAT IT CANNOT SEE
#
# The probe is PostgREST with the anon key — the same key the public booking
# page ships to browsers, so this exposes nothing and needs no secret. Asking
# for a column that doesn't exist returns 400 with SQLSTATE 42703; asking for
# one that does returns 200 and (thanks to RLS) zero rows. That difference is
# the whole test. It reads no data.
#
# Which means it can only see STRUCTURE — tables, columns, views. A migration
# whose entire effect is a cron job, a policy, a function body or a column
# comment is invisible here, and the script says so rather than guessing. Those
# get a SQL snippet to paste into the editor instead.
#
# Usage:  bash scripts/check-migrations.sh
#
# Adding a migration: put one line in STRUCTURAL below naming any column or
# table it creates. If it creates none, add it to OPAQUE with the query that
# would prove it ran.

set -u

ENV_FILE="${ENV_FILE:-.env.local}"
if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE — run from the repo root, or set ENV_FILE." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; . "./$ENV_FILE"; set +a

URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "$ENV_FILE has no NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY." >&2
  exit 1
fi
URL="${URL%/}"

# Which database we're actually talking to. Worth printing every run: this
# project has a sibling Supabase project (the golf app) that tooling has
# pointed at before now, and a clean bill of health on the wrong database is
# worse than no answer at all.
echo "Database: $(echo "$URL" | sed 's#https://##')"
echo

# migration | table | column   ("" column = the table itself is the marker)
STRUCTURAL="
0024_sms_automation|appointments|reminder_sms_sent_at
0026_archive_and_snooze|messages|archived_at
0026_archive_and_snooze|clients|snoozed_until
0027_site_services|site_services|
0028_hair_notes|appointment_intake|
0028_hair_notes|client_formulas|
0029_manual_texts|appointments|confirm_sms_sent_at
0031_salon_settings|salon_settings|
0032_booking_alerts|appointments|source
0032_booking_alerts|appointments|owner_notified_at
0032_booking_alerts|salon_settings|bookings_seen_at
"

# migration | what it changed | the query that proves it
OPAQUE="
0025_late_arrival_cron|scheduled a pg_cron job|select jobname, schedule, active from cron.job where jobname = 'threshold-late-arrivals';
0030_intake_server_writes|replaced functions and policies|select prosecdef from pg_proc where proname = 'save_intake';
0032_stop_late_arrival_texts|unscheduled that cron job|select count(*) from cron.job where jobname = 'threshold-late-arrivals';  -- 0 = applied
"

probe() { # table, column -> prints PRESENT / MISSING / ERROR
  local body code
  body=$(mktemp)
  code=$(curl -s -o "$body" -w "%{http_code}" \
    "$URL/rest/v1/$1?select=$2&limit=1" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
  if [ "$code" = "200" ]; then
    echo "PRESENT"
  elif grep -q '"42703"\|"42P01"' "$body" 2>/dev/null; then
    echo "MISSING"
  else
    # Anything else — a network failure, a revoked key, a 401 — is not
    # evidence of absence, and must never be reported as "not applied".
    echo "ERROR($code)"
  fi
  rm -f "$body"
}

# Self-test. If a column that cannot exist comes back PRESENT, the probe is
# meaningless and every result below is too. Better to refuse than to reassure.
if [ "$(probe appointments __no_such_column__)" != "MISSING" ]; then
  echo "Probe self-test failed: a nonexistent column did not report MISSING." >&2
  echo "Refusing to report — the results would not mean anything." >&2
  exit 2
fi

echo "Structural migrations (checked against the live schema)"
echo
printf '%s\n' "$STRUCTURAL" | grep . | {
  current=""; verdict=""; detail=""
  while IFS='|' read -r mig tbl col; do
    [ "$mig" != "$current" ] && {
      [ -n "$current" ] && printf '  %-8s %s%s\n' "$verdict" "$current" "$detail"
      current="$mig"; verdict="APPLIED"; detail=""
    }
    r=$(probe "$tbl" "${col:-*}")
    if [ "$r" = "MISSING" ]; then
      verdict="NOT RUN"; detail="  — missing $tbl.${col:-(table)}"
    elif [ "$r" != "PRESENT" ] && [ "$verdict" = "APPLIED" ]; then
      verdict="UNKNOWN"; detail="  — probe $r on $tbl.${col:-(table)}"
    fi
  done
  [ -n "$current" ] && printf '  %-8s %s%s\n' "$verdict" "$current" "$detail"
}

echo
echo "Opaque migrations (no structure to probe — run these in the SQL editor)"
echo
printf '%s\n' "$OPAQUE" | grep . | while IFS='|' read -r mig what sql; do
  printf '  CHECK BY HAND  %s\n' "$mig"
  printf '                 %s\n' "$what"
  printf '                 %s\n\n' "$sql"
done
