-- Threshold Salon — the money side: what came out of the bank, what it was
-- for, and what she owes on what's left.
--
-- Design record: docs/MONEY.md. Read it before changing a rate in here.
--
-- Five tables, and the reason there are five rather than one:
--
--   bank_accounts      where transactions came from
--   bank_transactions  the raw feed, whichever way it arrived
--   expense_categories the buckets, each tied to a Schedule C line
--   category_rules     "SALONCENTRIC means Supplies" — suggestions, not verdicts
--   tax_rates          every rate with a source and a date it was checked
--
-- The separation that matters is the last one. Rates look like constants and
-- are not: Oakwood changed tax administrator on 1 January 2026, federal
-- thresholds move annually, and two of the rates seeded below came from
-- secondary sources because the city's own page refused the request. A rate in
-- a table can show its working and be seen to be stale. A rate in a .ts file is
-- a bug with a delay fuse.

begin;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create table if not exists public.bank_accounts (
  id            uuid primary key default gen_random_uuid(),

  -- 'teller' once the connection is live, 'manual' for a statement file. The
  -- ingestion path is the same either way; this only records which door the
  -- rows came through, so a bad import can be found and removed.
  source        text not null check (source in ('teller', 'manual')),

  -- Teller's account id. Null for file imports, which have no stable identity
  -- beyond what Evelyn names the account.
  external_id   text,

  institution   text,
  name          text not null,

  -- Last four digits only. Never the full number — there is no feature here
  -- that needs it, and storing it would turn a salon database into something
  -- worth stealing.
  mask          text check (mask is null or mask ~ '^[0-9]{4}$'),

  last_synced_at timestamptz,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

comment on table public.bank_accounts is
  'One row per connected or imported bank account. See docs/MONEY.md.';

comment on column public.bank_accounts.mask is
  'Last four digits, for telling two accounts apart in the UI. The full '
  'account number is deliberately not stored anywhere in this schema.';

create unique index if not exists bank_accounts_external_uniq
  on public.bank_accounts (source, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create table if not exists public.expense_categories (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,

  -- The Schedule C line this rolls up to, as printed on the form ('20b', '22').
  -- Text, not a number, because the form itself uses 20a/20b/24a/24b. Null for
  -- categories that are not deductible business expenses at all.
  schedule_c_line text,

  -- What this category means to the screens above, which is not the same
  -- question as what it means to the IRS:
  --   fixed    rent, insurance, phone — the break-even numerator
  --   product  colour, developer, back bar — allocated across appointments
  --   variable deductible but neither fixed nor allocatable
  --   resale   retail stock bought to sell on (Schedule C Part III, not line 22)
  --   owner    draws and transfers to personal — not an expense, and the
  --            single most common thing to miscount as one
  --   excluded personal spending that landed in a business account
  kind            text not null
                  check (kind in ('fixed', 'product', 'variable',
                                  'resale', 'owner', 'excluded')),

  sort_order      integer not null default 100,
  created_at      timestamptz not null default now()
);

comment on column public.expense_categories.kind is
  'Drives the screens, not the tax form. Break-even sums kind=fixed; cost per '
  'service allocates kind=product; kind=owner and kind=excluded are deducted '
  'from nothing and must never reach a tax figure.';

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table if not exists public.bank_transactions (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.bank_accounts(id) on delete cascade,

  posted_on    date not null,

  -- SIGNED cents, negative for money leaving the account.
  --
  -- This breaks the house convention that cents are positive (price_cents,
  -- paid_cents). It is deliberate: a bank feed is one stream containing both
  -- directions, and the alternative — a positive amount plus a direction
  -- column — puts the sign somewhere it can disagree with itself. Every read
  -- of this column must handle the sign; no view or column hides it.
  amount_cents integer not null,

  -- What the bank said, verbatim, and a tidied merchant name if we can get one.
  -- The raw text is kept because rules match on it and a rule that matched
  -- something the user can no longer see is impossible to debug.
  description  text not null,
  merchant     text,

  -- Exactly one of these is set, and each gives dedupe a key to work with.
  -- Teller has stable ids. A statement file has nothing, so the importer
  -- hashes account + date + amount + description.
  external_id  text,
  import_hash  text,

  -- Review state. Null is not "personal" and not "business" — it is
  -- "nobody has looked at this yet", which is a third thing and the state
  -- every row starts in. Sole proprietors mix accounts; guessing here is how
  -- a tax figure quietly becomes wrong.
  is_business  boolean,
  reviewed_at  timestamptz,

  category_id  uuid references public.expense_categories(id) on delete set null,

  -- Where the category came from. A suggestion from a rule is visibly a
  -- suggestion until someone confirms it.
  category_source text check (category_source in ('rule', 'manual')),
  rule_id      uuid,

  notes        text,
  created_at   timestamptz not null default now(),

  constraint bank_transactions_has_a_key
    check (external_id is not null or import_hash is not null),

  -- Reviewed means somebody answered the business/personal question. The two
  -- move together or the review screen can't tell what's left to do.
  constraint bank_transactions_reviewed_has_verdict
    check ((reviewed_at is null) = (is_business is null))
);

comment on column public.bank_transactions.amount_cents is
  'Signed cents, negative for money out. Deliberately unlike price_cents and '
  'paid_cents elsewhere in this schema — a bank feed carries both directions.';

comment on column public.bank_transactions.is_business is
  'Null means unreviewed, which is distinct from personal. Nothing counts '
  'toward a tax figure until this is true.';

-- Dedupe. Re-importing the same statement, or re-syncing an overlapping date
-- range, must be a no-op rather than a doubling. Partial indexes because only
-- one of the two keys exists on any given row.
create unique index if not exists bank_transactions_external_uniq
  on public.bank_transactions (account_id, external_id)
  where external_id is not null;

create unique index if not exists bank_transactions_import_uniq
  on public.bank_transactions (account_id, import_hash)
  where import_hash is not null;

-- The review screen's query: what's left, oldest first.
create index if not exists bank_transactions_unreviewed
  on public.bank_transactions (posted_on)
  where reviewed_at is null;

-- Every reporting screen slices by date.
create index if not exists bank_transactions_posted_on
  on public.bank_transactions (posted_on);

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

create table if not exists public.category_rules (
  id          uuid primary key default gen_random_uuid(),

  -- Only 'contains' for now, case-insensitive. Regex is tempting and would
  -- make a wrong rule much harder for Evelyn to read back.
  match_type  text not null default 'contains' check (match_type in ('contains')),
  pattern     text not null,

  category_id uuid not null references public.expense_categories(id) on delete cascade,
  is_business boolean not null default true,

  -- Lower runs first. Ties broken by creation order.
  priority    integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.category_rules is
  'Suggestions, not verdicts. A rule writes bank_transactions.category_id with '
  'category_source = ''rule'' and stamps rule_id, so a wrong category can be '
  'traced to the rule that produced it instead of looking like a fact.';

alter table public.bank_transactions
  drop constraint if exists bank_transactions_rule_fk;
alter table public.bank_transactions
  add constraint bank_transactions_rule_fk
  foreign key (rule_id) references public.category_rules(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Tax rates
-- ---------------------------------------------------------------------------

create table if not exists public.tax_rates (
  id             uuid primary key default gen_random_uuid(),

  -- 'federal_se', 'ohio', 'kettering', 'oakwood', and the credit Oakwood gives
  -- for tax paid elsewhere.
  jurisdiction   text not null,
  label          text not null,

  -- A decimal fraction: 0.0225 is 2.25%. Not cents — this is the one thing in
  -- the schema that genuinely isn't money.
  rate           numeric(7,5) not null check (rate >= 0 and rate <= 1),

  -- Income below this is exempt (Ohio's Business Income Deduction). Cents,
  -- positive, like every other money column.
  exempt_below_cents bigint check (exempt_below_cents is null or exempt_below_cents >= 0),

  effective_from date not null,
  effective_to   date,

  -- The whole point of this table. A rate without these two is not admissible.
  source_url     text not null,
  checked_on     date not null,
  notes          text,

  constraint tax_rates_sane_dates
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.tax_rates is
  'Every rate carries where it came from and when someone last looked. The UI '
  'shows both next to the number, so a stale rate is visible rather than '
  'silently wrong. See docs/MONEY.md.';

-- Seeded from the 2026-09-23 research pass. Rates marked secondary in `notes`
-- need a primary-source confirmation before Evelyn pays money on them.
insert into public.tax_rates
  (jurisdiction, label, rate, exempt_below_cents, effective_from, source_url, checked_on, notes)
values
  ('federal_se', 'Self-employment tax', 0.15300, null, '2026-01-01',
   'https://www.irs.gov/taxtopics/tc554', '2026-09-23',
   'Applies to 92.35% of net profit. The Social Security portion (12.4%) stops '
   'at the annual wage base; the Medicare portion (2.9%) does not. The wage '
   'base is a federal constant that changes yearly and is not stored here yet.'),

  ('ohio', 'Ohio business income', 0.03000, 25000000000, '2026-01-01',
   'https://tax.ohio.gov/individual/Business-Income-Deduction', '2026-09-23',
   'Business Income Deduction exempts the first $250,000; a flat 3% applies '
   'above it. A solo salon is far below the threshold, so this line is '
   'expected to be zero — say so on screen rather than showing a $0 that '
   'reads like a bug.'),

  ('kettering', 'Kettering municipal income tax', 0.02250, null, '2026-01-01',
   'https://www.ketteringoh.org/businesses-2/', '2026-09-23',
   'On net profit earned in Kettering, which is where the salon is. Estimated-'
   'payment threshold and due dates are NOT yet confirmed — (937) 296-2502.'),

  ('oakwood', 'Oakwood municipal income tax', 0.02500, null, '2026-01-01',
   'https://oakwoodohio.gov/departments/income-tax/', '2026-09-23',
   'Residence. Oakwood left RITA for City Tax on 1 Jan 2026, so pre-2026 '
   'guidance names the wrong agency. Rate is secondary-sourced — confirm on '
   '(937) 298-0531. Estimated-payment threshold also unconfirmed.'),

  ('oakwood_credit', 'Oakwood credit for tax paid to another municipality',
   0.90000, null, '2026-01-01',
   'https://codelibrary.amlegal.com/codes/oakwoodoh/latest/oakwood_oh/0-0-0-2221',
   '2026-09-23',
   'NINETY percent, not a hundred. Kettering takes 2.25%; Oakwood credits 90% '
   'of that against its own 2.50%, leaving roughly 0.475% still owed. This is '
   'the line that gets missed. Secondary-sourced: the ordinance page returned '
   '403 to an automated fetch and needs reading by hand.')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Category seed
-- ---------------------------------------------------------------------------
--
-- Schedule C lines as printed on the form. `kind` is what the screens use.

insert into public.expense_categories (name, schedule_c_line, kind, sort_order) values
  ('Studio rent',              '20b', 'fixed',    10),
  ('Insurance',                '15',  'fixed',    20),
  ('Phone and internet',       '25',  'fixed',    30),
  ('Software and subscriptions','27a','fixed',    40),
  ('Licenses and permits',     '23',  'fixed',    50),

  ('Colour and developer',     '22',  'product',  60),
  ('Back bar and supplies',    '22',  'product',  70),
  ('Tools and equipment',      '22',  'product',  80),

  ('Retail stock for resale',  'P3',  'resale',   90),

  ('Card processing fees',     '10',  'variable', 100),
  ('Advertising and marketing','8',   'variable', 110),
  ('Continuing education',     '27a', 'variable', 120),
  ('Professional services',    '17',  'variable', 130),
  ('Repairs and maintenance',  '21',  'variable', 140),
  ('Office expense',           '18',  'variable', 150),
  ('Car and mileage',          '9',   'variable', 160),
  ('Meals (deductible half)',  '24b', 'variable', 170),

  ('Owner draw',               null,  'owner',    900),
  ('Transfer between accounts',null,  'owner',    910),
  ('Personal',                 null,  'excluded', 920)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- All five are Evelyn-only. This is her bank feed; there is no public page
-- that reads any of it and there must never be one. Anon gets nothing, not
-- even the category names.

alter table public.bank_accounts      enable row level security;
alter table public.bank_transactions  enable row level security;
alter table public.expense_categories enable row level security;
alter table public.category_rules     enable row level security;
alter table public.tax_rates          enable row level security;

drop policy if exists bank_accounts_admin_all on public.bank_accounts;
create policy bank_accounts_admin_all on public.bank_accounts
  for all to authenticated using (true) with check (true);

drop policy if exists bank_transactions_admin_all on public.bank_transactions;
create policy bank_transactions_admin_all on public.bank_transactions
  for all to authenticated using (true) with check (true);

drop policy if exists expense_categories_admin_all on public.expense_categories;
create policy expense_categories_admin_all on public.expense_categories
  for all to authenticated using (true) with check (true);

drop policy if exists category_rules_admin_all on public.category_rules;
create policy category_rules_admin_all on public.category_rules
  for all to authenticated using (true) with check (true);

drop policy if exists tax_rates_admin_all on public.tax_rates;
create policy tax_rates_admin_all on public.tax_rates
  for all to authenticated using (true) with check (true);

commit;
