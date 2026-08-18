-- Threshold Salon — schedule the late-arrival sweep in Postgres.
--
-- "Still on your way?" is only useful within a few minutes of someone being
-- due. Vercel's free plan runs cron once a day, which for this job is worse
-- than not running at all: it would fire at one arbitrary moment and look
-- broken. Supabase Cron (pg_cron + pg_net) is already in the stack, free, and
-- schedules at whatever interval we like.
--
-- PREREQUISITE: the shared secret must exist in Vault under the name
-- 'cron_secret', holding the SAME value as CRON_SECRET in Vercel. Without it
-- the Authorization header is malformed and every run gets a 401.
--
--   select vault.create_secret('<the-same-value-as-vercel>', 'cron_secret',
--                              'Bearer token for the /api/cron/* endpoints');
--
-- Storing it in Vault rather than inline keeps the secret out of the job
-- definition, which is otherwise readable by anyone who can select from
-- cron.job.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running this migration should replace the schedule, not fail on it.
-- unschedule throws when the job doesn't exist, which on a first run is the
-- normal case rather than an error.
do $$
begin
  perform cron.unschedule('threshold-late-arrivals');
exception
  when others then null;
end;
$$;

-- Every five minutes, all day. The endpoint is cheap and returns immediately
-- when nothing is due, so restricting this to opening hours would buy nothing
-- and introduces a timezone bug waiting to happen — pg_cron schedules in UTC,
-- and the salon's hours are Eastern with daylight saving.
select cron.schedule(
  'threshold-late-arrivals',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://threshold.salon/api/cron/late-arrivals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);

commit;

-- Checking on it later:
--
--   select jobid, jobname, schedule, active from cron.job;
--
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'threshold-late-arrivals')
--    order by start_time desc
--    limit 10;
--
-- Note that job_run_details reports whether the HTTP request was DISPATCHED,
-- not what came back — pg_net is asynchronous. For the response, read
-- net._http_response, or just look at the Vercel logs for the endpoint.
--
-- To stop it:  select cron.unschedule('threshold-late-arrivals');
