-- Threshold Salon — close the anonymous write on hair notes, and let a note
-- stand on its own without a formula.
--
-- ── Why the anon policies go ──────────────────────────────────────────────
--
-- 0028 granted anon INSERT and UPDATE on appointment_intake with `using (true)
-- with check (true)`. The reasoning recorded there was about reading: no anon
-- SELECT, so a leaked link can't retrieve someone else's answers. That much was
-- right, and it's still true. The write side wasn't considered.
--
-- `using (true)` on an UPDATE grants every anonymous caller the right to modify
-- every row in the table — not only the one whose id they hold. The anon key is
-- public by design; it ships in the JavaScript bundle. So anyone who viewed
-- source could overwrite or falsify every client's hair notes.
--
-- No data could leak that way. But Evelyn reads these before a colour service,
-- and notes she can't trust are worse than no notes: a fabricated "no allergies"
-- is a real-world hazard, not a tidiness problem.
--
-- The fix is not a cleverer policy. Anonymous callers can't be scoped to their
-- own row without exposing a read they shouldn't have, so the write moves to
-- the server, where the appointment id can be checked before anything is
-- written. /api/hair-notes does that with the service-role key, the same shape
-- as /api/appointments/cancel. Nothing anonymous touches this table again.

begin;

drop policy if exists intake_anon_write on public.appointment_intake;
drop policy if exists intake_anon_update on public.appointment_intake;

-- Authenticated (Evelyn) keeps full access; that policy is unchanged. Client
-- submissions now arrive through the service-role key, which bypasses RLS, so
-- the table needs no anon policy at all.

comment on table public.appointment_intake is
  'What the client told us about their hair, one row per appointment. Written '
  'ONLY by /api/hair-notes using the service-role key — never directly by the '
  'browser. Do not add an anon policy here: an anon write cannot be scoped to '
  'a single row without granting a read that would expose other clients.';

-- ── A note without a formula ──────────────────────────────────────────────
--
-- `formula` was NOT NULL, so the studio form refused to record "pulled warm,
-- 35 min, go cooler next time" unless a formula was retyped alongside it. The
-- observation is often the whole point, and the formula hasn't changed.
--
-- Now either may stand alone, but a row with neither is meaningless, so the
-- check requires at least one.

alter table public.client_formulas
  alter column formula drop not null;

alter table public.client_formulas
  drop constraint if exists client_formulas_not_empty;

alter table public.client_formulas
  add constraint client_formulas_not_empty
  check (
    nullif(btrim(formula), '') is not null
    or nullif(btrim(note), '') is not null
  );

comment on column public.client_formulas.formula is
  'What she mixed. Null when the entry is an observation about an existing '
  'formula rather than a new one — see client_formulas_not_empty.';

commit;
