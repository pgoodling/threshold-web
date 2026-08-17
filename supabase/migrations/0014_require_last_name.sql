-- Threshold Salon — require a last name when booking.
--
-- The booking form now asks for first and last name separately (they're joined
-- into the single `full_name` the schema already stores), but the form is just
-- the browser. `create_booking` is callable by `anon` directly, so the rule has
-- to live here too or it's decoration.
--
-- Why it matters: two clients named Sarah are indistinguishable in the calendar,
-- which shows first names only, and client identity (migration 0010) matches on
-- phone + FIRST name — so a household sharing a phone needs surnames to stay
-- separate people.
--
-- Existing single-name clients are left alone. This only governs new bookings.

begin;

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
  v_name       text := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
begin
  if length(v_name) = 0 then
    raise exception 'A name is required to book.' using errcode = 'check_violation';
  end if;
  -- Two words minimum. Splitting on whitespace rather than counting spaces so
  -- "Mary  Jane Watson" and tabs behave.
  if array_length(string_to_array(v_name, ' '), 1) < 2 then
    raise exception 'Please give both a first and last name.' using errcode = 'check_violation';
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
  v_name_key  := public.normalize_first_name(v_name);

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
        values (v_name, nullif(p_email, ''), nullif(p_phone, ''),
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

commit;
