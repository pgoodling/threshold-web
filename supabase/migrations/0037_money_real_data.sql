-- Threshold Salon — corrections to 0036, made after reading two real Relay
-- statements rather than imagining what one looks like.
--
-- Three things the schema got wrong, all of them the same mistake: 0036 was
-- designed around expenses, and a bank feed is not an expense feed.
--
--   1. Money comes IN as well as out, and in three different flavours that must
--      never be added together.
--   2. A transaction can be pending, and a pending amount is not final.
--   3. The statement carries a running balance, which is free proof that the
--      import is complete.
--
-- What the real data showed, for whoever reads this later:
--
--   Every Intuit deposit is paired with a separate "TRAN FEE" debit at exactly
--   2.3003% across 13 pairs — $5,337.12 deposited, $122.77 taken. So card
--   processing cost is mechanical, and the deposits are checkable against what
--   the appointment book says she took.
--
--   $3,300 arrived as "Receive" from USAA CLASSIC CHECKING via ACH Pull. That
--   is her own money funding the business, not income. Counting it as revenue
--   would overstate her profit by $3,300 and she would pay tax on it.
--
--   Salon Lofts is $250 WEEKLY, not monthly. That is the break-even numerator.

begin;

-- ---------------------------------------------------------------------------
-- 1. Money coming in
-- ---------------------------------------------------------------------------
--
-- 0036's `kind` had six values and every one of them described a way to spend.
-- Two more, kept separate because conflating them is the expensive mistake:
--
--   revenue       money the business earned. Reconcilable against checkouts.
--   contribution  money the owner put in. Not income, not taxable, not profit.
--
-- `owner` already existed for draws. Contributions could have gone there since
-- amount_cents is signed, but a draw and a capital contribution answer
-- different questions and reporting them as one line is how a $3,300 ACH pull
-- disappears into "owner stuff".

alter table public.expense_categories
  drop constraint if exists expense_categories_kind_check;

alter table public.expense_categories
  add constraint expense_categories_kind_check
  check (kind in ('fixed', 'product', 'variable', 'resale',
                  'owner', 'contribution', 'revenue', 'excluded'));

comment on column public.expense_categories.kind is
  'Drives the screens, not the tax form. Break-even sums kind=fixed; cost per '
  'service allocates kind=product; revenue reconciles against checkouts; '
  'owner, contribution and excluded must never reach a profit or tax figure.';

insert into public.expense_categories (name, schedule_c_line, kind, sort_order) values
  -- Gross, before the processor's fee. The fee is its own expense row, which
  -- is how Relay reports it and how Schedule C wants it.
  ('Card revenue (Intuit)',  '1',  'revenue',      1),
  ('Cash and other takings', '1',  'revenue',      2),
  ('Owner contribution',     null, 'contribution', 890)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Pending
-- ---------------------------------------------------------------------------
--
-- Relay's CSV carries Status=SETTLED, and a live feed will carry pending rows
-- whose amount can still change — a hold that settles lower, a partial ship.
-- A pending amount must not be counted as final, and must be updated in place
-- rather than inserted again when it posts.

alter table public.bank_transactions
  add column if not exists pending boolean not null default false;

comment on column public.bank_transactions.pending is
  'True while the bank still calls this an authorization. The amount can '
  'change before it settles, so pending rows are shown and never counted in a '
  'tax or profit figure.';

create index if not exists bank_transactions_pending
  on public.bank_transactions (posted_on)
  where pending;

-- ---------------------------------------------------------------------------
-- 3. Running balance
-- ---------------------------------------------------------------------------
--
-- Every Relay row carries the balance after it, and the chain links across
-- statement files: August closes at 2470.36, September's amounts sum to
-- +1892.95, September closes at 4363.31. Exactly.
--
-- So the importer can prove it has every transaction rather than hoping. That
-- was assumed to need OFX; the CSV has it, which removes the only real reason
-- to prefer OFX now that FITID is off the table anyway.

alter table public.bank_transactions
  add column if not exists balance_after_cents bigint;

comment on column public.bank_transactions.balance_after_cents is
  'Account balance immediately after this transaction, when the source gives '
  'one. Lets the importer verify a batch chains cleanly instead of trusting '
  'that nothing was dropped. Null when the source does not report it.';

-- ---------------------------------------------------------------------------
-- 4. Rules, seeded from what her statements actually say
-- ---------------------------------------------------------------------------
--
-- Patterns taken from two real months, not invented. Priority orders them:
-- the Intuit fee rule must beat the Intuit deposit rule, because both match
-- on "INTUIT" and only the reference text tells them apart — which `contains`
-- cannot express. Until the matcher can see the reference column, the fee rule
-- runs first and the deposit rule catches the rest.
--
-- These are suggestions. Every one still lands as unreviewed.

insert into public.category_rules (pattern, category_id, is_business, priority)
select r.pattern, c.id, r.is_business, r.priority
from (values
  ('TRAN FEE',              'Card processing fees',   true,  10),
  ('SALON LOFTS',           'Studio rent',            true,  20),
  ('CosmoProf',             'Colour and developer',   true,  30),
  ('SalonCentric',          'Colour and developer',   true,  31),
  ('Premier Beauty Supply', 'Colour and developer',   true,  32),
  ('USAA',                  'Owner contribution',     true,  40),
  ('Business Savings',      'Transfer between accounts', true, 50),
  ('OpenAI',                'Software and subscriptions', true, 60),
  ('INTUIT',                'Card revenue (Intuit)',  true,  90)
) as r(pattern, category_name, is_business, priority)
join public.expense_categories c on c.name = r.category_name
on conflict do nothing;

commit;

-- Deliberately NOT given rules, because a rule here would be a guess that
-- looks like a fact:
--
--   Amazon                 seven charges in September, $830 total, anything
--                          from back-bar supplies to a lamp to something
--                          personal. Needs her eyes, every time, until a
--                          pattern earns a rule.
--   At Home DC / COMENITY  store-card payments. The payment is not the
--                          expense; whatever was bought on the card is. Asking
--                          her to categorise the payment teaches the wrong
--                          model, so these need their own treatment.
--   HomeGoods, Sherwin-Williams, Ace Hardware
--                          buildout, almost certainly capitalisable rather
--                          than a straight deduction. That is a question for
--                          whoever prepares the return, not a rule.
--   LUMINOUS NAIL SPA      probably personal. Exactly the row the nullable
--                          is_business column exists for.
