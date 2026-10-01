-- Threshold Salon — let Evelyn book over an appointment, on purpose.
--
-- Since 0012 the rule has been absolute: no two busy blocks may overlap
-- (appointment_busy_no_overlap). That's what stops online booking ever
-- double-booking her, and it also stops HER — a bang trim squeezed in, a
-- regular who'll wait, a visit stretched into the next one.
--
-- Now she can, in the studio, after a warning that names who it overlaps.
-- An appointment she confirms gets allow_overlap = true, and its busy blocks
-- carry overlap_ok = true.
--
-- The rule becomes two:
--
--   1. The exclusion constraint now covers only blocks WITHOUT overlap_ok.
--      Ordinary bookings still can't overlap each other, concurrency-safe as
--      before.
--
--   2. A new ONLINE booking may not land on a deliberate overlap. Without
--      this, the constraint ignoring flagged blocks would let a client book
--      on top of one. It's checked only when an online appointment is
--      created — never when an existing appointment's blocks are rebuilt,
--      because checking in a client she deliberately booked over must not
--      fail. create_booking already turns an exclusion violation into "that
--      time was just booked", so the guard raises one.
--
-- Safe to run twice.

begin;

alter table public.appointments
  add column if not exists allow_overlap boolean not null default false;

comment on column public.appointments.allow_overlap is
  'Evelyn chose to book this over another appointment, after a warning. Studio '
  'only; online booking never sets it and never books into this time.';

alter table public.appointment_busy
  add column if not exists overlap_ok boolean not null default false;

-- 1. The constraint, narrowed to ordinary blocks.
alter table public.appointment_busy drop constraint if exists appointment_busy_no_overlap;
alter table public.appointment_busy
  add constraint appointment_busy_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at) with &&) where (not overlap_ok);

-- 2. A new online booking may not land on a deliberate overlap.
--    AFTER INSERT, and named to sort after appointments_sync_busy_trg, so this
--    appointment's busy blocks already exist when it looks.
drop trigger if exists appointment_busy_guard_trg on public.appointment_busy;
drop function if exists public.appointment_busy_guard();

create or replace function public.appointments_online_overlap_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source = 'online' and exists (
    select 1
      from public.appointment_busy mine
      join public.appointment_busy other
        on other.overlap_ok
       and other.appointment_id <> mine.appointment_id
       and tstzrange(other.starts_at, other.ends_at) && tstzrange(mine.starts_at, mine.ends_at)
     where mine.appointment_id = new.id
  ) then
    raise exception using
      errcode = '23P01', -- exclusion_violation: create_booking's "just booked"
      message = 'That time overlaps another appointment.';
  end if;
  return new;
end $$;

drop trigger if exists appointments_zz_online_overlap_guard on public.appointments;
create trigger appointments_zz_online_overlap_guard
  after insert on public.appointments
  for each row execute function public.appointments_online_overlap_guard();

-- The busy blocks carry the appointment's flag.
create or replace function public.rebuild_appointment_busy(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a record;
begin
  delete from public.appointment_busy where appointment_id = p_id;

  select ap.starts_at,
         ap.ends_at,
         ap.status,
         ap.block_processing,
         ap.allow_overlap,
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

  -- No gap, or she's keeping it: one solid block.
  if a.seg_process <= 0 or a.block_processing then
    insert into public.appointment_busy (appointment_id, starts_at, ends_at, overlap_ok)
      values (p_id, a.starts_at, a.ends_at, a.allow_overlap);
    return;
  end if;

  insert into public.appointment_busy (appointment_id, starts_at, ends_at, overlap_ok)
    values (p_id, a.starts_at,
            a.starts_at + (a.seg_start || ' minutes')::interval, a.allow_overlap);

  -- A service can legitimately end at the end of processing, with no second block.
  if a.seg_finish > 0 then
    insert into public.appointment_busy (appointment_id, starts_at, ends_at, overlap_ok)
      values (p_id,
              a.starts_at + ((a.seg_start + a.seg_process) || ' minutes')::interval,
              a.ends_at, a.allow_overlap);
  end if;
end $function$;

-- Rebuild when the flag changes, as well as everything that already did.
drop trigger if exists appointments_sync_busy_trg on public.appointments;
create trigger appointments_sync_busy_trg
  after insert or update of starts_at, ends_at, service_id, status,
    start_minutes, process_minutes, finish_minutes, block_processing, allow_overlap
  on public.appointments
  for each row execute function public.appointments_sync_busy();

commit;
