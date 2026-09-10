-- Threshold Salon — move the schedule email onto a clock Evelyn can set.
--
-- The digest shipped on a Vercel cron: "0 11 * * *" in vercel.json. That works
-- until she wants it at half six, because a Vercel schedule is fixed at deploy
-- and the Hobby plan allows one run per day at hour precision. A time picker in
-- Settings over that arrangement would have been a control that does nothing,
-- which is worse than no control at all.
--
-- So the job runs HOURLY here, and the route decides whether this is her hour
-- by comparing the clock to salon_settings.digest_hour. She changes a number in
-- the studio and the next run obeys it — no deploy, nothing to reschedule.
--
-- Same mechanism 0025 used for the late-arrival sweep, which 0032 later
-- removed. pg_cron and pg_net are already installed on this project because of
-- it; this is the second tenant, not the first.
--
-- Two more things fall out of running hourly rather than daily:
--   * The route is now idempotent-by-hour rather than idempotent-by-day, and
--     an hour it isn't wanted costs one cheap 200 that sends nothing.
--   * Daylight saving stops mattering. Postgres schedules in UTC like Vercel
--     does, but because the ROUTE checks the salon's local hour, 7am stays 7am
--     in January without anybody editing a cron expression.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: unschedule before scheduling, so re-running this doesn't stack
-- two jobs both firing every hour.
do $$
begin
  perform cron.unschedule('threshold-digest');
exception
  when others then null;
end;
$$;

-- The secret and the site URL live in Postgres settings rather than being
-- pasted into the command, so rotating CRON_SECRET is one ALTER DATABASE and
-- not an edit to a scheduled job nobody remembers exists.
--
-- Set these once, as the postgres role, before the job can work:
--
--   alter database postgres set app.site_url  = 'https://threshold.salon';
--   alter database postgres set app.cron_secret = '<the CRON_SECRET value>';
--
-- They must match the CRON_SECRET in Vercel exactly, or every run comes back
-- 401 and the digest silently stops. That is the first thing to check if she
-- says the email stopped arriving.
select cron.schedule(
  'threshold-digest',
  '0 * * * *',
  $job$
  select net.http_post(
    url     := current_setting('app.site_url', true) || '/api/cron/digest',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
               ),
    body    := '{}'::jsonb
  );
  $job$
);

commit;

-- To check it:   select jobname, schedule, active from cron.job where jobname = 'threshold-digest';
-- To see runs:   select status, return_message, start_time from cron.job_run_details
--                  where jobid = (select jobid from cron.job where jobname = 'threshold-digest')
--                  order by start_time desc limit 10;
-- To stop it:    select cron.unschedule('threshold-digest');
