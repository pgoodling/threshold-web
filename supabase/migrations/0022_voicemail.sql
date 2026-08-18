-- Threshold Salon — voicemail lands in the Messages tab.
--
-- A missed call and an unanswered text are the same thing from Evelyn's side:
-- someone wanted her and she was with a client. So voicemail is not a new
-- screen — it's another row in `messages`, which already has the conversation
-- grouping, the unread badge and the reply box. A voicemail from a client
-- appears in the same thread as their texts, in the order it happened.
--
-- Only the payload differs: a recording instead of a body. The transcription
-- arrives seconds after the recording does, so `body` starts as a placeholder
-- and is filled in by the transcription callback.

begin;

alter table public.messages
  add column if not exists kind text not null default 'sms',
  add column if not exists recording_sid text,
  add column if not exists recording_seconds int;

-- Guard the new column rather than trusting the writers. Dropped first so the
-- migration can be re-run after the list of kinds changes.
alter table public.messages
  drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check check (kind in ('sms', 'voicemail'));

comment on column public.messages.kind is
  'sms = a text; voicemail = a recorded message, with recording_sid set.';
comment on column public.messages.recording_sid is
  'Twilio Recording SID. The audio is streamed via /api/voice/recording rather '
  'than stored here — Twilio keeps the media, we keep the pointer.';
comment on column public.messages.recording_seconds is
  'Length of the voicemail, for showing "0:34" without fetching the audio.';

-- The transcription callback finds its row by recording_sid, so that lookup
-- shouldn't scan the whole message log.
create index if not exists messages_recording_sid_idx
  on public.messages (recording_sid)
  where recording_sid is not null;

commit;
