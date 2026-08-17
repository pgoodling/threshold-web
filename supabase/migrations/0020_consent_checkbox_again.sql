-- Threshold Salon — the appointment checkbox governs consent again.
--
-- 0019 derived appointment-text consent from the presence of a phone number,
-- on the (correct) reading that under the TCPA, giving a business your mobile
-- number to book is prior express consent for messages about that booking.
--
-- That reasoning still holds legally. It does not hold for A2P campaign
-- vetting, which applies CTIA best practice rather than the legal minimum:
-- Twilio's web-form opt-in requirements state plainly that there must be a
-- "Checkbox for consent (must NOT be pre-selected)" that is "actively selected
-- by the user". Describing a checkbox to the reviewer and not having one on the
-- page is a rejection, and each rejection costs another 10–15 day cycle.
--
-- So the box is back on the booking form, and this makes the database agree
-- with it: consent for NEW web bookings comes from the tick, not the number.
--
-- What this deliberately does NOT undo: the 0019 backfill. Clients who were
-- already in the book keep their `provided_at_booking` consent. They gave that
-- number to make appointments, that reasoning was sound, and re-litigating it
-- would silently stop reminders for her entire existing client list.
--
-- Evelyn can still record consent for phone and in-person bookings herself; it
-- is stored with its own source so each population stays distinguishable.

begin;

create or replace function public.create_booking(
  p_service_id           uuid,
  p_starts_at            timestamptz,
  p_full_name            text,
  p_email                text,
  p_phone                text,
  p_notes                text default null,
  p_stripe_customer_id   text default null,
  p_sms_consent          boolean default false,
  p_sms_marketing_consent boolean default false
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
  v_name       text := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  -- The tick is the consent. A phone number alone no longer implies it — see
  -- the note at the top of this migration for why that changed back.
  v_consent    timestamptz := case when p_sms_consent then now() end;
  v_source     text        := case when p_sms_consent then 'booking_form' end;
  v_mkt        timestamptz := case when p_sms_marketing_consent then now() else null end;
begin
  if length(v_name) = 0 then
    raise exception 'A name is required to book.' using errcode = 'check_violation';
  end if;
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

  v_phone_key := public.normalize_phone_key(p_phone);
  v_name_key  := public.normalize_first_name(v_name);

  if v_phone_key is not null and v_name_key is not null then
    select id into v_client_id from public.clients
      where phone_key = v_phone_key and first_name_key = v_name_key;
  end if;

  if v_client_id is null and coalesce(p_email, '') <> '' then
    select id into v_client_id from public.clients where lower(email) = lower(p_email);
  end if;

  if v_client_id is null then
    begin
      insert into public.clients
          (full_name, email, phone, stripe_customer_id,
           sms_consent_at, sms_consent_source,
           sms_marketing_consent_at, sms_marketing_consent_source)
        values (v_name, nullif(p_email, ''), nullif(p_phone, ''),
                nullif(p_stripe_customer_id, ''),
                v_consent, v_source,
                v_mkt,
                case when p_sms_marketing_consent then 'booking_form' end)
        returning id into v_client_id;
    exception when unique_violation then
      select id into v_client_id from public.clients
        where (phone_key = v_phone_key and first_name_key = v_name_key)
           or (coalesce(p_email, '') <> '' and lower(email) = lower(p_email))
        limit 1;
      if v_client_id is null then raise; end if;
    end;
  else
    update public.clients set
      email              = coalesce(email, nullif(p_email, '')),
      phone              = coalesce(phone, nullif(p_phone, '')),
      stripe_customer_id = coalesce(nullif(p_stripe_customer_id, ''), stripe_customer_id),
      -- Booking again refreshes the proof. Never clears an existing one, and
      -- never overrides a STOP — the send path checks sms_opt_out separately.
      sms_consent_at     = coalesce(v_consent, sms_consent_at),
      sms_consent_source = coalesce(v_source, sms_consent_source),
      sms_marketing_consent_at = coalesce(v_mkt, sms_marketing_consent_at),
      sms_marketing_consent_source = case
        when p_sms_marketing_consent then 'booking_form'
        else sms_marketing_consent_source end
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

revoke all on function public.create_booking(uuid, timestamptz, text, text, text, text, text, boolean, boolean) from public;
grant execute on function public.create_booking(uuid, timestamptz, text, text, text, text, text, boolean, boolean) to anon, authenticated;

commit;
