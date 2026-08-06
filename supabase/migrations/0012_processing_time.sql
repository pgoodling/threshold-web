-- Threshold Salon — processing time (gap time) on services.
--
-- A colour service isn't one solid block of Evelyn's attention. It's:
--
--     Start    she's applying          BUSY
--     Process  the colour develops     FREE   <- another client fits here
--     Finish   wash, cut, style        BUSY
--
-- Start is required. Process and Finish may be zero, which gives an ordinary
-- one-block service (a cut, a blowout) and is how every existing service is
-- backfilled. Total length is derived: start + process + finish.
--
-- THE IMPORTANT PART. Until now the database hard-guaranteed that no two
-- appointments could ever overlap, via a gist exclusion constraint on
-- appointments(tstzrange(starts_at, ends_at)). Processing time deliberately
-- breaks that guarantee — an overlap during the gap is the entire point. So the
-- guarantee moves DOWN a level: to `appointment_busy`, which holds the one or
-- two intervals an appointment actually occupies Evelyn. The exclusion
-- constraint lives there instead, maintained by trigger. Double-booking is
-- still impossible; it's just now measured against the segments she's busy for
-- rather than the whole appointment.
--
-- Per-appointment overrides exist because real developing time varies by head
-- of hair: appointments.start/process/finish_minutes are NULL by default and
-- fall back to the service. `block_processing` reserves the gap for herself.

begin;

-- ---------------------------------------------------------------------------
-- 1. Service segments. duration_minutes becomes derived.
-- ---------------------------------------------------------------------------

alter table public.services
  add column if not exists start_minutes   integer,
  add column if not exists process_minutes integer not null default 0,
  add column if not exists finish_minutes  integer not null default 0;

-- Existing services are all one solid block: their whole duration is "start".
update public.services
   set start_minutes = duration_minutes
 where start_minutes is null;

alter table public.services
  alter column start_minutes set not null,
  add constraint services_start_positive   check (start_minutes > 0),
  add constraint services_process_nonneg   check (process_minutes >= 0),
  add constraint services_finish_nonneg    check (finish_minutes >= 0);

-- Rebuild duration_minutes as a generated column so there is exactly one source
-- of truth for how long a service takes. Every existing read of
-- `duration_minutes` (create_booking, the booking UI, Reports) keeps working
-- untouched — it just can't drift from the segments any more.
alter table public.services drop column duration_minutes;
alter table public.services
  add column duration_minutes integer
    generated always as (start_minutes + process_minutes + finish_minutes) stored;

-- ---------------------------------------------------------------------------
-- 2. Per-appointment overrides
-- ---------------------------------------------------------------------------

alter table public.appointments
  add column if not exists start_minutes    integer,
  add column if not exists process_minutes  integer,
  add column if not exists finish_minutes   integer,
  add column if not exists block_processing boolean not null default false;

comment on column public.appointments.start_minutes is
  'NULL = inherit from the service. Set to override for this client.';
comment on column public.appointments.block_processing is
  'True = keep the processing gap for herself; the appointment blocks solid.';

-- ---------------------------------------------------------------------------
-- 3. The intervals Evelyn is actually busy for
-- ---------------------------------------------------------------------------

create table if not exists public.appointment_busy (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  check (ends_at > starts_at)
);

create index if not exists appointment_busy_appt_idx
  on public.appointment_busy (appointment_id);
create index if not exists appointment_busy_range_idx
  on public.appointment_busy using gist (tstzrange(starts_at, ends_at));

-- The double-booking guarantee, relocated. Rows only exist for appointments in
-- an occupying status, so no status predicate is needed here.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointment_busy_no_overlap'
  ) then
    alter table public.appointment_busy
      add constraint appointment_busy_no_overlap
      exclude using gist (tstzrange(starts_at, ends_at) with &&);
  end if;
end $$;

alter table public.appointment_busy enable row level security;

drop policy if exists appointment_busy_admin_all on public.appointment_busy;
create policy appointment_busy_admin_all on public.appointment_busy
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 4. Keeping it in sync
-- ---------------------------------------------------------------------------

-- Statuses that actually occupy Evelyn's day. Cancelled and no-show free it.
create or replace function public.status_occupies(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('booked','confirmed','checked_in','checked_out','completed')
$$;

create or replace function public.rebuild_appointment_busy(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a record;
begin
  delete from public.appointment_busy where appointment_id = p_id;

  select ap.starts_at,
         ap.ends_at,
         ap.status,
         ap.block_processing,
         coalesce(ap.start_minutes,   s.start_minutes)   as seg_start,
         coalesce(ap.process_minutes, s.process_minutes) as seg_process,
         coalesce(ap.finish_minutes,  s.finish_minutes)  as seg_finish
    into a
    from public.appointments ap
    join public.services s on s.id = ap.service_id
   where ap.id = p_id;

  if not found or not public.status_occupies(a.status) then
    return;
  end if;

  -- No gap, or she's keeping it: one solid block, exactly as before.
  if a.seg_process <= 0 or a.block_processing then
    insert into public.appointment_busy (appointment_id, starts_at, ends_at)
      values (p_id, a.starts_at, a.ends_at);
    return;
  end if;

  insert into public.appointment_busy (appointment_id, starts_at, ends_at)
    values (p_id, a.starts_at,
            a.starts_at + (a.seg_start || ' minutes')::interval);

  -- A service can legitimately end at the end of processing (she applies and
  -- the client leaves), in which case there is no second block.
  if a.seg_finish > 0 then
    insert into public.appointment_busy (appointment_id, starts_at, ends_at)
      values (p_id,
              a.starts_at + ((a.seg_start + a.seg_process) || ' minutes')::interval,
              a.ends_at);
  end if;
end $$;

-- ends_at is always derived from the segments, so it can never disagree with
-- them — including after a reschedule or a per-appointment override.
create or replace function public.appointments_set_span()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  select coalesce(new.start_minutes,   s.start_minutes)
       + coalesce(new.process_minutes, s.process_minutes)
       + coalesce(new.finish_minutes,  s.finish_minutes)
    into v_total
    from public.services s
   where s.id = new.service_id;

  if v_total is not null and v_total > 0 then
    new.ends_at := new.starts_at + (v_total || ' minutes')::interval;
  end if;
  return new;
end $$;

create or replace function public.appointments_sync_busy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.rebuild_appointment_busy(new.id);
  return null;
end $$;

drop trigger if exists appointments_set_span_trg on public.appointments;
create trigger appointments_set_span_trg
  before insert or update of starts_at, service_id,
                             start_minutes, process_minutes, finish_minutes
  on public.appointments
  for each row execute function public.appointments_set_span();

drop trigger if exists appointments_sync_busy_trg on public.appointments;
create trigger appointments_sync_busy_trg
  after insert or update of starts_at, ends_at, service_id, status,
                            start_minutes, process_minutes, finish_minutes,
                            block_processing
  on public.appointments
  for each row execute function public.appointments_sync_busy();

-- A service's segments changing re-shapes every future appointment using it.
-- This touches starts_at rather than calling rebuild directly, so BOTH triggers
-- fire: the appointment's ends_at is recomputed from the new segments first,
-- and only then are the busy blocks rebuilt. Calling rebuild on its own would
-- leave ends_at stale and compute the finish block against the old length.
create or replace function public.services_resync_busy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.appointments
     set starts_at = starts_at
   where service_id = new.id
     and ends_at > now()
     and public.status_occupies(status);
  return null;
end $$;

drop trigger if exists services_resync_busy_trg on public.services;
create trigger services_resync_busy_trg
  after update of start_minutes, process_minutes, finish_minutes
  on public.services
  for each row execute function public.services_resync_busy();

-- ---------------------------------------------------------------------------
-- 5. Retire the old whole-appointment constraint and backfill
-- ---------------------------------------------------------------------------

-- Must go: it would reject exactly the gap overlaps this feature exists for.
-- The guarantee now lives on appointment_busy.
alter table public.appointments drop constraint if exists appointments_no_overlap;

do $$
declare r record;
begin
  for r in select id from public.appointments loop
    perform public.rebuild_appointment_busy(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Public busy view — the gap must read as FREE
-- ---------------------------------------------------------------------------

create or replace view public.busy_times as
  select b.starts_at, b.ends_at
    from public.appointment_busy b
   where b.ends_at > now()
  union all
  select starts_at, ends_at from public.time_off
   where ends_at > now();

grant select on public.busy_times to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Segment-aware slot generation
-- ---------------------------------------------------------------------------

-- A candidate start is offered when EVERY interval this service would make
-- Evelyn busy for is clear — its own processing gap is allowed to sit on top of
-- another appointment's work, and vice versa. Time off still blocks the whole
-- span: a colour can't be developing while she's away.
create or replace function public.get_available_slots(
  p_service_id uuid,
  p_from       date,
  p_to         date
) returns table(slot timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz      text := 'America/New_York';
  v_start   interval;
  v_process interval;
  v_finish  interval;
  v_total   interval;
  v_step    interval := interval '30 minutes';
  v_ranges  tstzrange[];
  v_r       tstzrange;
  v_ok      boolean;
  d         date;
  r         record;
  t         time;
  s         timestamptz;
begin
  select (start_minutes   || ' minutes')::interval,
         (process_minutes || ' minutes')::interval,
         (finish_minutes  || ' minutes')::interval,
         (duration_minutes|| ' minutes')::interval
    into v_start, v_process, v_finish, v_total
    from public.services
   where id = p_service_id and active;
  if v_total is null then
    return;
  end if;

  if p_to - p_from > 62 then
    p_to := p_from + 62;
  end if;

  d := p_from;
  while d <= p_to loop
    for r in
      select start_time, end_time
        from public.availability_rules
       where active and weekday = extract(dow from d)::int
    loop
      t := r.start_time;
      while (t + v_total) <= r.end_time loop
        s := (d + t) at time zone v_tz;

        -- The intervals this booking would occupy her for.
        if v_process <= interval '0' then
          v_ranges := array[tstzrange(s, s + v_total)];
        else
          v_ranges := array[tstzrange(s, s + v_start)];
          if v_finish > interval '0' then
            v_ranges := v_ranges
              || tstzrange(s + v_start + v_process, s + v_total);
          end if;
        end if;

        v_ok := s > now()
          and not exists (
            select 1 from public.time_off o
             where tstzrange(o.starts_at, o.ends_at) && tstzrange(s, s + v_total)
          );

        if v_ok then
          foreach v_r in array v_ranges loop
            if exists (
              select 1 from public.appointment_busy b
               where tstzrange(b.starts_at, b.ends_at) && v_r
            ) then
              v_ok := false;
              exit;
            end if;
          end loop;
        end if;

        if v_ok then
          slot := s;
          return next;
        end if;
        t := t + v_step;
      end loop;
    end loop;
    d := d + 1;
  end loop;
end $$;

revoke all on function public.get_available_slots(uuid, date, date) from public;
grant execute on function public.get_available_slots(uuid, date, date) to anon, authenticated;

commit;
