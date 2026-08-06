-- Threshold Salon — client identity: match returning clients by PHONE.
--
-- Until now `create_booking` deduped on lowercased email only, while the
-- booking form requires phone and leaves email optional. A regular who books
-- without typing an email got a brand-new client row every visit, so her
-- lifecycle stage and the rebooking rate were computed off a blank history.
--
-- The matching rule, in order:
--   1. same phone (last 10 digits) AND same first name  → same person, reuse
--   2. else same lowercased email                       → same person, reuse
--   3. else                                             → new client
--
-- Phone alone is deliberately NOT enough: spouses, teens, and roommates share a
-- number, and silently welding a mother and daughter into one chair history is
-- far harder to untangle than a duplicate. Same-phone/different-name pairs show
-- up in the `possible_duplicate_clients` view for Evelyn to merge by hand.

begin;

-- ---------------------------------------------------------------------------
-- Normalizers (immutable so generated columns can use them)
-- ---------------------------------------------------------------------------

-- Last 10 digits of a US number, so "937-555-0110", "(937) 555-0110" and
-- "+19375550110" all collapse to "9375550110". Anything shorter than 10 digits
-- is junk and yields null (never matches). Mirrors last10() in lib/phone.ts.
create or replace function public.normalize_phone_key(p text)
returns text language sql immutable as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10
      then right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
    else null
  end
$$;

-- First token of the full name, lowercased and stripped to letters:
-- "Sarah-Jane Miller" -> "sarahjane", " evelyn " -> "evelyn".
-- Exact match only — no nickname folding. "Sam" and "Samantha" on one phone
-- stay separate; the failure mode is a duplicate (mergeable) rather than a
-- wrong merge (not really reversible).
create or replace function public.normalize_first_name(p text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(lower(split_part(trim(coalesce(p, '')), ' ', 1)), '[^a-z]', '', 'g'),
    ''
  )
$$;

alter table public.clients
  add column if not exists phone_key text
    generated always as (public.normalize_phone_key(phone)) stored,
  add column if not exists first_name_key text
    generated always as (public.normalize_first_name(full_name)) stored;

-- ---------------------------------------------------------------------------
-- Merge history (so a merge can be audited or hand-reversed)
-- ---------------------------------------------------------------------------

create table if not exists public.client_merges (
  id                  uuid primary key default gen_random_uuid(),
  survivor_id         uuid references public.clients(id) on delete set null,
  merged_client       jsonb not null,   -- full row of the deleted duplicate
  appointments_moved  integer not null default 0,
  messages_moved      integer not null default 0,
  tasks_moved         integer not null default 0,
  merged_at           timestamptz not null default now()
);

alter table public.client_merges enable row level security;

drop policy if exists client_merges_admin_all on public.client_merges;
create policy client_merges_admin_all on public.client_merges
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Merge two client rows into one
-- ---------------------------------------------------------------------------

-- Moves every appointment, message, and task off the duplicate, fills any gap
-- in the survivor's details from it, records what happened, then deletes it.
create or replace function public.merge_client(p_survivor uuid, p_loser uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_survivor public.clients%rowtype;
  v_loser    public.clients%rowtype;
  n_appt     integer;
  n_msg      integer;
  n_task     integer;
begin
  if p_survivor = p_loser then
    raise exception 'Cannot merge a client into herself.' using errcode = 'check_violation';
  end if;

  -- Lock both rows in a stable order so two concurrent merges can't deadlock.
  perform 1 from public.clients
    where id in (p_survivor, p_loser) order by id for update;

  select * into v_survivor from public.clients where id = p_survivor;
  if not found then
    raise exception 'Client to keep was not found.' using errcode = 'no_data_found';
  end if;
  select * into v_loser from public.clients where id = p_loser;
  if not found then
    raise exception 'Duplicate client was not found.' using errcode = 'no_data_found';
  end if;

  update public.appointments set client_id = p_survivor where client_id = p_loser;
  get diagnostics n_appt = row_count;
  update public.messages     set client_id = p_survivor where client_id = p_loser;
  get diagnostics n_msg = row_count;
  update public.tasks        set client_id = p_survivor where client_id = p_loser;
  get diagnostics n_task = row_count;

  insert into public.client_merges
      (survivor_id, merged_client, appointments_moved, messages_moved, tasks_moved)
    values (p_survivor, to_jsonb(v_loser), n_appt, n_msg, n_task);

  -- Delete before updating: the duplicate still holds the unique email (and
  -- phone+name) keys we're about to move onto the survivor.
  delete from public.clients where id = p_loser;

  update public.clients set
    email              = coalesce(v_survivor.email, v_loser.email),
    phone              = coalesce(v_survivor.phone, v_loser.phone),
    birthday           = coalesce(v_survivor.birthday, v_loser.birthday),
    hair_formula       = coalesce(nullif(trim(v_survivor.hair_formula), ''), v_loser.hair_formula),
    stripe_customer_id = coalesce(v_survivor.stripe_customer_id, v_loser.stripe_customer_id),
    -- Opt-out is sticky: if either row said STOP, the merged client stays out.
    sms_opt_out        = v_survivor.sms_opt_out or v_loser.sms_opt_out,
    notes              = case
      when coalesce(nullif(trim(v_loser.notes), ''), '') = ''    then v_survivor.notes
      when coalesce(nullif(trim(v_survivor.notes), ''), '') = '' then v_loser.notes
      else v_survivor.notes || E'\n\n' || v_loser.notes
    end,
    -- Keep the earlier signup date so "client since" and lifecycle stay honest.
    created_at         = least(v_survivor.created_at, v_loser.created_at)
  where id = p_survivor;

  return jsonb_build_object(
    'survivor_id',        p_survivor,
    'merged_id',          p_loser,
    'appointments_moved', n_appt,
    'messages_moved',     n_msg,
    'tasks_moved',        n_task
  );
end $$;

revoke all on function public.merge_client(uuid, uuid) from public, anon;
grant execute on function public.merge_client(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Clean up the duplicates already in the table
-- ---------------------------------------------------------------------------

-- Only collapses rows that are unambiguous under the new rule: identical phone
-- AND identical first name. The oldest row wins so "client since" is preserved.
create or replace function public.dedupe_clients_by_phone_name()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g          record;
  v_survivor uuid;
  v_losers   uuid[];
  v_loser    uuid;
  n          integer := 0;
begin
  for g in
    select phone_key, first_name_key
      from public.clients
     where phone_key is not null and first_name_key is not null
     group by phone_key, first_name_key
    having count(*) > 1
  loop
    select id into v_survivor from public.clients
      where phone_key = g.phone_key and first_name_key = g.first_name_key
      order by created_at, id
      limit 1;

    select array_agg(id order by created_at, id) into v_losers
      from public.clients
     where phone_key = g.phone_key and first_name_key = g.first_name_key
       and id <> v_survivor;

    foreach v_loser in array coalesce(v_losers, '{}'::uuid[]) loop
      perform public.merge_client(v_survivor, v_loser);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.dedupe_clients_by_phone_name() from public, anon;
grant execute on function public.dedupe_clients_by_phone_name() to authenticated;

select public.dedupe_clients_by_phone_name();

-- Now that the table is clean, make the rule structural: the same person can
-- only exist once. This is what stops a duplicate from ever being created
-- again, including by a race between two simultaneous bookings.
create unique index if not exists clients_phone_name_idx
  on public.clients (phone_key, first_name_key)
  where phone_key is not null and first_name_key is not null;

-- Used by the inbound-SMS lookup (replaces a full table scan).
create index if not exists clients_phone_key_idx
  on public.clients (phone_key) where phone_key is not null;

-- ---------------------------------------------------------------------------
-- Same phone, different first name — for Evelyn to eyeball
-- ---------------------------------------------------------------------------

-- Usually a real household (mother + daughter, couple). Occasionally a nickname
-- ("Sam" / "Samantha") that should be merged. Never merged automatically.
create or replace view public.possible_duplicate_clients as
  select a.id            as client_id,
         a.full_name     as client_name,
         b.id            as other_id,
         b.full_name     as other_name,
         a.phone         as shared_phone,
         a.created_at    as client_since,
         b.created_at    as other_since
    from public.clients a
    join public.clients b
      on a.phone_key = b.phone_key
     and a.id < b.id
   where a.phone_key is not null;

revoke all on public.possible_duplicate_clients from public, anon;
grant select on public.possible_duplicate_clients to authenticated;

-- ---------------------------------------------------------------------------
-- create_booking: match on phone + first name, then email, then create
-- ---------------------------------------------------------------------------

create or replace function public.create_booking(
  p_service_id         uuid,
  p_starts_at          timestamptz,
  p_full_name          text,
  p_email              text,
  p_phone              text,
  p_notes              text default null,
  p_stripe_customer_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz         text := 'America/New_York';
  v_service    public.services%rowtype;
  v_ends_at    timestamptz;
  v_local      timestamp;
  v_dow        smallint;
  v_local_time time;
  v_client_id  uuid;
  v_appt_id    uuid;
  v_phone_key  text;
  v_name_key   text;
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

  if exists (
    select 1 from public.time_off t
    where tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, v_ends_at)
  ) then
    raise exception 'That time is not available.' using errcode = 'check_violation';
  end if;

  -- ---- Who is this? -------------------------------------------------------
  v_phone_key := public.normalize_phone_key(p_phone);
  v_name_key  := public.normalize_first_name(p_full_name);

  -- 1. Phone + first name. Phone is the required field on the booking form, so
  --    this is the match that actually fires for most returning clients.
  if v_phone_key is not null and v_name_key is not null then
    select id into v_client_id from public.clients
      where phone_key = v_phone_key and first_name_key = v_name_key;
  end if;

  -- 2. Fall back to email (covers a client booking from a new number).
  if v_client_id is null and coalesce(p_email, '') <> '' then
    select id into v_client_id from public.clients where lower(email) = lower(p_email);
  end if;

  if v_client_id is null then
    -- 3. New client. A concurrent booking may have just inserted the same
    --    person, so fall back to reading their row instead of failing.
    begin
      insert into public.clients (full_name, email, phone, stripe_customer_id)
        values (trim(p_full_name), nullif(p_email, ''), nullif(p_phone, ''),
                nullif(p_stripe_customer_id, ''))
        returning id into v_client_id;
    exception when unique_violation then
      select id into v_client_id from public.clients
        where (phone_key = v_phone_key and first_name_key = v_name_key)
           or (coalesce(p_email, '') <> '' and lower(email) = lower(p_email))
        limit 1;
      if v_client_id is null then raise; end if;
    end;
  else
    -- Known client: fill in anything her file is missing, but never overwrite
    -- details Evelyn may have corrected by hand in /studio.
    update public.clients set
      email              = coalesce(email, nullif(p_email, '')),
      phone              = coalesce(phone, nullif(p_phone, '')),
      stripe_customer_id = coalesce(nullif(p_stripe_customer_id, ''), stripe_customer_id)
    where id = v_client_id;
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

revoke all on function public.create_booking(uuid, timestamptz, text, text, text, text, text) from public;
grant execute on function public.create_booking(uuid, timestamptz, text, text, text, text, text) to anon, authenticated;

commit;
