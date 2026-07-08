-- Threshold Salon — Phase 2: let create_booking store the Stripe customer id
-- on the client, so a saved card links to the client record.
-- Adds an optional p_stripe_customer_id param (backward compatible — existing
-- 6-arg callers still work via the default).

begin;

drop function if exists public.create_booking(uuid, timestamptz, text, text, text, text);

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
    where r.active and r.weekday = v_dow
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

  if coalesce(p_email, '') <> '' then
    select id into v_client_id from public.clients where lower(email) = lower(p_email);
  end if;
  if v_client_id is null then
    insert into public.clients (full_name, email, phone, stripe_customer_id)
      values (trim(p_full_name), nullif(p_email, ''), nullif(p_phone, ''),
              nullif(p_stripe_customer_id, ''))
      returning id into v_client_id;
  elsif nullif(p_stripe_customer_id, '') is not null then
    update public.clients set stripe_customer_id = p_stripe_customer_id
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
