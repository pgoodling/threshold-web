-- Threshold Salon — reschedule the digest job the way this project actually
-- passes secrets to pg_cron.
--
-- 0034 built the job around current_setting('app.site_url') and
-- current_setting('app.cron_secret'), with instructions to set both via
-- ALTER DATABASE. On Supabase that fails:
--
--   ERROR: 42501: permission denied to set parameter "app.site_url"
--
-- The SQL editor connects as a role that cannot set database-level parameters.
-- So the job was scheduled and active, and every hourly run built a NULL url —
-- NULL || text is NULL in Postgres — and did nothing. Scheduled, running,
-- silent: the worst of the three.
--
-- 0025 had already solved this for the late-arrival sweep, and its answer is
-- the house pattern: the secret comes from Supabase Vault, and the URL is
-- written into the command. This restates the digest job that way.
--
-- PREREQUISITE: a vault secret named 'cron_secret' holding the same value as
-- CRON_SECRET in Vercel. 0025 created and used one, so it very likely already
-- exists — check before assuming:
--
--   select name, created_at from vault.decrypted_secrets where name = 'cron_secret';
--
-- If it's missing, or has drifted from Vercel:
--
--   select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
--   -- or, to replace an existing one:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'cron_secret'),
--     '<the CRON_SECRET value>'
--   );

begin;

do $$
begin
  perform cron.unschedule('threshold-digest');
exception
  when others then null;
end;
$$;

-- Hourly, exactly as 0034 intended. The route still decides whether this is
-- the hour Evelyn asked for, by comparing the salon's local clock to
-- salon_settings.digest_hour — which is what makes the time picker in Settings
-- a real control rather than decoration, and what keeps 7am at 7am when the
-- clocks change.
select cron.schedule(
  'threshold-digest',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://threshold.salon/api/cron/digest',
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

-- Checking it actually worked, which matters more here than usual because the
-- failure this replaces was invisible:
--
--   select jobname, schedule, active from cron.job where jobname = 'threshold-digest';
--
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'threshold-digest')
--    order by start_time desc limit 5;
--
-- job_run_details reports whether the request was DISPATCHED, not what came
-- back — pg_net is asynchronous. For the actual response:
--
--   select status_code, content from net._http_response order by created desc limit 5;
--
-- A 401 there means the vault secret and Vercel's CRON_SECRET disagree.
-- A 200 with {"sent":false,"reason":"no_owner_email"} means SALON_OWNER_EMAIL
-- isn't set in Vercel yet.
-- A 200 with {"sent":false,"reason":"not_the_hour"} is the correct, expected
-- answer for twenty-three hours out of every twenty-four.
