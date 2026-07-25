-- Threshold Salon — task upgrades:
--   • start_date  → a task can be scheduled for a specific day (start + due),
--                   not just a single due date.
--   • client_id   → connect a task to a client's file (shown on their profile;
--                   no-show follow-ups link here). ON DELETE SET NULL so removing
--                   a client keeps the task but drops the link.
-- Run once in the SQL editor. Safe to re-run.

begin;

alter table public.tasks
  add column if not exists start_date date,
  add column if not exists client_id  uuid references public.clients(id) on delete set null;

create index if not exists tasks_client_idx on public.tasks (client_id);

commit;
