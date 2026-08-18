-- Threshold Salon — a missed call is a message too.
--
-- Most people who can't get through don't leave a voicemail. They ring, hear
-- the greeting, and hang up. Until now that left no trace anywhere: no row, no
-- badge, nothing — so the most common way a client tries to reach Evelyn was
-- also the only one she'd never hear about.
--
-- A missed call becomes a row the moment the dial fails, and is *upgraded* in
-- place to a voicemail if they go on to leave one (matched on the call SID).
-- One row per call either way, so "Sarah called" doesn't appear twice on the
-- needs-attention banner.

begin;

alter table public.messages
  drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check
  check (kind in ('sms', 'voicemail', 'missed_call'));

comment on column public.messages.kind is
  'sms = a text; voicemail = a recorded message, with recording_sid set; '
  'missed_call = rang, nobody took it, no message left.';

-- The voicemail callback upgrades a missed call by finding it on the call SID,
-- so that has to be a cheap lookup rather than a scan.
create index if not exists messages_twilio_sid_idx
  on public.messages (twilio_sid)
  where twilio_sid is not null;

commit;
