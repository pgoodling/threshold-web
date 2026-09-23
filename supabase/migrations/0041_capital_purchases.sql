-- Threshold Salon — the chair, the drapes, the decor.
--
-- What she bought to fit the suite out is not supplies, and the schema had
-- nowhere honest to put it. "Tools and equipment" exists but is kind='product',
-- which means the reports allocate it across appointments as cost-of-service.
-- Shears and brushes belong there. A styling chair does not — a haircut does
-- not consume a fraction of a chair.
--
-- WHY THESE NEED THEIR OWN KIND
--
-- A chair, a mirror, drapes and art are capital purchases. The default
-- treatment is depreciation over years, not a deduction now. Two things change
-- that here, and both are decisions rather than facts:
--
--   * The DE MINIMIS SAFE HARBOUR lets a business without an applicable
--     financial statement expense anything up to $2,500 per item or invoice
--     instead of capitalising it. Her largest single purchase is HomeGoods at
--     $426.98, so everything qualifies comfortably.
--   * It is an ANNUAL ELECTION made on the return. If nobody makes it, these
--     have to be depreciated after all.
--
-- So the app must not quietly file them as ordinary expenses. kind='capital'
-- keeps them visible as a group that needs a decision, and lets a report say
-- "$1,200 of equipment — confirm the de minimis election" instead of burying
-- it in Supplies where nobody would ever ask.
--
-- Note this is orthogonal to pre-opening. Most of hers is both capital AND a
-- §195 startup cost, and those are separate questions with separate answers.
-- 0039 handles the timing by date; this handles the nature by category.
--
-- The Schedule C line is left null deliberately. It is '13' (Depreciation) if
-- capitalised and '22' or '27a' if expensed under de minimis, and which one is
-- not knowable until the election is made. A confidently wrong line number is
-- worse than an obviously absent one.

begin;

alter table public.expense_categories
  drop constraint if exists expense_categories_kind_check;

alter table public.expense_categories
  add constraint expense_categories_kind_check
  check (kind in ('fixed', 'product', 'variable', 'resale',
                  'owner', 'contribution', 'revenue', 'excluded', 'capital'));

insert into public.expense_categories (name, schedule_c_line, kind, sort_order) values
  ('Furniture and fixtures',   null, 'capital', 180),
  ('Salon equipment',          null, 'capital', 181),
  ('Decor and finishing',      null, 'capital', 182)
on conflict (name) do nothing;

comment on column public.expense_categories.kind is
  'Drives the screens, not the tax form. Break-even sums kind=fixed; cost per '
  'service allocates kind=product; revenue reconciles against checkouts; '
  'capital needs a depreciate-or-expense decision before it is deductible; '
  'owner, contribution and excluded must never reach a profit or tax figure.';

-- One rule, for the one merchant where it is unambiguous. HomeGoods on her
-- statements is a $426.98 card purchase during the fit-out, not a store-card
-- payment. Amazon gets no rule and never will — seven charges, $830, and they
-- genuinely vary between back bar, a lamp and something personal.
insert into public.category_rules (pattern, category_id, is_business, priority)
select 'HomeGoods', c.id, true, 75
  from public.expense_categories c
 where c.name = 'Decor and finishing'
on conflict do nothing;

commit;

-- Left for whoever prepares the return, and deliberately not guessed at here:
--
--   * Whether to make the de minimis election at all. It is near-automatic at
--     these amounts, but it is still a choice, and Section 179 or bonus
--     depreciation may suit better in a year with different income.
--   * Whether the Sherwin-Williams paint is a leasehold improvement rather
--     than either of these. It is in Repairs and maintenance for now; see 0039.
--   * Whether shears and brushes should move out of kind='product'. They are
--     capital in principle and consumable in practice, and allocating them
--     across appointments is arguably the more useful answer for her.
