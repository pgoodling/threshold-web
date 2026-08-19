-- Threshold Salon — tidy the capitalisation on client names.
--
-- The clients imported from the paper book came in however they were typed:
-- "sarah jenkins", "MARY SMITH", "anne-marie o'brien". This puts every part of
-- every name into title case.
--
-- Run step 1 on its own first. It shows only the rows that would change, old
-- next to new, so you can look before anything is written. Step 2 is the update.
--
-- Safe to re-run: names already correct are skipped, and `first_name_key`
-- recomputes itself because it's a generated column.

-- ── The rule ──────────────────────────────────────────────────────────────
--
-- Postgres's initcap() does nearly all of it: it treats any non-alphanumeric
-- character as a word break, so hyphens and apostrophes are already handled --
-- "anne-marie o'brien" comes out as "Anne-Marie O'Brien" with no help.
--
-- That leaves two things it gets wrong, both fixed word by word below:
--   McDonald / MacLeod  -- initcap gives "Mcdonald", "Macleod"
--   III, IV             -- initcap gives "Iii", "Iv"
--
-- Deliberately NOT handled: "van der Berg", "de Silva". Whether those particles
-- stay lowercase is a family preference rather than a rule -- plenty of American
-- families write Van Dyke -- and anything this gets wrong is a one-line fix on
-- her client card. Better that than a script quietly imposing a convention.

create or replace function public.title_case_name(raw text)
returns text
language sql
immutable
as $$
  select nullif(
    (
      select string_agg(fixed, ' ' order by ord)
      from (
        select
          ord,
          case
            -- Initials used as a first name: JJ, TJ, AJ. Only in first
            -- position, because that's where initials go and it keeps this
            -- clear of "Jr" at the end.
            --
            -- An explicit list rather than a clever rule, because every clever
            -- rule breaks a real name: "two letters, no vowel" turns Ty into
            -- TY, and "contains a J" turns Jo into JO. Add to the list if one
            -- turns up in the preview.
            when ord = 1 and lower(w) = any (array[
              'aj','bj','cj','dj','ej','jj','kj','lj','mj','pj','rj','tj','vj',
              'jb','jc','jd','jk','jl','jm','jp','jt','jw','kc','cc','tc','bb'
            ]) then upper(w)
            -- McDonald, but not a surname that is simply "Mac" or "Mc".
            when w ~* '^mc.'            then 'Mc'  || upper(substr(w, 3, 1)) || substr(w, 4)
            when w ~* '^mac..'          then 'Mac' || upper(substr(w, 4, 1)) || substr(w, 5)
            -- Generational suffixes.
            when w ~* '^(ii|iii|iv|vi|vii|viii|ix)\.?$' then upper(w)
            else w
          end as fixed
        from regexp_split_to_table(
               initcap(regexp_replace(btrim(coalesce(raw, '')), '\s+', ' ', 'g')),
               ' '
             ) with ordinality as t(w, ord)
        where w <> ''
      ) parts
    ),
    ''
  );
$$;

-- ── 1. Preview. Run this on its own first. ────────────────────────────────
select
  full_name                         as before,
  public.title_case_name(full_name) as after
from public.clients
where full_name is not null
  and full_name is distinct from public.title_case_name(full_name)
order by full_name;

-- ── 2. Apply, once the preview looks right. ───────────────────────────────
--
-- update public.clients
--    set full_name = public.title_case_name(full_name)
--  where full_name is not null
--    and full_name is distinct from public.title_case_name(full_name);

-- ── 3. Optional: remove the helper afterwards. ────────────────────────────
--
-- drop function if exists public.title_case_name(text);
