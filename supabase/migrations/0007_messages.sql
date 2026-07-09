-- Threshold Salon — Two-way texting foundation (Phase 1).
-- Adds a messages log + an opt-out flag. The inbound webhook writes here with
-- the service-role key (bypasses RLS); only Evelyn (authenticated) can read.
--
-- Nothing here sends texts — that's gated on Twilio + A2P 10DLC. This just
-- gives clients a place to text into and Evelyn a place to see + reply.

begin;

-- SMS consent: STOP sets this true, START clears it. Never text an opted-out
-- client (enforced in the send route).
alter table public.clients
  add column if not exists sms_opt_out boolean not null default false;

create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid references public.clients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  direction      text not null check (direction in ('inbound','outbound')),
  body           text not null,
  from_number    text,
  to_number      text,
  twilio_sid     text,
  status         text,            -- queued / sent / delivered / received / failed
  created_at     timestamptz not null default now(),
  read_at        timestamptz      -- null = unread (inbound only)
);

create index if not exists messages_client_idx
  on public.messages (client_id, created_at desc);
create index if not exists messages_unread_idx
  on public.messages (created_at)
  where direction = 'inbound' and read_at is null;

alter table public.messages enable row level security;

-- Only Evelyn (authenticated) can read/update messages. The public/anon role
-- gets nothing; the Twilio webhook uses the service-role key, which bypasses
-- RLS entirely.
drop policy if exists messages_admin_all on public.messages;
create policy messages_admin_all on public.messages
  for all to authenticated using (true) with check (true);

commit;
