-- Threshold Salon — automated appointment texts.
--
-- Mirrors the email columns from 0017: a timestamp per kind of message rather
-- than a boolean, so "when did that go out?" is answerable when a client says
-- they never got it, and so an overlapping cron window can never send twice.
-- Each is the idempotency key for its sender, stamped only after a successful
-- send so a Twilio hiccup is retried rather than silently swallowed.

begin;

alter table public.appointments
  add column if not exists reminder_sms_sent_at    timestamptz,
  add column if not exists late_ping_sent_at       timestamptz,
  add column if not exists confirmed_by_client_at  timestamptz;

comment on column public.appointments.reminder_sms_sent_at is
  'When the reminder text went out. Null = never sent. Idempotency key.';
comment on column public.appointments.late_ping_sent_at is
  'When the "still on your way?" text went out. Null = never sent. Idempotency key.';
comment on column public.appointments.confirmed_by_client_at is
  'When the client themselves confirmed, by replying C to the reminder. '
  'Distinct from status=confirmed, which Evelyn can also set by hand -- this '
  'records that the client said so.';

-- The reminder job asks "which upcoming appointments still need a text?" and
-- the late sweep asks "which started recently and nobody arrived?". Both stay
-- index scans, and both indexes stay small because rows leave as they're sent.
create index if not exists appointments_sms_reminder_due_idx
  on public.appointments (starts_at)
  where reminder_sms_sent_at is null;

create index if not exists appointments_late_ping_due_idx
  on public.appointments (starts_at)
  where late_ping_sent_at is null;

commit;
