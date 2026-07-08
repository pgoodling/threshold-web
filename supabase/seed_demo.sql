-- Threshold Salon — DEMO DATA (for Evelyn to preview a populated app).
-- Safe to re-run (it clears prior demo data first). All demo clients use
-- @example.com emails so they're easy to identify and remove.
--
-- TO REMOVE ALL DEMO DATA LATER, run just these two lines:
--   delete from appointments where client_id in (select id from clients where email like '%@example.com');
--   delete from clients where email like '%@example.com';

begin;

-- 1) Clear any previous demo run (appointments cascade from clients, but be explicit)
delete from appointments where client_id in (select id from clients where email like '%@example.com');
delete from clients where email like '%@example.com';

-- 2) Demo clients (varied notes + birthdays to show off the CRM)
insert into clients (full_name, email, phone, birthday, notes) values
  ('Ava Bennett',      'ava@example.com',      '937-555-0110', '1991-04-12', 'Rooted balayage, cool tones. Olaplex every visit. Books ~8 wks.'),
  ('Sophia Martinez',  'sophia@example.com',   '937-555-0111', '1988-09-30', 'Vivid copper-red maintenance. Gloss every 6 wks. Sensitive scalp.'),
  ('Emma Johnson',     'emma@example.com',      '937-555-0112', '1995-01-22', 'Fine hair, wants volume. No layers too short. Loves a blowout.'),
  ('Olivia Davis',     'olivia@example.com',    '937-555-0113', '1979-11-05', 'Gray blending, natural low-maintenance look.'),
  ('Isabella Wilson',  'isabella@example.com',  '937-555-0114', '1993-06-18', 'Curly, Deva-style dry cut. Sulfate-free only.'),
  ('Mia Thompson',     'mia@example.com',       '937-555-0115', '1990-03-27', 'Blonde balayage, toner 9V. Allergic to PPD — patch test done.'),
  ('Charlotte Lee',    'charlotte@example.com', '937-555-0116', '1985-12-02', 'Brunette dimensional with caramel. Every 8 wks like clockwork.'),
  ('Amelia Clark',     'amelia@example.com',    '937-555-0117', '1998-07-14', 'Pixie, every 4 wks. Loves texture and a bit of edge.'),
  ('Harper Lewis',     'harper@example.com',    '937-555-0118', NULL,         'Long layers, keratin smoothing treatments seasonally.'),
  ('Grace Walker',     'grace@example.com',     '937-555-0119', '1992-02-09', 'Money-piece + face-framing highlights. Warm blonde.'),
  ('Liam Carter',      'liam@example.com',      '937-555-0120', '1987-08-21', 'Men''s taper, every 3 wks. Quick in-and-out.'),
  ('Noah Reed',        'noah@example.com',      '937-555-0121', NULL,         'Men''s scissor cut, textured top. Beard trim add-on.');

-- 3) Demo appointments: past (completed / no-show / cancelled) + upcoming.
do $$
declare
  tz      text := 'America/New_York';
  emails  text[] := array[
    'ava@example.com','sophia@example.com','emma@example.com','olivia@example.com',
    'isabella@example.com','mia@example.com','charlotte@example.com','amelia@example.com',
    'harper@example.com','grace@example.com','liam@example.com','noah@example.com'];
  svcs    text[] := array['Custom Highlights','Custom Color','Cut and Style','Treatments','Blowouts','Men''s Cuts'];
  times   text[] := array['09:00','10:30','13:00','15:00','11:00','14:30'];
  i       int;
  cid     uuid;
  sid     uuid;
  dur     int;
  price   int;
  ts      timestamptz;
  st      text;
begin
  -- Completed visits over the last ~3 months (one per distinct day => no overlaps)
  for i in 1..28 loop
    select id into cid from clients where email = emails[1 + (i % 12)];
    select id, duration_minutes, price_cents into sid, dur, price
      from services where name = svcs[1 + (i % 6)];
    ts := ((current_date - (i * 3) * interval '1 day')::date
           + (times[1 + (i % 6)])::time) at time zone tz;
    insert into appointments (client_id, service_id, starts_at, ends_at, status, price_cents)
      values (cid, sid, ts, ts + make_interval(mins => dur), 'completed', price);
  end loop;

  -- A handful of no-shows (allowed to overlap; not counted as active)
  for i in 1..6 loop
    select id into cid from clients where email = emails[1 + ((i * 2) % 12)];
    select id, duration_minutes, price_cents into sid, dur, price
      from services where name = svcs[1 + (i % 6)];
    ts := ((current_date - (i * 11) * interval '1 day')::date + time '12:00') at time zone tz;
    insert into appointments (client_id, service_id, starts_at, ends_at, status, price_cents)
      values (cid, sid, ts, ts + make_interval(mins => dur), 'no_show', price);
  end loop;

  -- A few cancellations
  for i in 1..4 loop
    select id into cid from clients where email = emails[1 + ((i * 3) % 12)];
    select id, duration_minutes, price_cents into sid, dur, price
      from services where name = svcs[1 + (i % 6)];
    ts := ((current_date - (i * 17) * interval '1 day')::date + time '16:00') at time zone tz;
    insert into appointments (client_id, service_id, starts_at, ends_at, status, price_cents)
      values (cid, sid, ts, ts + make_interval(mins => dur), 'cancelled', price);
  end loop;

  -- Upcoming schedule: today + next few weeks (distinct future days => no overlaps)
  for i in 0..10 loop
    select id into cid from clients where email = emails[1 + (i % 12)];
    select id, duration_minutes, price_cents into sid, dur, price
      from services where name = svcs[1 + (i % 6)];
    ts := ((current_date + (i * 2) * interval '1 day')::date
           + (times[1 + (i % 6)])::time) at time zone tz;
    st := case when i % 3 = 0 then 'confirmed' else 'booked' end;
    insert into appointments (client_id, service_id, starts_at, ends_at, status, price_cents)
      values (cid, sid, ts, ts + make_interval(mins => dur), st, price);
  end loop;
end $$;

commit;
