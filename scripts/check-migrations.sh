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
0033_settings|salon_settings|digest_hour
0033_settings|salon_settings|min_booking_notice_minutes
0033_settings|appointments|cancel_notice_hours
0036_money|bank_accounts|
0036_money|bank_transactions|is_business
0036_money|expense_categories|schedule_c_line
0036_money|category_rules|
0036_money|tax_rates|checked_on
0037_money_real_data|bank_transactions|pending
0037_money_real_data|bank_transactions|balance_after_cents
0039_opening_date|salon_settings|opened_on
"

# Opaque migrations already settled by hand. Recorded so the question is asked
# once. Date them — a result is only true of the database as it was that day.
SETTLED="
0030_intake_server_writes|10 Sep 2026|anon_policies_left = 0 and formula_still_notnull = false — anon can no longer write intake rows, and a note without a formula is allowed
0032_stop_late_arrival_texts|10 Sep 2026|cron.job count for 'threshold-late-arrivals' returned 0 — job is gone
0035_digest_cron_vault|10 Sep 2026|rescheduled as jobid 4, and vault secret 'cron_secret' exists (created 18 Aug). Supersedes 0034, whose ALTER DATABASE approach Supabase refuses
0025_late_arrival_cron|10 Sep 2026|moot: whatever it scheduled, 0032_stop_late_arrival_texts removed it and the route is deleted
0034+0035_digest_cron|23 Sep 2026|net._http_response shows 200 on the hour, every hour — the job dispatches and the vault secret matches Vercel's CRON_SECRET. The 401 we were braced for never happened
"

# migration | what it changed | the query that proves it
#
# Empty as of 10 Sep 2026: every migration in the tree is accounted for. New
# entries go here when a migration changes only policies, functions, cron jobs
# or comments — anything the anon probe can't see.
OPAQUE="
0038_nail_care_rule|adds a rule and a category, no structure — and RLS hides the rows from this probe|select count(*) as applied from public.category_rules where pattern = 'NAIL SPA';  -- 1 = applied
"

probe() { # table, column -> prints PRESENT / MISSING / ERROR
  local body code
  body=$(mktemp)
  code=$(curl -s -o "$body" -w "%{http_code}" \
    "$URL/rest/v1/$1?select=$2&limit=1" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
  if [ "$code" = "200" ]; then
    echo "PRESENT"
  elif grep -q '"42703"\|"42P01"\|"PGRST205"' "$body" 2>/dev/null; then
    # 42703 is a missing column. A missing TABLE never reaches Postgres at all:
    # PostgREST answers from its schema cache with 404 PGRST205, so the
    # SQLSTATE codes alone miss the case where a whole migration hasn't run —
    # which is the common case, and used to report as UNKNOWN.
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
if [ "$(probe __no_such_table__ '*')" != "MISSING" ]; then
  echo "Probe self-test failed: a nonexistent table did not report MISSING." >&2
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

if printf '%s\n' "$SETTLED" | grep -q .; then
  echo
  echo "Settled by hand (no structure to probe; checked on the date shown)"
  echo
  printf '%s\n' "$SETTLED" | grep . | while IFS='|' read -r mig on what; do
    printf '  APPLIED  %s  (%s)\n' "$mig" "$on"
    printf '           %s\n' "$what"
  done
fi

if printf '%s\n' "$OPAQUE" | grep -q .; then
  echo
  echo "Still open (no structure to probe — paste into the SQL editor)"
  echo
  printf '%s\n' "$OPAQUE" | grep . | while IFS='|' read -r mig what sql; do
    printf '  CHECK BY HAND  %s\n' "$mig"
    printf '                 %s\n' "$what"
    printf '                 %s\n\n' "$sql"
  done
else
  echo
  echo "Nothing left to check by hand."
fi
