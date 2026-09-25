-- Threshold Salon — the tax she collects, which was never hers.
--
-- Ohio does not tax cosmetology services: a cut, a colour, a blowout are all
-- clean. It does tax retail product, and selling one bottle requires a
-- vendor's licence. She has been selling product without one.
--
-- Her rate is 7.5% — 5.75% Ohio plus 1.75% Montgomery County, Kettering adding
-- nothing of its own.
--
-- The important thing this models: sales tax collected is NOT income. It is
-- held for the state. It must never reach profit, never reach the income-tax
-- estimate, and never reach her average ticket. Storing it on the movement
-- rather than deriving it later is what keeps that true when the rate moves.

begin;

-- ---------------------------------------------------------------------------
-- The rate
-- ---------------------------------------------------------------------------

insert into public.tax_rates
  (jurisdiction, label, rate, effective_from, source_url, checked_on, notes)
values
  ('ohio_sales_tax', 'Ohio sales tax on retail product', 0.07500, '2026-01-01',
   'https://www.avalara.com/taxrates/en/state-rates/ohio/cities/kettering.html',
   '2026-09-25',
   '5.75% Ohio + 1.75% Montgomery County; Kettering levies none. Applies to '
   'retail product only — cosmetology services are exempt, so a haircut is '
   'never taxed and a bottle always is.')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- What she collected, on the movement that collected it
-- ---------------------------------------------------------------------------
--
-- Copied onto the sale rather than worked out later from a rate, for the same
-- reason unit_cost_cents is: rates change, and last March's tax must not move
-- when Montgomery County's does.

alter table public.inventory_movements
  add column if not exists unit_tax_cents integer
    check (unit_tax_cents is null or unit_tax_cents >= 0);

comment on column public.inventory_movements.unit_tax_cents is
  'Sales tax collected per unit on a sale, at the rate in force that day. '
  'Null on anything that is not a sale. Held for Ohio, never income.';

-- ---------------------------------------------------------------------------
-- Her licence, and how she prices
-- ---------------------------------------------------------------------------

alter table public.salon_settings
  add column if not exists vendor_license_number text,
  add column if not exists vendor_license_from   date,
  add column if not exists prices_include_tax    boolean not null default false;

comment on column public.salon_settings.vendor_license_number is
  'Ohio county vendor''s licence. Null means she has not registered, and the '
  'check-out screen says so — product sold without one still owes the tax, so '
  'silence would be the wrong kindness.';

comment on column public.salon_settings.prices_include_tax is
  'False means the shelf price has tax added at the till: $26 becomes $27.95, '
  'and she keeps the $26. True would mean $26 stays $26 and the $1.81 comes '
  'out of her margin. Decided 2026-09-25: tax on top.';

commit;
