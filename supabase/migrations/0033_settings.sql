-- Threshold Salon — the decisions Evelyn couldn't reach.
--
-- Every column here was a constant in a file she can't edit: the cancellation
-- window in lib/policy.ts, quiet hours in lib/sms.ts, the reminder lookahead in
-- the cron, what counts as short notice for her booking alert, the digest hour
-- in vercel.json. All of them are decisions about how her salon runs, and none
-- of them were hers.
--
-- Typed columns on the existing single-row table, following 0031's reasoning:
-- a key/value store would take any setting without a migration, which sounds
-- like an advantage until something reads 'nine' out of a column meant to hold
-- an hour.
--
-- Defaults are the current hardcoded values exactly, so applying this changes
-- no behaviour on its own. The one exception is min_booking_notice_minutes,
-- which had no previous value because there was no such rule — see the trigger
-- at the bottom.

begin;

alter table public.salon_settings
  -- Her morning schedule email.
  add column if not exists digest_enabled boolean not null default true,
  add column if not exists digest_hour smallint not null default 7
    check (digest_hour between 0 and 23),
  add column if not exists digest_include_money boolean not null default true,

  -- The short-notice booking alert to her handset.
  add column if not exists booking_alert_enabled boolean not null default true,
  add column if not exists booking_alert_hours smallint not null default 24
    check (booking_alert_hours between 1 and 168),

  -- What clients receive.
  add column if not exists sms_automation_enabled boolean not null default true,
  add column if not exists confirmations_enabled boolean not null default true,
  add column if not exists reminders_enabled boolean not null default true,
  add column if not exists reminder_lookahead_hours smallint not null default 36
    check (reminder_lookahead_hours between 1 and 168),
  add column if not exists quiet_start_hour smallint not null default 9
    check (quiet_start_hour between 0 and 23),
  add column if not exists quiet_end_hour smallint not null default 20
    check (quiet_end_hour between 1 and 24),

  -- Booking rules.
  add column if not exists cancel_notice_hours smallint not null default 24
    check (cancel_notice_hours between 0 and 168),
  add column if not exists min_booking_notice_minutes integer not null default 120
    check (min_booking_notice_minutes between 0 and 20160),
  add column if not exists max_booking_days_ahead integer not null default 84
    check (max_booking_days_ahead between 1 and 730);

comment on column public.salon_settings.digest_hour is
  'Hour, salon local time, that the schedule email goes out. Read by the '
  'hourly pg_cron job rather than baked into a schedule — which is the whole '
  'reason that job is hourly.';

comment on column public.salon_settings.sms_automation_enabled is
  'Evelyn''s switch for all automated texting. The SMS_AUTOMATION_ENABLED env '
  'var still gates it as well, and BOTH must be on: the env var is an '
  'operator kill switch that survives anything she does in the UI, this is '
  'her preference. Never collapse them into one.';

comment on column public.salon_settings.quiet_end_hour is
  'Exclusive: 20 means nothing goes out from 20:00 onward. 24 means midnight.';

comment on column public.salon_settings.min_booking_notice_minutes is
  'How far ahead a client booking online must be. This did not exist before — '
  'create_booking only refused times already in the past, so a stranger could '
  'take a three-hour highlight twenty minutes from now. Enforced by trigger '
  'below, not in create_booking, so it applies to every write path and that '
  'function did not have to be redefined a tenth time.';

comment on column public.salon_settings.cancel_notice_hours is
  'Free-cancellation window. Quoted to clients when they book, so changing it '
  'must not rewrite what someone was already promised — appointments carry '
  'their own copy (cancel_notice_hours on appointments) and this is only the '
  'value stamped onto NEW bookings.';

-- The window a client was actually promised, frozen at booking.
--
-- Without this, shortening the window in March would retroactively shorten it
-- for someone who booked in February under different terms — and they would
-- find out at the moment they tried to cancel, which is the worst possible
-- moment to discover the rules changed.
--
-- Null means "booked before this existed": the cancel route falls back to the
-- current setting for those, which is the behaviour they already had.
alter table public.appointments
  add column if not exists cancel_notice_hours smallint;

comment on column public.appointments.cancel_notice_hours is
  'The free-cancellation window this client was quoted when they booked. Null '
  'for appointments made before 0033 — fall back to salon_settings for those.';

-- ---------------------------------------------------------------------------
-- Booking-window enforcement
-- ---------------------------------------------------------------------------

-- A trigger rather than another create_booking redefinition.
--
-- create_booking has been rewritten nine times, each copy carrying the whole
-- body forward, and every copy is a chance to drop a check that was added in
-- one of the others. This is two rules; they don't need the whole function
-- restated to hold.
--
-- It also means the rules apply to any write path, not just the public RPC —
-- while deliberately exempting the studio. `source = 'studio'` is Evelyn
-- booking someone herself, and she is allowed to say yes to a client standing
-- in front of her at ten to five.
create or replace function public.enforce_booking_window()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_min_minutes integer;
  v_max_days    integer;
  v_cancel      smallint;
begin
  select min_booking_notice_minutes, max_booking_days_ahead, cancel_notice_hours
    into v_min_minutes, v_max_days, v_cancel
    from public.salon_settings where id;

  -- No settings row is not a reason to refuse a booking.
  if not found then return new; end if;

  -- Stamp the promise, whoever booked it, so the client is told and held to
  -- the same number.
  if new.cancel_notice_hours is null then
    new.cancel_notice_hours := v_cancel;
  end if;

  if coalesce(new.source, 'online') = 'studio' then
    return new;
  end if;

  if new.starts_at < now() + make_interval(mins => v_min_minutes) then
    raise exception 'That time is too soon to book online. Please call the salon.'
      using errcode = 'check_violation';
  end if;

  if new.starts_at > now() + make_interval(days => v_max_days) then
    raise exception 'That date is further ahead than we take bookings.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists appointments_booking_window on public.appointments;
create trigger appointments_booking_window
  before insert on public.appointments
  for each row execute function public.enforce_booking_window();

commit;
