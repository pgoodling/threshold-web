-- Threshold Salon — archiving a conversation, and snoozing a client.
--
-- Two ways of saying "I've dealt with this, stop showing me", for the two
-- places that nag her.
--
-- ARCHIVE is for the inbox. A finished conversation shouldn't sit at the top of
-- Messages forever, but a client's texts are part of her record and deleting
-- them would take the history with it. So archiving hides the conversation from
-- the inbox and leaves every message on the client's file, untouched.
--
-- Deliberately per-message rather than per-conversation: a conversation isn't a
-- row anywhere — it's messages grouped by client, or by number when we can't
-- match one. Stamping the messages means a NEW message is unarchived by
-- definition, so the conversation comes back the moment she's spoken to again.
-- That's the behaviour you want: archive means "done for now", not "never
-- again".
--
-- SNOOZE is for the client book. The old reach-out list hid anyone with an open
-- task, which was really a side effect rather than a decision. This is explicit
-- and dated: Evelyn says "not until March", and the client drops out of Due and
-- Overdue until then, without pretending her visit history is anything other
-- than what it is.

begin;

alter table public.messages
  add column if not exists archived_at timestamptz;

comment on column public.messages.archived_at is
  'Set when Evelyn archives the conversation. Hides it from the Messages inbox; '
  'the message still shows on the client record. A new message arrives '
  'unarchived, so the conversation returns on its own.';

-- The inbox asks "which conversations have anything unarchived" on every load.
create index if not exists messages_archived_at_idx
  on public.messages (archived_at)
  where archived_at is null;

alter table public.clients
  add column if not exists snoozed_until date;

comment on column public.clients.snoozed_until is
  'Suppresses this client from the Due and Overdue lists until the date passes. '
  'Her state is unchanged underneath — this hides the nag, not the truth.';

commit;
