-- Threshold Salon — hair notes: what the client tells her, and what she mixed.
--
-- Two tables, because they're two different kinds of record.
--
--   appointment_intake  what the CLIENT said, once per appointment, filled in
--                       after booking. A snapshot of how their hair was that
--                       time — answers change between visits and both are true.
--
--   client_formulas     what EVELYN mixed, append-only. The formula on the
--                       client record is the current one; this is every one
--                       before it. A colourist's own notes are the thing she
--                       can least afford to lose, and overwriting a field
--                       destroys the history that makes the next visit
--                       repeatable.

begin;

-- ── What the client tells her ─────────────────────────────────────────────

create table if not exists public.appointment_intake (
  appointment_id uuid primary key
    references public.appointments(id) on delete cascade,
  client_id      uuid references public.clients(id) on delete set null,

  -- Everything is nullable. The form is optional and saves as she goes, so a
  -- half-answered one has to be a valid row — a partial answer still tells
  -- Evelyn more than an abandoned form.
  hair_type      text,   -- straight | wavy | curly | coily | unsure
  strand         text,   -- fine | medium | coarse | unsure
  density        text,   -- low | average | high
  length         text,   -- above | shoulders | midback | longer
  last_cut       text,   -- under6w | 2to3m | 6m | over1y
  struggles      text[] not null default '{}',
  allergies      text,
  note           text,   -- "anything you'd like to tell me"

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists appointment_intake_client_idx
  on public.appointment_intake (client_id, created_at desc);

alter table public.appointment_intake enable row level security;

-- The client filling this in is anonymous — they've just booked and aren't
-- logged in. They hold an unguessable appointment id, which is the same thing
-- that protects the booking-confirmation route.
--
-- Insert and update only: no anon select, so the id can't be used to READ
-- someone's answers back out. Evelyn reads and writes everything.
drop policy if exists intake_anon_write on public.appointment_intake;
create policy intake_anon_write on public.appointment_intake
  for insert to anon, authenticated with check (true);

drop policy if exists intake_anon_update on public.appointment_intake;
create policy intake_anon_update on public.appointment_intake
  for update to anon, authenticated using (true) with check (true);

drop policy if exists intake_admin_read on public.appointment_intake;
create policy intake_admin_read on public.appointment_intake
  for select to authenticated using (true);

drop policy if exists intake_admin_delete on public.appointment_intake;
create policy intake_admin_delete on public.appointment_intake
  for delete to authenticated using (true);

-- ── What Evelyn mixed ─────────────────────────────────────────────────────

create table if not exists public.client_formulas (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients(id) on delete cascade,
  -- The appointment it was mixed for, when she records it from one. Null when
  -- she's just noting it on the client.
  appointment_id uuid references public.appointments(id) on delete set null,
  formula        text not null,
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists client_formulas_client_idx
  on public.client_formulas (client_id, created_at desc);

alter table public.client_formulas enable row level security;

-- Hers alone. A client never sees, and never needs to see, the formula.
drop policy if exists client_formulas_admin_all on public.client_formulas;
create policy client_formulas_admin_all on public.client_formulas
  for all to authenticated using (true) with check (true);

-- Seed the history with whatever formula is already on each client record, so
-- the first entry isn't a blank page for clients she's already recorded one for.
insert into public.client_formulas (client_id, formula, note)
select id, hair_formula, 'Recorded before formula history existed'
  from public.clients
 where coalesce(btrim(hair_formula), '') <> ''
   and not exists (select 1 from public.client_formulas);

commit;
