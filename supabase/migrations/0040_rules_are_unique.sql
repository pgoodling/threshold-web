-- Threshold Salon — make a rule seed safe to run twice.
--
-- 0037 and 0038 both end their inserts with `on conflict do nothing`, which
-- reads like idempotence and isn't. ON CONFLICT needs something to conflict
-- ON, and 0036 created category_rules with no unique constraint on pattern. So
-- a second run of either migration inserts a duplicate rule rather than doing
-- nothing.
--
-- Found the honest way: Paul couldn't remember whether he'd run 0038, and the
-- checker can't tell him because RLS hides the rows from its anon probe. "Just
-- run it again, it's idempotent" was about to be wrong advice.
--
-- Duplicates are not catastrophic — matching takes the first hit by priority,
-- so two identical rules behave like one. But they make the rules list
-- nonsense to read, and "always, for Walgreens" pressed twice would quietly
-- accumulate.
--
-- Fix in the right order: clear any duplicates that already exist, then add
-- the constraint that stops more appearing. Adding the index first would fail
-- on exactly the databases that need it most.

begin;

-- Keep the earliest of each duplicate set, drop the rest. Matching on the
-- pattern case-insensitively, because that is how the matcher compares them --
-- 'NAIL SPA' and 'Nail Spa' are one rule, not two.
delete from public.category_rules a
 using public.category_rules b
 where lower(a.pattern) = lower(b.pattern)
   and a.created_at > b.created_at;

-- Belt and braces: identical created_at (same statement) leaves ties above.
delete from public.category_rules a
 using public.category_rules b
 where lower(a.pattern) = lower(b.pattern)
   and a.created_at = b.created_at
   and a.id > b.id;

create unique index if not exists category_rules_pattern_uniq
  on public.category_rules (lower(pattern));

comment on index public.category_rules_pattern_uniq is
  'One rule per pattern, case-insensitive — matching lowercases both sides. '
  'Also what makes `on conflict do nothing` in the seed migrations mean what '
  'it says, so re-running one is genuinely a no-op.';

commit;
