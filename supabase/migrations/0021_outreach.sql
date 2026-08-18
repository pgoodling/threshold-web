-- Threshold Salon — track a personal outreach sweep.
--
-- Evelyn needs to tell her whole book she's opening. Automated texting can't do
-- it: promotional messages need express written consent nobody has given yet,
-- and the A2P campaign is still in vetting either way. What CAN do it is her,
-- texting people one at a time from her own phone — that's person-to-person, not
-- A2P, and it rests on the relationship rather than a written opt-in.
--
-- The tedious part isn't the texting, it's keeping her place across 130-odd
-- clients over several evenings. This column is that place.
--
-- Deliberately a timestamp rather than a boolean: "when did she last reach out
-- to this client?" is useful long after the grand opening, and a future sweep
-- can just compare against a date instead of needing the flag reset.

begin;

alter table public.clients
  add column if not exists outreach_texted_at timestamptz;

comment on column public.clients.outreach_texted_at is
  'When Evelyn last personally texted this client from her own phone (outreach sweep). Null = not yet contacted.';

-- The screen's default view is "who have I not got to yet", so keep that an
-- index scan. Rows leave the index as she works through them.
create index if not exists clients_outreach_pending_idx
  on public.clients (full_name)
  where outreach_texted_at is null;

commit;
