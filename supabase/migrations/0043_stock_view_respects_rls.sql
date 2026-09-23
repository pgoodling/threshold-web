-- Threshold Salon — make the stock view obey the same rules as its tables.
--
-- 0042 created public.product_stock over products and inventory_movements,
-- both of which have RLS restricting them to authenticated. The view did not
-- set security_invoker.
--
-- In Postgres a view executes with the privileges of its OWNER, not of whoever
-- queries it. So a view owned by postgres, over tables that refuse anonymous
-- readers, will happily answer an anonymous reader — RLS on the tables is
-- simply not consulted. `security_invoker = true` (PG 15+) reverses that: the
-- view runs as the caller and the underlying policies apply.
--
-- Whether it was actually leaking was never established, and deliberately so.
-- The check was inconclusive because there are no products yet — an empty
-- table and a blocked query both answer `[]`, which is exactly the kind of
-- reassurance that isn't one. Being correct is cheaper than finding out.
--
-- What would have leaked: every product, what she pays for it, what she
-- charges, and how much is on the shelf. The public booking page has no reason
-- to know any of it.
--
-- To confirm once there ARE products, with the anon key that ships to every
-- browser anyway:
--
--   curl "$URL/rest/v1/product_stock?select=name,unit_cost_cents&limit=3" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--
-- `[]` with products present is the right answer. Rows would mean this
-- migration never ran.

begin;

drop view if exists public.product_stock;

create view public.product_stock
with (security_invoker = true)
as
select
  p.id                         as product_id,
  p.sku,
  p.supplier,
  p.brand,
  p.name,
  p.size,
  p.unit_cost_cents,
  p.retail_price_cents,
  p.sells_retail,
  p.used_at_backbar,
  p.reorder_at,
  p.active,
  coalesce(sum(m.quantity), 0) as on_hand,
  coalesce(sum(m.quantity) filter (where m.kind = 'sold'), 0)     as sold_total,
  coalesce(sum(m.quantity) filter (where m.kind = 'used'), 0)     as used_total,
  coalesce(sum(m.quantity) filter (where m.kind = 'received'), 0) as received_total,
  max(m.occurred_on)           as last_movement_on
from public.products p
left join public.inventory_movements m on m.product_id = p.id
group by p.id;

comment on view public.product_stock is
  'Stock on hand as the sum of the ledger, never a stored counter. '
  'security_invoker so the RLS on products and inventory_movements actually '
  'applies — without it this view would answer anonymous callers with every '
  'cost and price in the salon.';

commit;
