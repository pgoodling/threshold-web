-- Threshold Salon — Check-in / Check-out lifecycle + payment capture.
-- Safe to run on the `threshold-salon` project. Run this BEFORE re-running
-- seed_demo.sql (the demo now uses the new 'checked_out' status).
--
-- Replaces the single "Completed" action with:
--   booked → confirmed → checked_in (arrived) → checked_out (paid & done)
-- and records what was paid + how, so Reports can reconcile against Intuit.

begin;

-- 1) Allow the two new lifecycle statuses (keep the old ones for back-compat).
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check
  check (status in (
    'booked','confirmed','checked_in','checked_out','completed','no_show','cancelled'
  ));

-- 2) Payment + timing captured at check-in / check-out.
alter table public.appointments add column if not exists paid_cents      integer;
alter table public.appointments add column if not exists payment_method  text;
alter table public.appointments add column if not exists checked_in_at   timestamptz;
alter table public.appointments add column if not exists checked_out_at  timestamptz;

-- 3) Keep the no-overlap guard covering the in-progress / paid states too, so a
--    checked-in or checked-out slot still blocks a new booking on top of it.
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at) with &&)
  where (status in ('booked','confirmed','checked_in','checked_out','completed'));

-- 4) Public busy-times must treat the new active states as busy.
create or replace view public.busy_times as
  select starts_at, ends_at from public.appointments
    where status in ('booked','confirmed','checked_in','checked_out','completed')
      and ends_at > now()
  union all
  select starts_at, ends_at from public.time_off
    where ends_at > now();
grant select on public.busy_times to anon, authenticated;

-- 5) Migrate existing history: 'completed' becomes 'checked_out' (paid).
update public.appointments
  set status         = 'checked_out',
      checked_out_at = coalesce(checked_out_at, ends_at),
      paid_cents     = coalesce(paid_cents, price_cents)
  where status = 'completed';

commit;
