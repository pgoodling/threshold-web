-- Threshold Salon — DEMO DATA (for Evelyn to run the app like a real, busy day).
--
-- Builds a lived-in book: ~40 clients, ~14 weeks of past history (completed,
-- no-shows, cancellations) and ~4 weeks of upcoming appointments — all computed
-- RELATIVE TO THE DAY YOU RUN IT, so "today" and "this week" are always full.
-- Some clients are intentionally "lapsed" (no visit in 9+ weeks) so the Tasks
-- reach-out list has people in it.
--
-- Safe to re-run: it clears the previous demo run first. Every demo client uses
-- an @example.com email so they're easy to spot and remove.
--
-- REQUIRES migrations 0001–0006 to have run first (it uses the check-in/out
-- statuses + payment columns added in 0006).
--
-- TO REMOVE ALL DEMO DATA LATER, run just these two lines:
--   delete from appointments where client_id in (select id from clients where email like '%@example.com');
--   delete from clients where email like '%@example.com';

begin;

-- 1) Clear any previous demo run.
delete from appointments where client_id in (select id from clients where email like '%@example.com');
delete from clients where email like '%@example.com';

-- 2) Demo clients — varied notes, birthdays, and a mix of women & men.
insert into clients (full_name, email, phone, birthday, notes) values
  ('Ava Bennett',      'ava@example.com',      '937-555-0110', '1991-04-12', 'Rooted balayage, cool tones. Olaplex every visit. Books ~8 wks.'),
  ('Sophia Martinez',  'sophia@example.com',   '937-555-0111', '1988-09-30', 'Vivid copper-red maintenance. Gloss every 6 wks. Sensitive scalp.'),
  ('Emma Johnson',     'emma@example.com',     '937-555-0112', '1995-01-22', 'Fine hair, wants volume. No layers too short. Loves a blowout.'),
  ('Olivia Davis',     'olivia@example.com',   '937-555-0113', '1979-11-05', 'Gray blending, natural low-maintenance look.'),
  ('Isabella Wilson',  'isabella@example.com', '937-555-0114', '1993-06-18', 'Curly, Deva-style dry cut. Sulfate-free only.'),
  ('Mia Thompson',     'mia@example.com',      '937-555-0115', '1990-03-27', 'Blonde balayage, toner 9V. Allergic to PPD — patch test done.'),
  ('Charlotte Lee',    'charlotte@example.com','937-555-0116', '1985-12-02', 'Brunette dimensional with caramel. Every 8 wks like clockwork.'),
  ('Amelia Clark',     'amelia@example.com',   '937-555-0117', '1998-07-14', 'Pixie, every 4 wks. Loves texture and a bit of edge.'),
  ('Harper Lewis',     'harper@example.com',   '937-555-0118', NULL,         'Long layers, keratin smoothing treatments seasonally.'),
  ('Grace Walker',     'grace@example.com',    '937-555-0119', '1992-02-09', 'Money-piece + face-framing highlights. Warm blonde.'),
  ('Liam Carter',      'liam@example.com',     '937-555-0120', '1987-08-21', 'Men''s taper, every 3 wks. Quick in-and-out.'),
  ('Noah Reed',        'noah@example.com',     '937-555-0121', NULL,         'Men''s scissor cut, textured top. Beard trim add-on.'),
  ('Zoe Mitchell',     'zoe@example.com',      '937-555-0122', '1996-05-08', 'Wavy lob, air-dry finish. Hates heavy product.'),
  ('Lily Nguyen',      'lily@example.com',     '937-555-0123', '1994-10-19', 'Jet-black to soft brunette transition — going slowly.'),
  ('Hannah Foster',    'hannah@example.com',   '937-555-0124', '1983-03-14', 'Full highlights + gloss. Runs warm, prefers ashier tones.'),
  ('Natalie Brooks',   'natalie@example.com',  '937-555-0125', '2001-01-30', 'College student, budget-conscious. Trims + occasional balayage.'),
  ('Chloe Rivera',     'chloe@example.com',    '937-555-0126', '1989-07-27', 'Shoulder-length, lots of layers. Big curly blowouts for events.'),
  ('Addison Ward',     'addison@example.com',  '937-555-0127', NULL,         'Grown-out balayage, wants a reset. Considering a bob.'),
  ('Layla Perry',      'layla@example.com',    '937-555-0128', '1997-09-03', 'Textured curls, loves a deep-conditioning treatment add-on.'),
  ('Scarlett Hughes',  'scarlett@example.com', '937-555-0129', '1986-12-21', 'Rich red, fades fast — gloss every 4 wks to keep it vivid.'),
  ('Victoria Coleman', 'victoria@example.com', '937-555-0130', '1975-06-06', 'Elegant silver blending. Prefers morning appointments.'),
  ('Aria Simmons',     'aria@example.com',     '937-555-0131', '1999-04-25', 'Fashion colors occasionally (pink/lavender). Bleach history — go gentle.'),
  ('Penelope Barnes',  'penelope@example.com', '937-555-0132', '1991-11-11', 'Classic blonde highlights, keeps it natural. Very loyal.'),
  ('Nora Jenkins',     'nora@example.com',     '937-555-0133', NULL,         'Low-maintenance mom cut, easy to style at home.'),
  ('Owen Fisher',      'owen@example.com',     '937-555-0134', '1990-08-17', 'Men''s fade + beard line-up. Every 2–3 wks.'),
  ('Caleb Morgan',     'caleb@example.com',    '937-555-0135', '1984-02-28', 'Longer men''s style, scissor over comb. Chats a lot — book buffer.'),
  ('Stella Powell',    'stella@example.com',   '937-555-0136', '1993-05-16', 'Cool-toned balayage. Toner every visit, no brassiness ever.'),
  ('Ruby Sanders',     'ruby@example.com',     '937-555-0137', '1988-10-02', 'Copper pixie. Bold and low-maintenance. Every 5 wks.'),
  ('Aurora Bennett',   'aurora@example.com',   '937-555-0138', '1992-07-09', 'Moved farther away — used to come every 6 wks. Warm balayage.'),
  ('Savannah Cross',   'savannah@example.com', '937-555-0139', NULL,         'Had a baby last year — schedule''s been tricky. Long layers.'),
  ('Brooklyn Hayes',   'brooklyn@example.com', '937-555-0140', '1996-01-18', 'Tried a box color once (never again). Correction client — patient.'),
  ('Bella Russell',    'bella@example.com',    '937-555-0141', '1982-09-12', 'Classic bob, sharp lines. Was every 6 wks; hasn''t rebooked.'),
  ('Claire Diaz',      'claire@example.com',   '937-555-0142', '1987-03-05', 'Full foils. Busy travel schedule, comes when she can.'),
  ('Skylar Watson',    'skylar@example.com',   '937-555-0143', '2000-11-27', 'Long healthy hair, just dusting the ends. Loves treatments.'),
  ('Lucy Bennett',     'lucy@example.com',     '937-555-0144', '1994-06-30', 'Soft blonde, money-piece. Switched from another stylist.'),
  ('Ethan Price',      'ethan@example.com',    '937-555-0145', '1991-12-15', 'Men''s cut, classic side part. Prefers Saturdays.'),
  ('Mason Cole',       'mason@example.com',    '937-555-0146', NULL,         'Men''s buzz + beard. Quick, in and out. Was a regular.'),
  ('James Turner',     'james@example.com',    '937-555-0147', '1979-04-08', 'Older gentleman, scissor cut. Great tipper. Hasn''t been in a while.'),
  ('Oliver Gray',      'oliver@example.com',   '937-555-0148', '1998-08-24', 'Textured crop, students'' rate. Sporadic.'),
  ('Ivy Hunt',         'ivy@example.com',      '937-555-0149', '1985-05-19', 'Long balayage, big transformation last spring. Loved it — lost touch.');

-- 3) Appointments: evergreen, relative to CURRENT_DATE.
do $$
declare
  tz          text := 'America/New_York';

  -- Full client roster (order must match the inserts above).
  all_emails  text[] := array[
    'ava@example.com','sophia@example.com','emma@example.com','olivia@example.com',
    'isabella@example.com','mia@example.com','charlotte@example.com','amelia@example.com',
    'harper@example.com','grace@example.com','liam@example.com','noah@example.com',
    'zoe@example.com','lily@example.com','hannah@example.com','natalie@example.com',
    'chloe@example.com','addison@example.com','layla@example.com','scarlett@example.com',
    'victoria@example.com','aria@example.com','penelope@example.com','nora@example.com',
    'owen@example.com','caleb@example.com','stella@example.com','ruby@example.com',
    'aurora@example.com','savannah@example.com','brooklyn@example.com','bella@example.com',
    'claire@example.com','skylar@example.com','lucy@example.com','ethan@example.com',
    'mason@example.com','james@example.com','oliver@example.com','ivy@example.com'];

  -- The first 28 are "regulars" — they fill recent + upcoming days. The rest only
  -- appear in older history, so they read as lapsed (reach-out list).
  reg_emails  text[] := (array[
    'ava@example.com','sophia@example.com','emma@example.com','olivia@example.com',
    'isabella@example.com','mia@example.com','charlotte@example.com','amelia@example.com',
    'harper@example.com','grace@example.com','liam@example.com','noah@example.com',
    'zoe@example.com','lily@example.com','hannah@example.com','natalie@example.com',
    'chloe@example.com','addison@example.com','layla@example.com','scarlett@example.com',
    'victoria@example.com','aria@example.com','penelope@example.com','nora@example.com',
    'owen@example.com','caleb@example.com','stella@example.com','ruby@example.com']);

  -- Daily schedule templates (non-overlapping, inside working hours).
  -- Weekday (Tue–Fri, 9–7): 6 slots.
  wk_times    text[] := array['09:00','10:15','12:30','13:30','16:45','17:45'];
  wk_svcs     text[] := array['Cut and Style','Custom Color','Men''s Cuts','Custom Highlights','Blowouts','Treatments'];
  -- Saturday (9–4): 5 slots, ends by 3pm.
  sat_times   text[] := array['09:00','10:15','11:15','13:30','14:30'];
  sat_svcs    text[] := array['Cut and Style','Men''s Cuts','Custom Color','Blowouts','Treatments'];

  note_pool   text[] := array[
    'Wants to go a touch lighter around the face.',
    'Bring inspo photos — thinking a softer, lived-in look.',
    'Add a bond-building treatment this visit.',
    'Running 5 min late, texted ahead.',
    'Special occasion next week — wants it to last.',
    'Ends feeling dry, discuss a gloss.',
    'Growing out layers — just a shape-up.',
    'Loved the tone last time, keep it the same.'];

  off_i    int;
  d        date;
  dow      int;
  t_times  text[];
  t_svcs   text[];
  n        int;
  j        int;
  fill     numeric;
  pool     text[];
  ts       timestamptz;
  cid      uuid;
  sid      uuid;
  dur      int;
  price    int;
  st       text;
  note     text;
  end_ts   timestamptz;
  paid     int;
  pm       text;
  r        numeric;
  pmr      numeric;
begin
  -- Walk each day from ~14 weeks ago to ~4 weeks out.
  for off_i in 0..126 loop
    d   := (current_date - 98) + off_i;
    dow := extract(dow from d)::int;

    -- Closed Sunday (0) and Monday (1).
    if dow in (0, 1) then
      continue;
    end if;

    if dow = 6 then
      t_times := sat_times; t_svcs := sat_svcs;
    else
      t_times := wk_times;  t_svcs := wk_svcs;
    end if;

    -- Busier now than in the past; today nearly full.
    fill := case
              when d = current_date then 0.9
              when d > current_date then 0.75
              else 0.6
            end;

    -- Recent + future days draw from regulars; only old days include the lapsed.
    pool := case when d < current_date - 63 then all_emails else reg_emails end;

    n := array_length(t_times, 1);
    for j in 1..n loop
      if random() > fill then
        continue;
      end if;

      ts := (d + (t_times[j])::time) at time zone tz;

      select id into cid
        from clients
        where email = pool[1 + floor(random() * array_length(pool, 1))::int];

      select id, duration_minutes, price_cents into sid, dur, price
        from services where name = t_svcs[j];

      if cid is null or sid is null then
        continue;
      end if;

      end_ts := ts + make_interval(mins => dur);
      paid := null;
      pm := null;

      -- Finished slots are checked out (paid); the one spanning "now" is in the
      -- chair (checked in); the rest are still on the books.
      if end_ts <= now() then
        r := random();
        if r < 0.86 then
          st := 'checked_out';
          -- occasional tip on top of the service price
          paid := price + (array[0, 0, 0, 500, 1000, 1500, 2000])[1 + floor(random() * 7)::int];
          pmr := random();
          pm := case
                  when pmr < 0.68 then 'card'
                  when pmr < 0.80 then 'cash'
                  when pmr < 0.90 then 'venmo'
                  when pmr < 0.97 then 'zelle'
                  else 'other'
                end;
        elsif r < 0.93 then
          st := 'no_show';
        else
          st := 'cancelled';
        end if;
      elsif ts <= now() and end_ts > now() then
        st := 'checked_in';
      else
        st := case when random() < 0.70 then 'booked' else 'confirmed' end;
      end if;

      note := case
                when random() < 0.18 then note_pool[1 + floor(random() * array_length(note_pool, 1))::int]
                else null
              end;

      -- Skip a slot only if it would collide with a real appointment already
      -- in the calendar (demo slots never overlap each other).
      begin
        insert into appointments (
          client_id, service_id, starts_at, ends_at, status, price_cents, notes,
          paid_cents, payment_method, checked_in_at, checked_out_at
        )
        values (
          cid, sid, ts, end_ts, st, price, note,
          paid, pm,
          case when st = 'checked_in' then ts end,
          case when st = 'checked_out' then end_ts end
        );
      exception
        when exclusion_violation then
          null;
      end;
    end loop;
  end loop;
end $$;

commit;
