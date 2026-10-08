-- Threshold Salon -- hours for one day, without touching the week.
--
-- "Can she adjust her hours on any day she wants without changing the overall
-- schedule?" (Paul, 2026-10-08). Shorter was already possible with a block;
-- longer, or opening on a day she's normally closed, was not: the weekly rules
-- were the only thing online booking read.
--
--   day_hours        one row per date that differs from the week. Both times
--                    null = closed that day. No row = the usual week.
--   hours_on(date)   that date's opening windows: its own row if it has one,
--                    otherwise the weekly rules. The ONE place the rule lives.
--
-- get_available_slots (what the booking page offers) and create_booking (what
-- the database accepts) both read hours_on, so a time can't be offered and then
-- refused. create_booking below is production's live definition with only the
-- hours check changed -- taken from pg_get_functiondef on 2026-10-08, not
-- copied from 0020, so nothing that changed since is lost.
--
-- The studio's own booking form was never limited by hours (it notes "outside
-- your hours" and lets her book); it reads hours_on for that note now too.

begin;

create table if not exists public.day_hours (
  day         date primary key,
  start_time  time,
  end_time    time,
  created_at  timestamptz not null default now(),
  constraint day_hours_shape check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);

alter table public.day_hours enable row level security;

drop policy if exists day_hours_admin_all on public.day_hours;
create policy day_hours_admin_all on public.day_hours
  for all to authenticated using (true) with check (true);

create or replace function public.hours_on(p_day date)
returns table(start_time time, end_time time)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select h.start_time, h.end_time
    from public.day_hours h
   where h.day = p_day and h.start_time is not null
  union all
  select r.start_time, r.end_time
    from public.availability_rules r
   where r.active
     and r.weekday = extract(dow from p_day)::int
     and not exists (select 1 from public.day_hours h where h.day = p_day)
$$;

revoke all on function public.hours_on(date) from public, anon;
grant execute on function public.hours_on(date) to authenticated;

-- What the booking page offers: unchanged from 0012 but for where the hours come from.
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
      select h.start_time, h.end_time
        from public.hours_on(d) h
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

-- What the database accepts.
CREATE OR REPLACE FUNCTION public.create_booking(p_service_id uuid, p_starts_at timestamp with time zone, p_full_name text, p_email text, p_phone text, p_notes text DEFAULT NULL::text, p_stripe_customer_id text DEFAULT NULL::text, p_sms_consent boolean DEFAULT false, p_sms_marketing_consent boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    select 1 from public.hours_on(v_local::date) r
    where r.start_time <= v_local_time
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
end $function$;

commit;
