-- Threshold Salon — email confirmations and reminders.
--
-- The app has never sent an automated message of any kind: the Twilio routes
-- are built but gated on A2P 10DLC vetting, which is a 10–15 day wait after the
-- brand clears. Email needs no carrier registration, so it can cover the
-- no-show problem now and keep covering clients who decline texts.
--
-- Two timestamps rather than booleans so we can see WHEN something went out
-- when a client says they never got it — and so a send can never happen twice.
-- Both are the idempotency key for their sender.
--
-- email_opt_out mirrors sms_opt_out. These are transactional messages to
-- someone who just booked, so they don't need prior opt-in the way marketing
-- would, but "stop emailing me" has to be honourable and recorded.

begin;

alter table public.appointments
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists reminder_email_sent_at     timestamptz;

comment on column public.appointments.confirmation_email_sent_at is
  'When the booking confirmation email went out. Null = never sent. Idempotency key.';
comment on column public.appointments.reminder_email_sent_at is
  'When the appointment reminder email went out. Null = never sent. Idempotency key.';

alter table public.clients
  add column if not exists email_opt_out boolean not null default false;

comment on column public.clients.email_opt_out is
  'Client asked not to be emailed. Mirrors sms_opt_out; never send automated email when true.';

-- The reminder job asks one question every day: which upcoming appointments
-- still need a reminder? This makes that an index scan rather than a table
-- scan, and stays small because rows leave it as soon as they are reminded.
create index if not exists appointments_reminder_due_idx
  on public.appointments (starts_at)
  where reminder_email_sent_at is null;

commit;
