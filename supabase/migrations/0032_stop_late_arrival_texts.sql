-- Threshold Salon — stop texting people who are running late.
--
-- 0025 scheduled a sweep every five minutes that texted anyone still marked
-- booked ten minutes past their start time: "Are you still on your way?"
--
-- Evelyn doesn't want it. The reasoning it was built on — find out whether
-- they're coming so the chair isn't held for nothing — assumed a stylist who
-- can't see the door. She can. In a one-chair studio she knows within seconds
-- of the hour whether someone has walked in, and an automatic text at ten
-- minutes past reaches someone who is parking, or standing at reception being
-- greeted by her. It solves a problem the room already solves.
--
-- The studio still SHOWS her who hasn't arrived — that list is on the Overview
-- and stays. What goes is the automated message.
--
-- Confirmations and day-before reminders are unaffected.

begin;

-- The job lives in pg_cron rather than vercel.json, so removing the route isn't
-- enough on its own: an unscheduled job would keep POSTing to a dead URL every
-- five minutes forever.
do $$
begin
  perform cron.unschedule('threshold-late-arrivals');
exception
  -- Already gone, or pg_cron isn't installed on this database.
  when others then null;
end;
$$;

-- `late_ping_sent_at` stays. It records that a text was sent to that client on
-- that appointment, which remains true, and dropping it would rewrite history
-- to say it never happened. It simply stops being written to.
comment on column public.appointments.late_ping_sent_at is
  'When a "are you still on your way?" text was sent. Retired September 2026 — '
  'the sweep that wrote this was removed in 0032 and nothing sets it now. Kept '
  'because the rows that have it are a true record of a message that went out.';

commit;
