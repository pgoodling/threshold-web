-- Threshold Salon — Evelyn's actual working hours.
--
-- Monday 9–7, Tuesday 9–7, Friday 9–6, Saturday 9–5. Closed Wed, Thu, Sun.
--
-- This has to move in lockstep with the `hours` list rendered on the marketing
-- page (app/page.tsx). That list is only text; THIS table is what actually
-- decides which slots the booking page offers and what `create_booking` accepts
-- ("That time is outside working hours"). If the two disagree, clients read one
-- set of hours on the site and get offered another in the booking calendar.
--
-- The seed in 0001 was Tue–Fri 9–7 plus Sat 9–4, which no longer matches how
-- she works: Monday is now a working day, Wed/Thu are off, and Friday and
-- Saturday both end earlier.
--
-- Evelyn can still change all of this herself in /studio (Settings → weekly
-- schedule); this migration just sets the correct starting point.
--
-- weekday follows Postgres `extract(dow)`: 0 = Sunday … 6 = Saturday.

begin;

-- Replace the schedule wholesale rather than patching rows, so a stale rule for
-- a now-closed day (Wednesday, Thursday) can't survive and keep taking bookings.
delete from public.availability_rules;

insert into public.availability_rules (weekday, start_time, end_time, active) values
  (1, '09:00', '19:00', true),  -- Monday    9am – 7pm
  (2, '09:00', '19:00', true),  -- Tuesday   9am – 7pm
  (5, '09:00', '18:00', true),  -- Friday    9am – 6pm
  (6, '09:00', '17:00', true);  -- Saturday  9am – 5pm

commit;
