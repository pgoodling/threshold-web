-- Threshold Salon — track the texts Evelyn sends by hand.
--
-- The A2P campaign was rejected on 3 September and the resubmission won't clear
-- until well after opening day, so nothing can be sent automatically through
-- opening week. She sends them from her own phone instead, and the app's job
-- shrinks to: write the message, keep the list, remember who's been done.
--
-- Reminders already have somewhere to record this — reminder_sms_sent_at, which
-- the automated cron stamps. Manual sends stamp the same column on purpose: when
-- A2P finally clears, the cron reads it and doesn't re-text anyone she's already
-- reached by hand. One column, one meaning, no handover gap.
--
-- Confirmations have nowhere, because the automated confirmation goes out at
-- booking rather than in a sweep. That's what this adds.

begin;

alter table public.appointments
  add column if not exists confirm_sms_sent_at timestamptz;

comment on column public.appointments.confirm_sms_sent_at is
  'When a booking confirmation was texted for this appointment — by hand from '
  'the Texts screen, or automatically once A2P clears. Distinct from '
  'confirmed_by_client_at, which is the client replying C.';

-- Both sweeps ask "what still needs one?" over a narrow date window, so the
-- index covers the unsent case rather than the whole table.
create index if not exists appointments_confirm_pending_idx
  on public.appointments (starts_at)
  where confirm_sms_sent_at is null;

commit;
