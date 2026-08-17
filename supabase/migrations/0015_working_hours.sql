-- Threshold Salon — seed Evelyn's working hours, but never overwrite them.
--
-- Monday 9–7, Tuesday 9–7, Friday 9–6, Saturday 9–5.
--
-- IMPORTANT: this is a SEED, not a reset. Evelyn manages her hours herself in
-- /studio (Settings → weekly schedule), and by the time this migration runs she
-- may well have already set them — she had, when this was written, including a
-- Thursday that isn't in the list above. An earlier version of this file did
-- `delete from availability_rules` first, which would have silently dropped
-- that Thursday and quietly stopped Thursday bookings.
--
-- So: if any rule already exists, the studio is the source of truth and this
-- does nothing. It only populates an empty table.
--
-- This table — not the `hours` list rendered on app/page.tsx — is what decides
-- which slots the booking page offers and what create_booking accepts. If the
-- two disagree, clients read one set of hours and are offered another. Whenever
-- the schedule changes, change it in BOTH places.
--
-- weekday follows Postgres `extract(dow)`: 0 = Sunday … 6 = Saturday.

begin;

insert into public.availability_rules (weekday, start_time, end_time, active)
select * from (values
  (1, '09:00'::time, '19:00'::time, true),  -- Monday    9am – 7pm
  (2, '09:00'::time, '19:00'::time, true),  -- Tuesday   9am – 7pm
  (5, '09:00'::time, '18:00'::time, true),  -- Friday    9am – 6pm
  (6, '09:00'::time, '17:00'::time, true)   -- Saturday  9am – 5pm
) as seed(weekday, start_time, end_time, active)
where not exists (select 1 from public.availability_rules);

commit;
