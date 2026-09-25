-- Threshold Salon — the federal numbers, with their provenance.
--
-- 0036 put Kettering, Oakwood and Ohio in tax_rates because rates look like
-- constants and are not. The federal ones are worse: brackets, the standard
-- deduction and the Social Security wage base ALL move every single year, and
-- they arrive as a schedule rather than a single percentage.
--
-- So tax_rates grows three columns rather than gaining a sibling table. Every
-- figure keeps its source_url and checked_on, which is the whole reason that
-- table exists — an estimate built on a remembered number is a guess wearing a
-- calculator's clothes.
--
-- WHY FILING STATUS IS A COLUMN AND NOT AN ASSUMPTION
--
-- Nobody building this knows whether Evelyn files single or jointly, and it
-- moves the answer by thousands: the standard deduction doubles and every
-- bracket threshold roughly doubles with it. Guessing single and quietly
-- being wrong would overstate her tax all year. So the schedule is stored for
-- both, and which one applies is hers to set.

begin;

alter table public.tax_rates
  add column if not exists filing_status      text,
  add column if not exists bracket_floor_cents bigint,
  add column if not exists cap_cents          bigint;

comment on column public.tax_rates.filing_status is
  'single or married_jointly, for figures that differ by it. Null means the '
  'rate applies regardless — municipal tax does not care who she married.';

comment on column public.tax_rates.bracket_floor_cents is
  'Taxable income at which this bracket starts. A progressive schedule is '
  'several rows sharing a jurisdiction, not one rate.';

comment on column public.tax_rates.cap_cents is
  'Income above which this rate stops applying — the Social Security wage '
  'base. Null means uncapped, which is how Medicare works.';

-- ---------------------------------------------------------------------------
-- Self-employment tax
-- ---------------------------------------------------------------------------
--
-- 0036 seeded a single 15.3% row, which is the headline but not the mechanism:
-- the two halves have different ceilings. Split so the arithmetic can be right
-- on a good year rather than only on a modest one.

delete from public.tax_rates where jurisdiction = 'federal_se';

insert into public.tax_rates
  (jurisdiction, label, rate, cap_cents, effective_from, source_url, checked_on, notes)
values
  ('federal_se_ss', 'Social Security portion of SE tax', 0.12400, 18450000, '2026-01-01',
   'https://www.ssa.gov/oact/cola/cbb.html', '2026-09-25',
   'Applies to 92.35% of net profit, and stops at the $184,500 wage base for '
   '2026. The base moves every year.'),
  ('federal_se_medicare', 'Medicare portion of SE tax', 0.02900, null, '2026-01-01',
   'https://www.irs.gov/taxtopics/tc554', '2026-09-25',
   'Applies to 92.35% of net profit with no ceiling. An additional 0.9% '
   'applies above $200,000 single / $250,000 joint and is NOT seeded — she is '
   'nowhere near it, and a rate nobody has checked is worse than one that is '
   'visibly absent.');

-- ---------------------------------------------------------------------------
-- Deductions
-- ---------------------------------------------------------------------------
--
-- A standard deduction is income that is exempt, which is exactly what
-- exempt_below_cents already means. Reusing it rather than adding a column
-- that would hold the same idea under a second name.

insert into public.tax_rates
  (jurisdiction, label, rate, filing_status, exempt_below_cents,
   effective_from, source_url, checked_on, notes)
values
  ('federal_standard_deduction', 'Standard deduction', 0, 'single', 1610000, '2026-01-01',
   'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill',
   '2026-09-25', '2026 figure. Rises most years.'),
  ('federal_standard_deduction', 'Standard deduction', 0, 'married_jointly', 3220000, '2026-01-01',
   'https://taxfoundation.org/data/all/federal/2026-tax-brackets/',
   '2026-09-25', '2026 figure. Rises most years.'),
  ('federal_qbi', 'Qualified business income deduction', 0.20000, null, null, '2026-01-01',
   'https://www.irs.gov/newsroom/qualified-business-income-deduction',
   '2026-09-25',
   '20% of qualifying business income. Limits phase in above $201,775 single '
   'for 2026 and are not modelled, because she is an order of magnitude below '
   'and a phase-out nobody has tested is a liability.');

-- ---------------------------------------------------------------------------
-- Brackets
-- ---------------------------------------------------------------------------
--
-- One row per bracket, ordered by its floor. Only the bottom four are seeded
-- per status: above $200,000 of taxable income this app is the wrong tool and
-- she has an accountant.

insert into public.tax_rates
  (jurisdiction, label, rate, filing_status, bracket_floor_cents,
   effective_from, source_url, checked_on, notes)
values
  ('federal_income', '10% bracket', 0.10000, 'single', 0,         '2026-01-01',
   'https://taxfoundation.org/data/all/federal/2026-tax-brackets/', '2026-09-25', null),
  ('federal_income', '12% bracket', 0.12000, 'single', 1240000,   '2026-01-01',
   'https://taxfoundation.org/data/all/federal/2026-tax-brackets/', '2026-09-25', null),
  ('federal_income', '22% bracket', 0.22000, 'single', 5040000,   '2026-01-01',
   'https://taxfoundation.org/data/all/federal/2026-tax-brackets/', '2026-09-25', null),
  ('federal_income', '24% bracket', 0.24000, 'single', 10570000,  '2026-01-01',
   'https://taxfoundation.org/data/all/federal/2026-tax-brackets/', '2026-09-25', null),

  ('federal_income', '10% bracket', 0.10000, 'married_jointly', 0,        '2026-01-01',
   'https://taxfoundation.org/data/all/federal/2026-tax-brackets/', '2026-09-25', null),
  ('federal_income', '12% bracket', 0.12000, 'married_jointly', 2480000,  '2026-01-01',
   'https://taxfoundation.org/data/all/federal/2026-tax-brackets/', '2026-09-25', null),
  ('federal_income', '22% bracket', 0.22000, 'married_jointly', 10080000, '2026-01-01',
   'https://taxfoundation.org/data/all/federal/2026-tax-brackets/', '2026-09-25', null),
  ('federal_income', '24% bracket', 0.24000, 'married_jointly', 21140000, '2026-01-01',
   'https://taxfoundation.org/data/all/federal/2026-tax-brackets/', '2026-09-25', null);

-- ---------------------------------------------------------------------------
-- Her household
-- ---------------------------------------------------------------------------
--
-- Business profit stacks on top of whatever else a household earns, so the
-- same profit is taxed differently depending on facts the salon's books cannot
-- see. Asked once, shown on screen, and changeable — rather than assumed and
-- silently wrong for a year.

alter table public.salon_settings
  add column if not exists filing_status text
    check (filing_status is null or filing_status in ('single', 'married_jointly')),
  add column if not exists other_income_cents bigint
    check (other_income_cents is null or other_income_cents >= 0);

comment on column public.salon_settings.filing_status is
  'How she files. Null means nobody has said, and the screen should ask '
  'rather than assume — the standard deduction and every bracket threshold '
  'roughly double between the two.';

comment on column public.salon_settings.other_income_cents is
  'Household taxable income from outside the salon, for the year. The salon''s '
  'profit stacks on top of it, so without this the bracket is guessed from '
  'the bottom up and the estimate comes out low.';

commit;
