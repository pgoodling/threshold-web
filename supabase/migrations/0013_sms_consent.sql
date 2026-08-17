-- Threshold Salon — explicit SMS consent capture.
--
-- Until now the only consent signal was `clients.sms_opt_out`, which defaults
-- to false — i.e. implied consent for everyone who ever booked. A2P 10DLC
-- campaign vetting asks how end users consent to receive messages and requires
-- explicit, provable opt-in, so implied consent isn't good enough: it's a
-- realistic campaign-rejection reason and each rejection costs another
-- multi-week vetting round trip.
--
-- This records the positive signal alongside the negative one:
--   sms_consent_at     — when she ticked the box (null = never consented)
--   sms_consent_source — where it came from, so in-person consent can be
--                        recorded later without pretending it was the website
--
-- The exact disclosure wording shown at booking lives in lib/smsConsent.ts and
-- is dated by git history, which is the audit trail for what a client agreed
-- to on a given day.
--
-- Note on revocation: consent is only withdrawn by STOP (handled by
-- /api/sms/inbound) or by Evelyn clearing it by hand. A returning client who
-- leaves the box unticked on a later booking is ambiguous, not a withdrawal,
-- so prior consent is left standing.

begin;

alter table public.clients
  add column if not exists sms_consent_at     timestamptz,
  add column if not exists sms_consent_source text;

comment on column public.clients.sms_consent_at is
  'When this client explicitly agreed to receive texts. Null = no consent on record; do not send automated messages.';
comment on column public.clients.sms_consent_source is
  'Where the consent was captured, e.g. booking_form, in_person.';

-- Find who may be texted without scanning the table.
create index if not exists clients_sms_consent_at_idx
  on public.clients (sms_consent_at)
  where sms_consent_at is not null;

-- ---------------------------------------------------------------------------
-- create_booking: carry the consent tick through from the booking form
-- ---------------------------------------------------------------------------

-- Adding a parameter changes the signature, so the old 7-arg version has to go
-- rather than sit alongside as an ambiguous overload (same dance as 0004).
drop function if exists public.create_booking(uuid, timestamptz, text, text, text, text, text);

create or replace function public.create_booking(
  p_service_id         uuid,
  p_starts_at          timestamptz,
  p_full_name          text,
  p_email              text,
  p_phone              text,
  p_notes              text default null,
  p_stripe_customer_id text default null,
  p_sms_consent        boolean default false
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
  v_consent    timestamptz := case when p_sms_consent then now() else null end;
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
      insert into public.clients
          (full_name, email, phone, stripe_customer_id,
           sms_consent_at, sms_consent_source)
        values (trim(p_full_name), nullif(p_email, ''), nullif(p_phone, ''),
                nullif(p_stripe_customer_id, ''),
                v_consent,
                case when p_sms_consent then 'booking_form' end)
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
      stripe_customer_id = coalesce(nullif(p_stripe_customer_id, ''), stripe_customer_id),
      -- Ticking the box again refreshes the proof to this booking. Leaving it
      -- unticked never clears consent already given — only STOP does that.
      sms_consent_at     = coalesce(v_consent, sms_consent_at),
      sms_consent_source = case
        when p_sms_consent then 'booking_form' else sms_consent_source end
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

revoke all on function public.create_booking(uuid, timestamptz, text, text, text, text, text, boolean) from public;
grant execute on function public.create_booking(uuid, timestamptz, text, text, text, text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- merge_client: don't lose consent when two rows for one person are merged
-- ---------------------------------------------------------------------------

-- Same function as 0010, with the two new columns carried across. Keeps the
-- MOST RECENT consent (the freshest proof) and the source that goes with it.
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
  v_consent  timestamptz;
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

  v_consent := greatest(v_survivor.sms_consent_at, v_loser.sms_consent_at);

  update public.clients set
    email              = coalesce(v_survivor.email, v_loser.email),
    phone              = coalesce(v_survivor.phone, v_loser.phone),
    birthday           = coalesce(v_survivor.birthday, v_loser.birthday),
    hair_formula       = coalesce(nullif(trim(v_survivor.hair_formula), ''), v_loser.hair_formula),
    stripe_customer_id = coalesce(v_survivor.stripe_customer_id, v_loser.stripe_customer_id),
    -- Opt-out is sticky: if either row said STOP, the merged client stays out.
    sms_opt_out        = v_survivor.sms_opt_out or v_loser.sms_opt_out,
    sms_consent_at     = v_consent,
    sms_consent_source = case
      when v_consent is null then null
      when v_consent = v_survivor.sms_consent_at then v_survivor.sms_consent_source
      else v_loser.sms_consent_source
    end,
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

commit;
