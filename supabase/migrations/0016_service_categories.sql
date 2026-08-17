-- Threshold Salon — service categories.
--
-- The booking menu is a flat list, which is fine at six services and unreadable
-- at twenty. Categories group it under headers ("Color", "Cuts", "Treatments")
-- on the public booking page, and give Evelyn somewhere to file a new service.
--
-- Deliberately a separate table rather than a text column on `services`: she
-- renames things, and a rename should move every service under it at once
-- rather than leaving "Color" and "Colour" side by side forever.
--
-- Ordering: categories carry their own sort_order (the order headers appear);
-- services keep the sort_order they already have (the order within a header).
-- Nothing about existing service ordering changes.

begin;

create table if not exists public.service_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint service_categories_name_not_blank check (length(trim(name)) > 0)
);

-- Case-insensitive uniqueness so "Color" and "color" can't both exist.
create unique index if not exists service_categories_name_lower_idx
  on public.service_categories (lower(trim(name)));

-- on delete set null: deleting a category must never take her services with it.
-- Those services fall back to the uncategorised group.
alter table public.services
  add column if not exists category_id uuid
    references public.service_categories(id) on delete set null;

create index if not exists services_category_id_idx
  on public.services (category_id);

comment on column public.services.category_id is
  'Optional grouping for the booking menu. Null = shown under "More services".';

alter table public.service_categories enable row level security;

-- The public booking page has to read these to render its headers, same as it
-- already reads active services.
drop policy if exists service_categories_public_read on public.service_categories;
create policy service_categories_public_read on public.service_categories
  for select to anon, authenticated using (true);

drop policy if exists service_categories_admin_all on public.service_categories;
create policy service_categories_admin_all on public.service_categories
  for all to authenticated using (true) with check (true);

commit;
