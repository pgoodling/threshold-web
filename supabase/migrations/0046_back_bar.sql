-- Threshold Salon — the shelf and the back bar are two places, not one.
--
-- Until now a product had one number, "on hand", and opening a bottle took it
-- off that number for good. Evelyn works with two: what is still sealed on the
-- shelf, and what is open on the back bar being used. A bottle moves shelf →
-- bar when she opens it, and leaves the bar when it's empty and in the bin.
--
-- No new table and no location column. The bar is already implied by the
-- ledger: every 'used' row is a bottle that left the shelf into use, so
--
--     on the bar = bottles opened ('used')  −  bottles finished ('finished')
--
-- which means every 'used' row already recorded — the Today taps of 25 Sep and
-- the 26 shortfalls from the 29 Sep count — lands on the bar with nothing to
-- convert. She marks the empty ones finished and what's left is true.
--
-- Two new kinds:
--
--   finished  a bottle on the bar is empty. Moves nothing on the shelf, and is
--             NOT a cost: the cost was taken when it was opened, because an
--             open bottle can't be sold or sent back. Counting it again at the
--             bin would count it twice.
--
--   missing   the shelf count came up short. Theft, breakage, a sale that
--             skipped check-out, or a bottle opened without the tap — the count
--             can't tell which, so it doesn't pretend to. Kept apart from
--             'used' so a stolen bottle never shows up as product cost, and
--             apart from 'adjusted' so shrinkage can be totalled on its own.
--
-- Safe to run twice.

begin;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_kind_check;
alter table public.inventory_movements
  add constraint inventory_movements_kind_check
  check (kind in ('received', 'sold', 'used', 'finished', 'missing', 'adjusted'));

alter table public.inventory_movements
  drop constraint if exists inventory_movements_sign_matches_kind;
alter table public.inventory_movements
  add constraint inventory_movements_sign_matches_kind check (
    (kind = 'received' and quantity > 0)
    or (kind in ('sold', 'used', 'finished', 'missing') and quantity < 0)
    or (kind = 'adjusted')
  );

comment on column public.inventory_movements.kind is
  'received: arrived on the shelf. used: shelf → back bar (the cost is taken '
  'here). finished: empty, off the back bar — not a cost. sold: shelf → a '
  'client. missing: short at a count. adjusted: anything else, e.g. a kit split.';

-- The view, again. Dropped rather than replaced because on_hand changes
-- meaning (it no longer counts finished rows, which never touched the shelf)
-- and security_invoker must survive — see 0043 for why that matters.
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
  -- The shelf. Everything except 'finished', which only ever touches the bar.
  coalesce(sum(m.quantity) filter (where m.kind <> 'finished'), 0) as on_hand,
  coalesce(sum(m.quantity) filter (where m.kind = 'sold'), 0)      as sold_total,
  coalesce(sum(m.quantity) filter (where m.kind = 'used'), 0)      as used_total,
  coalesce(sum(m.quantity) filter (where m.kind = 'received'), 0)  as received_total,
  max(m.occurred_on)           as last_movement_on,
  -- The back bar: opened minus finished. Both are stored negative.
  coalesce(-sum(m.quantity) filter (where m.kind = 'used'), 0)
    + coalesce(sum(m.quantity) filter (where m.kind = 'finished'), 0) as on_bar
from public.products p
left join public.inventory_movements m on m.product_id = p.id
group by p.id;

comment on view public.product_stock is
  'Shelf (on_hand) and back bar (on_bar) as sums of the ledger, never stored '
  'counters. security_invoker so the RLS on the underlying tables applies.';

commit;
