-- Threshold Salon — somewhere to put the numbers she chooses.
--
-- First tenant is the monthly revenue target, which the "On the books" screen
-- needs before it can say anything about a shortfall: a shortfall is a distance
-- from a number, and until now there was no number to be short of.
--
-- One row, enforced by the primary key rather than by hoping. `id boolean
-- primary key check (id)` admits exactly one value, so a second row is a
-- constraint violation instead of a silent second opinion — the failure mode
-- where two settings rows exist and the app reads whichever comes back first is
-- genuinely hard to notice.
--
-- Typed columns rather than key/value text. A key/value store would take any
-- setting without a migration, which sounds like an advantage until something
-- reads 'six thousand' out of a column that was meant to hold cents.

begin;

create table if not exists public.salon_settings (
  id boolean primary key default true check (id),

  -- Cents, like every other money column here. Null means "not set", which is
  -- different from zero and is what the UI shows a prompt for.
  monthly_revenue_target_cents integer
    check (monthly_revenue_target_cents is null
           or monthly_revenue_target_cents >= 0),

  updated_at timestamptz not null default now()
);

comment on table public.salon_settings is
  'Single-row settings for the salon. The primary key admits one row only.';

comment on column public.salon_settings.monthly_revenue_target_cents is
  'What Evelyn wants to take in a month. Null when she has not set one — the '
  'Reports screen prompts rather than assuming a default, because an invented '
  'target produces invented shortfalls.';

-- Seed the row so the app can always UPDATE and never has to decide between
-- insert and update.
insert into public.salon_settings (id) values (true)
  on conflict (id) do nothing;

alter table public.salon_settings enable row level security;

-- Evelyn only. This is what the business earns and hopes to earn; there is no
-- reason for an anonymous visitor to read it, and no page that needs to.
drop policy if exists salon_settings_admin_all on public.salon_settings;
create policy salon_settings_admin_all on public.salon_settings
  for all to authenticated using (true) with check (true);

commit;
