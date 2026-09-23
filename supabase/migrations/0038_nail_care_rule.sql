-- Threshold Salon — her nails are a business expense.
--
-- 0037 listed LUMINOUS NAIL SPA as "probably personal" and deliberately gave
-- it no rule. That was wrong, and the correction is worth writing down rather
-- than quietly adding a row.
--
-- The position, per Paul (2026-09-23), taken on their accountant's advice:
-- her hands are in every photograph, in front of every client, for the whole
-- of every appointment. For a colourist they are working equipment on display,
-- not grooming. The accountant considers it defensible.
--
-- Recorded here with its provenance because that is what makes it survive. An
-- unexplained "Nail care — business" row in a category list invites a future
-- reader to delete it as an obvious mistake. A deduction that was taken on
-- professional advice should be able to say so, and should be able to say
-- WHEN, since the advice was given against this year's facts.
--
-- Not generalised beyond nails. Hair, clothing and the rest are their own
-- questions with their own answers, and the accountant was asked about this
-- one.

begin;

insert into public.expense_categories (name, schedule_c_line, kind, sort_order)
values ('Nail care (working hands)', '27a', 'variable', 175)
on conflict (name) do nothing;

comment on table public.expense_categories is
  'Spend and income buckets, each tied to a Schedule C line where one applies. '
  'Anything unobvious — see Nail care — carries its reasoning in the migration '
  'that added it.';

insert into public.category_rules (pattern, category_id, is_business, priority)
select 'NAIL SPA', c.id, true, 70
from public.expense_categories c
where c.name = 'Nail care (working hands)'
on conflict do nothing;

commit;
