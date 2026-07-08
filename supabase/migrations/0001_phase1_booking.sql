-- Threshold Salon — Phase 1 schema: booking MVP + admin
-- Safe to run on the `threshold-salon` Supabase project (NOT the golf project).
-- Idempotent-ish: uses IF NOT EXISTS / ON CONFLICT so re-running won't error.
--
-- Security model (important):
--   * The PUBLIC booking pages use the anon key. They can only READ services,
--     working hours, and busy time-ranges (no client names/PII), and BOOK via a
--     single SECURITY DEFINER function. They cannot read the clients or
--     appointments tables directly.
--   * Evelyn's /studio admin uses an authenticated login and has full access.
--   * All PII lives behind RLS; the public never sees another client's data.

-- Timezone the salon operates in (Kettering, OH). Used to interpret working hours.
-- If this ever changes, update it here and in get_available* logic.

begin;

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Services offered. Prices in integer cents. `price_is_from` = "starting at".
create table if not exists public.services (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  description      text,
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents      integer not null check (price_cents >= 0),
  price_is_from    boolean not null default true,
  deposit_cents    integer not null default 0 check (deposit_cents >= 0), -- Phase 2
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

-- Weekly recurring working hours. weekday uses Postgres dow: 0=Sun ... 6=Sat.
create table if not exists public.availability_rules (
  id         uuid primary key default gen_random_uuid(),
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  active     boolean not null default true,
  check (end_time > start_time)
);

-- One-off blocks (vacation, personal time). Kept private (reason not exposed).
create table if not exists public.time_off (
  id        uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text,
  check (ends_at > starts_at)
);

-- Clients. Auto-created on first booking; deduped by lowercased email.
create table if not exists public.clients (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null,
  email              text,
  phone              text,
  notes              text,
  birthday           date,
  stripe_customer_id text,                         -- Phase 2
  created_at         timestamptz not null default now()
);
create unique index if not exists clients_email_lower_idx
  on public.clients (lower(email)) where email is not null;

-- Appointments.
create table if not exists public.appointments (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  service_id     uuid not null references public.services(id),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         text not null default 'booked'
                   check (status in ('booked','confirmed','completed','no_show','cancelled')),
  price_cents    integer,
  deposit_status text not null default 'none'
                   check (deposit_status in ('none','pending','paid','refunded')), -- Phase 2
  notes          text,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists appointments_starts_at_idx on public.appointments (starts_at);
create index if not exists appointments_client_idx on public.appointments (client_id);

-- Hard guarantee: no two active appointments can overlap (single stylist).
-- Prevents double-booking even under concurrent requests.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_no_overlap'
  ) then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (tstzrange(starts_at, ends_at) with &&)
      where (status in ('booked','confirmed','completed'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.services           enable row level security;
alter table public.availability_rules enable row level security;
alter table public.time_off           enable row level security;
alter table public.clients            enable row level security;
alter table public.appointments       enable row level security;

-- services: public can read ACTIVE services; Evelyn (authenticated) full control.
drop policy if exists services_public_read on public.services;
create policy services_public_read on public.services
  for select to anon, authenticated using (active = true);

drop policy if exists services_admin_all on public.services;
create policy services_admin_all on public.services
  for all to authenticated using (true) with check (true);

-- availability_rules: public can read (to compute open slots); Evelyn full control.
drop policy if exists availability_public_read on public.availability_rules;
create policy availability_public_read on public.availability_rules
  for select to anon, authenticated using (true);

drop policy if exists availability_admin_all on public.availability_rules;
create policy availability_admin_all on public.availability_rules
  for all to authenticated using (true) with check (true);

-- time_off: only Evelyn. Public sees busy ranges via the busy_times view instead.
drop policy if exists time_off_admin_all on public.time_off;
create policy time_off_admin_all on public.time_off
  for all to authenticated using (true) with check (true);

-- clients & appointments: only Evelyn has direct access. Public books via RPC.
drop policy if exists clients_admin_all on public.clients;
create policy clients_admin_all on public.clients
  for all to authenticated using (true) with check (true);

drop policy if exists appointments_admin_all on public.appointments;
create policy appointments_admin_all on public.appointments
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Public read surface for the booking UI (no PII)
-- ---------------------------------------------------------------------------

-- Only exposes busy start/end ranges so the UI can grey out taken times.
-- Runs with definer rights (bypasses RLS) but selects no identifying columns.
create or replace view public.busy_times as
  select starts_at, ends_at from public.appointments
    where status in ('booked','confirmed','completed') and ends_at > now()
  union all
  select starts_at, ends_at from public.time_off
    where ends_at > now();

grant select on public.busy_times to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Booking function (the only way the public can write)
-- ---------------------------------------------------------------------------

create or replace function public.create_booking(
  p_service_id uuid,
  p_starts_at  timestamptz,
  p_full_name  text,
  p_email      text,
  p_phone      text,
  p_notes      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz            text := 'America/New_York';
  v_service       public.services%rowtype;
  v_ends_at       timestamptz;
  v_local         timestamp;      -- wall-clock time in the salon's timezone
  v_dow           smallint;
  v_local_time    time;
  v_client_id     uuid;
  v_appt_id       uuid;
begin
  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'A name is required to book.' using errcode = 'check_violation';
  end if;
  if coalesce(p_email, '') = '' and coalesce(p_phone, '') = '' then
    raise exception 'An email or phone number is required to book.' using errcode = 'check_violation';
  end if;

  select * into v_service from public.services where id = p_service_id and active;
  if not found then
    raise exception 'That service is not available.' using errcode = 'no_data_found';
  end if;

  v_ends_at := p_starts_at + (v_service.duration_minutes || ' minutes')::interval;

  if p_starts_at <= now() then
    raise exception 'Please choose a time in the future.' using errcode = 'check_violation';
  end if;

  -- Must fall entirely within a working-hours rule for that weekday.
  v_local      := p_starts_at at time zone v_tz;
  v_dow        := extract(dow from v_local)::smallint;
  v_local_time := v_local::time;
  if not exists (
    select 1 from public.availability_rules r
    where r.active
      and r.weekday = v_dow
      and r.start_time <= v_local_time
      and r.end_time   >= (v_ends_at at time zone v_tz)::time
  ) then
    raise exception 'That time is outside working hours.' using errcode = 'check_violation';
  end if;

  -- Reject if it collides with time off (appointment overlaps are caught by the
  -- exclusion constraint on insert).
  if exists (
    select 1 from public.time_off t
    where tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, v_ends_at)
  ) then
    raise exception 'That time is not available.' using errcode = 'check_violation';
  end if;

  -- Find or create the client (dedupe by email when provided).
  if coalesce(p_email, '') <> '' then
    select id into v_client_id from public.clients where lower(email) = lower(p_email);
  end if;
  if v_client_id is null then
    insert into public.clients (full_name, email, phone)
      values (trim(p_full_name), nullif(p_email, ''), nullif(p_phone, ''))
      returning id into v_client_id;
  end if;

  insert into public.appointments (client_id, service_id, starts_at, ends_at, price_cents, notes)
    values (v_client_id, v_service.id, p_starts_at, v_ends_at, v_service.price_cents, nullif(p_notes, ''))
    returning id into v_appt_id;

  return jsonb_build_object(
    'appointment_id', v_appt_id,
    'service',        v_service.name,
    'starts_at',      p_starts_at,
    'ends_at',        v_ends_at
  );
exception
  when exclusion_violation then
    raise exception 'Sorry, that time was just booked. Please pick another.' using errcode = 'check_violation';
end $$;

-- The public may only EXECUTE the booking function, nothing else.
revoke all on function public.create_booking(uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.create_booking(uuid, timestamptz, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed data (from the live site — Evelyn can edit later in /studio)
-- ---------------------------------------------------------------------------

insert into public.services (name, description, duration_minutes, price_cents, price_is_from, sort_order) values
  ('Custom Highlights', 'Balayage, foils, and lived-in dimension, including seamless gray blending.', 180, 10500, true, 1),
  ('Custom Color',      'All-over color, root touch-ups, and glosses with gentle, professional-grade formulas.', 120, 9000, true, 2),
  ('Cut and Style',     'A precision cut shaped to your hair type, texture, and lifestyle.', 60, 5500, true, 3),
  ('Treatments',        'Deep conditioning, bond-building, and scalp care, customized to your hair''s needs.', 30, 3500, true, 4),
  ('Blowouts',          'A smooth, voluminous finish for events, date nights, or any day.', 45, 4500, true, 5),
  ('Men''s Cuts',       'Clean, tailored cuts and styling, from classic tapers to relaxed looks.', 45, 5000, true, 6)
on conflict (name) do nothing;

-- Working hours: Tue–Fri 9am–7pm, Sat 9am–4pm, Sun/Mon closed (matches the site).
insert into public.availability_rules (weekday, start_time, end_time) values
  (2, '09:00', '19:00'),  -- Tuesday
  (3, '09:00', '19:00'),  -- Wednesday
  (4, '09:00', '19:00'),  -- Thursday
  (5, '09:00', '19:00'),  -- Friday
  (6, '09:00', '16:00')   -- Saturday
on conflict do nothing;

commit;
