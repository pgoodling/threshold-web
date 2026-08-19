-- Threshold Salon — what the website says she does, editable by her.
--
-- The homepage service list has been a hardcoded array in app/page.tsx since the
-- site was built, which meant only a deploy could change it. The booking
-- services she edits in the studio are a different thing entirely, and the two
-- had already drifted apart in wording.
--
-- Kept as its OWN table rather than pointed at `services`, deliberately. They
-- read the same but they aren't:
--
--   services       what a client can actually book. Durations, processing time,
--                  deposits, categories, the overlap rules the calendar depends
--                  on. Renaming one rewrites appointment history.
--   site_services  a shop window. Longer copy, "from $105" rather than a real
--                  price, and the freedom to advertise something she does but
--                  doesn't take online bookings for — or to leave a bookable
--                  service off the page entirely.
--
-- Tying them together would mean every marketing tweak touching the booking
-- engine, and every booking change rewriting the website.

begin;

create table if not exists public.site_services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  -- Free text, not cents: the page says "from $105", and one day it'll want to
  -- say "consultation" or "priced on the day".
  price_label text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.site_services enable row level security;

-- Same shape as services: the world reads the live ones, Evelyn does the rest.
drop policy if exists site_services_public_read on public.site_services;
create policy site_services_public_read on public.site_services
  for select to anon, authenticated using (active = true);

drop policy if exists site_services_admin_all on public.site_services;
create policy site_services_admin_all on public.site_services
  for all to authenticated using (true) with check (true);

-- Seeded with exactly what the homepage says today, so switching the page over
-- to this table changes nothing a visitor can see.
insert into public.site_services (name, description, price_label, sort_order)
select * from (values
  ('Custom Highlights',
   'Balayage, foils, and lived-in dimension, from a soft rooted blonde to bright, blended highlights that grow out beautifully — including seamless gray blending.',
   'from $105', 1),
  ('Custom Color',
   'All-over color, root touch-ups, and glosses with gentle, professional-grade formulas that protect the integrity of your hair.',
   'from $90', 2),
  ('Cut and Style',
   'A precision cut shaped to your hair type, texture, and lifestyle, finished with a look you can actually recreate at home.',
   'from $55', 3),
  ('Treatments',
   'Deep conditioning, bond-building, and scalp care, customized to your hair''s needs to restore strength and shine and keep it healthy between visits.',
   'from $35', 4),
  ('Blowouts',
   'A smooth, voluminous finish for events, date nights, or any day you want to feel put together.',
   'from $45', 5),
  ('Men''s Cuts',
   'Clean, tailored cuts and styling for men, from classic tapers to relaxed, low-maintenance looks.',
   'from $50', 6)
) as seed(name, description, price_label, sort_order)
-- Only on a genuinely empty table, so re-running never duplicates her edits.
where not exists (select 1 from public.site_services);

commit;
