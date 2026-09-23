-- Threshold Salon — the day she opened, so the books can tell startup costs
-- from running costs.
--
-- The question that prompted this: what is the Sherwin-Williams charge? Paint
-- for the suite, bought 23 August. She opened 7 September. So it is not
-- repairs and maintenance — it is a startup cost under IRC §195, which is a
-- different rule with a different line, even though an identical tin of paint
-- bought in October would be an ordinary expense.
--
-- Fifteen transactions totalling $1,801.40 sit before the opening date:
-- HomeGoods $426.98, five Amazon charges at $708.87, Premier Beauty Supply
-- $247.37, CosmoProf $88.12, Sherwin-Williams $72.23, and the rest. All of it
-- is under the $5,000 §195 first-year allowance, so it is likely deductible
-- this year rather than amortised over fifteen — but it has to be IDENTIFIED
-- as startup to be treated that way, and nothing in the schema could say so.
--
-- WHY A DATE AND NOT A CATEGORY
--
-- The obvious move is a "Startup costs" category. It is the wrong one: it
-- throws away what the thing actually was. Paint filed under Startup Costs is
-- no longer paint, and the question "what did the buildout cost me" stops
-- being answerable at the same time as "what do I spend on repairs".
--
-- Pre-opening is a property of WHEN something was bought, not of what it was.
-- So the paint stays in Repairs and maintenance, and any report that cares
-- about §195 groups on posted_on < opened_on. One fact, stored once, and every
-- transaction keeps its real category.
--
-- It also means nothing needs re-categorising if the date is ever corrected.

begin;

alter table public.salon_settings
  add column if not exists opened_on date;

comment on column public.salon_settings.opened_on is
  'The day the salon opened for business — 7 September 2026. Spending before '
  'this date is a startup cost under IRC §195 rather than an ordinary '
  'expense, so reporting groups on it. Kept as a date rather than a category '
  'so a pre-opening purchase keeps its real category too.';

update public.salon_settings
   set opened_on = date '2026-09-07'
 where opened_on is null;

commit;

-- Not decided here, and deliberately left to whoever prepares the return:
--
--   * Whether painting a LEASED suite is a currently-deductible repair or a
--     leasehold improvement to be depreciated. At $72.23 the de minimis safe
--     harbour ($2,500 per item) makes it moot, but the same question on a
--     larger buildout would not be.
--   * Whether the pre-opening nail appointment is a startup cost as well as a
--     business expense. It is a business expense on their accountant's advice
--     (see 0038); whether it was incurred to GET the business open is a
--     further question nobody has asked yet.
