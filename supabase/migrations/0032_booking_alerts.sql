-- Threshold Salon — telling Evelyn a booking happened.
--
-- Until now nothing did. A stranger could take her 9am tomorrow and the first
-- she'd know was the next time she opened /studio. This adds the two pieces
-- that fix it, and they are deliberately different mechanisms because they
-- answer different questions:
--
--   * owner_notified_at — a short-notice text to her own handset, for the
--     booking that lands inside 24 hours and can't wait for her to look.
--   * bookings_seen_at  — the "booked while you were away" strip on the studio
--     home screen, which catches everything else whenever she next looks.
--
-- Nothing here sends anything on its own. The text is gated on
-- SMS_AUTOMATION_ENABLED, which stays false until the A2P campaign clears.

begin;

-- ---------------------------------------------------------------------------
-- Idempotency for the owner alert
-- ---------------------------------------------------------------------------

-- Same pattern as confirmation_email_sent_at and reminder_sms_sent_at: a
-- timestamp rather than a boolean, so "did she get told, and when" is
-- answerable a week later when she says she never saw it. Stamped only after
-- Twilio accepts the message, so a transient failure doesn't burn the one send.
alter table public.appointments
  add column if not exists owner_notified_at timestamptz;

comment on column public.appointments.owner_notified_at is
  'When the short-notice text went to Evelyn about this booking. Null = never '
  'sent. Idempotency key — one alert per appointment, ever.';

-- ---------------------------------------------------------------------------
-- Which bookings she didn't make herself
-- ---------------------------------------------------------------------------

-- The "while you were away" strip is about bookings that arrived without her.
-- An appointment she just typed in at the desk is not news, and a strip that
-- shows it back to her is a strip she learns to ignore.
--
-- The default is 'online' rather than 'studio' on purpose, and it's the whole
-- trick: create_booking — the SECURITY DEFINER function the public books
-- through — inserts without naming this column, so every public booking picks
-- up the default without that function having to be redefined a tenth time.
-- The studio's own inserts name it explicitly.
--
-- The failure mode if a future studio insert forgets: her own booking shows up
-- in the strip. Visible and mildly annoying, which is the right direction for
-- a mistake to fail in — the alternative design (bump a timestamp whenever she
-- books) silently swallows a real online booking that arrived moments earlier.
alter table public.appointments
  add column if not exists source text not null default 'online'
    check (source in ('online', 'studio'));

comment on column public.appointments.source is
  'Where the booking came from. ''online'' = the public /book flow (the column '
  'default, which is how create_booking gets it without naming it); ''studio'' '
  '= Evelyn entered it herself. Drives the "booked while you were away" strip.';

-- ---------------------------------------------------------------------------
-- The watermark
-- ---------------------------------------------------------------------------

-- Server-side rather than localStorage, because she works from a phone and an
-- iPad and "new since you last looked" has to mean the same thing on both.
-- salon_settings is already the one-row table for exactly this sort of thing.
--
-- Null means she has never dismissed the strip. The app treats that as "show
-- anything booked in the last week" rather than as "show everything ever",
-- so a fresh install doesn't open on a wall of history.
alter table public.salon_settings
  add column if not exists bookings_seen_at timestamptz;

comment on column public.salon_settings.bookings_seen_at is
  'Watermark for the "booked while you were away" strip. Everything booked '
  'online after this has not been acknowledged. Null = never dismissed.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- The strip asks one question on every load of the studio home screen: which
-- online bookings arrived after the watermark and haven't happened yet? Without
-- this it's a full scan of the appointments table on her most-visited screen.
create index if not exists appointments_new_online_idx
  on public.appointments (created_at desc)
  where source = 'online';

commit;
