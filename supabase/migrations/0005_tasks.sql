-- Threshold Salon — Phase 3: Evelyn's manual to-do tasks (one-off + recurring).
-- Auto-reminders (lapsed clients, no-rebook, etc.) are computed on the fly from
-- appointment data and don't need storage — this table is only for her own
-- to-dos. Run once in the SQL editor.

begin;

create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  notes      text,
  due_date   date,
  recurrence text not null default 'none'
               check (recurrence in ('none', 'weekly', 'biweekly', 'monthly')),
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

-- Only Evelyn (authenticated) can see or manage tasks.
drop policy if exists tasks_admin_all on public.tasks;
create policy tasks_admin_all on public.tasks
  for all to authenticated using (true) with check (true);

create index if not exists tasks_open_idx on public.tasks (done, due_date);

commit;
