-- Threshold Salon — Phase 1, part 2: server-side open-slot generation.
-- All timezone/DST math lives here in Postgres (reliable) so the browser never
-- has to compute Eastern-time offsets. The booking UI just renders what this
-- returns and passes the chosen slot straight back to create_booking().

begin;

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
  v_tz   text := 'America/New_York';
  v_dur  interval;
  v_step interval := interval '30 minutes';   -- booking grid granularity
  d      date;
  r      record;
  t      time;
  s      timestamptz;
  e      timestamptz;
begin
  select (duration_minutes || ' minutes')::interval
    into v_dur
    from public.services
   where id = p_service_id and active;
  if v_dur is null then
    return;                       -- unknown/inactive service -> no slots
  end if;

  -- Safety cap: never scan more than ~9 weeks in one call.
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
      while (t + v_dur) <= r.end_time loop
        s := (d + t) at time zone v_tz;   -- interpret wall-clock as Eastern
        e := s + v_dur;
        if s > now()
           and not exists (
             select 1 from public.appointments a
              where a.status in ('booked','confirmed','completed')
                and tstzrange(a.starts_at, a.ends_at) && tstzrange(s, e)
           )
           and not exists (
             select 1 from public.time_off o
              where tstzrange(o.starts_at, o.ends_at) && tstzrange(s, e)
           )
        then
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
