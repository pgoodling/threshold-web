-- Threshold Salon — what she bought, what she sold, and what she used on heads.
--
-- Design record: docs/MONEY.md. This is backlog #18, and the thing that forced
-- it is a single Premier Beauty Supply invoice: order #888385, $247.37, which
-- reconciles exactly to the bank row of 11 August. About $33 of it is colour
-- and back bar. About $176 is retail stock. One bank row, two entirely
-- different tax treatments, and no per-merchant rule can ever split it.
--
-- THE IDEA THIS IS BUILT ON
--
-- A product is not retail OR back bar. The same tube of maria nila dry shampoo
-- might be sold to one client and used on the next. So the direction is a
-- property of the MOVEMENT, not of the product — and it cannot be known when
-- the stock is bought.
--
-- That is not a modelling nicety, it is the tax treatment:
--
--   sold  →  cost of goods sold (Schedule C Part III), against retail revenue
--   used  →  a supply consumed delivering a service, against service revenue
--
-- Same invoice line, two answers, decided later. Anything that fixes the
-- answer at purchase time gets it wrong for every product she does both with.
--
-- A LEDGER, NOT A COUNTER
--
-- Stock on hand is the sum of movements, never a stored number. A
-- quantity_on_hand column drifts the first time two things happen at once, and
-- when it disagrees with reality it cannot say why. A ledger can always show
-- its working: received 12, sold 3, used 5, counted 1 short.
--
-- WHAT THIS DELIBERATELY DOES NOT TRY TO DO
--
-- It does not expect her to record every squirt of shampoo. That system
-- doesn't exist because nobody maintains it. Colour is different — a formula
-- is already measured in ounces and already on the client card — so colour can
-- be costed properly per appointment and everything else stays on period
-- allocation. See docs/MONEY.md.

begin;

-- ---------------------------------------------------------------------------
-- The catalogue
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),

  -- The supplier's product number. Keune's are shade codes — 26093 is Tinta
  -- 9.3, Very Light Golden Blonde — which is what will eventually let a
  -- client's stored hair_formula resolve to a real unit cost.
  sku         text,
  supplier    text,
  brand       text,
  name        text not null,

  -- As printed: '2 Fl. Oz.', 'Liter', '68 pc.'. Free text on purpose — this is
  -- for her eyes and for matching an invoice line, not for arithmetic.
  size        text,

  -- What she pays. Null until an invoice says otherwise; the most recent
  -- receipt updates it, and history lives in the movements.
  unit_cost_cents  integer check (unit_cost_cents is null or unit_cost_cents >= 0),

  -- What a client pays. Null for anything she'd never sell.
  retail_price_cents integer check (retail_price_cents is null or retail_price_cents >= 0),

  -- Hints for the UI, not constraints on behaviour. A product marked back-bar
  -- only can still be sold; these decide what the screens offer first, and
  -- nothing more. The movement is always the truth.
  sells_retail boolean not null default false,
  used_at_backbar boolean not null default false,

  -- Nudge when stock on hand falls to or below this. Null means don't.
  reorder_at  numeric(10,3) check (reorder_at is null or reorder_at >= 0),

  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.products is
  'The catalogue. Stock on hand is never stored here — it is the sum of '
  'inventory_movements. See docs/MONEY.md.';

comment on column public.products.sells_retail is
  'A hint for the screens, not a rule. The same product can be sold and used, '
  'and which one happened is recorded on the movement.';

-- One row per supplier SKU. Case-insensitive, because an invoice and a
-- spreadsheet will disagree about capitals eventually.
create unique index if not exists products_sku_uniq
  on public.products (supplier, lower(sku))
  where sku is not null;

create index if not exists products_active_name
  on public.products (name)
  where active;

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_movements (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,

  -- received  stock arriving, from an invoice or counted in
  -- sold       a client bought it
  -- used       consumed at the back bar, on a head
  -- adjusted   a stock count, breakage, a correction
  kind        text not null check (kind in ('received', 'sold', 'used', 'adjusted')),

  -- SIGNED, and the sign must agree with the kind — see the constraint below.
  -- Signed rather than positive-plus-a-direction for the same reason
  -- bank_transactions.amount_cents is: one stream, both directions, and no
  -- second column that can contradict the first.
  --
  -- Fractional on purpose. A litre of developer is not used a litre at a time.
  quantity    numeric(10,3) not null check (quantity <> 0),

  -- What this movement was worth, per unit, at the time it happened. Copied
  -- rather than read from products.unit_cost_cents, because that changes with
  -- the next invoice and last March's cost of goods must not change with it.
  unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),

  -- What the client paid, on a sale. Same reasoning.
  unit_price_cents integer check (unit_price_cents is null or unit_price_cents >= 0),

  occurred_on date not null default current_date,

  -- Which visit. This is the whole answer to "what is she using on
  -- appointments" — for a sale, who bought it; for back-bar use, whose head it
  -- went on. Null for a delivery or a stock count.
  appointment_id uuid references public.appointments(id) on delete set null,

  -- The purchase this arrived on, so a delivery reconciles against the money
  -- that left the bank.
  bank_transaction_id uuid references public.bank_transactions(id) on delete set null,

  -- The supplier's order number, e.g. '888385'. Kept even when the bank row is
  -- unknown, which is the case for everything she bought before Relay.
  invoice_ref text,

  note        text,
  created_at  timestamptz not null default now(),

  -- The sign is not decoration. A 'sold' row with a positive quantity would
  -- silently add stock every time she sold something.
  constraint inventory_movements_sign_matches_kind check (
    (kind = 'received' and quantity > 0)
    or (kind in ('sold', 'used') and quantity < 0)
    or (kind = 'adjusted')
  )
);

comment on column public.inventory_movements.quantity is
  'Signed: positive in, negative out. Fractional, because a litre of developer '
  'is not used a litre at a time.';

comment on column public.inventory_movements.unit_cost_cents is
  'The cost at the moment this happened, copied not referenced. The next '
  'invoice changes what a tube costs; it must not change what last March cost.';

comment on column public.inventory_movements.appointment_id is
  'Which visit consumed or bought this. The answer to "what is she using on '
  'appointments", and the link that makes true margin per service possible.';

create index if not exists inventory_movements_product
  on public.inventory_movements (product_id, occurred_on);

create index if not exists inventory_movements_appointment
  on public.inventory_movements (appointment_id)
  where appointment_id is not null;

create index if not exists inventory_movements_occurred
  on public.inventory_movements (occurred_on);

-- ---------------------------------------------------------------------------
-- Stock on hand
-- ---------------------------------------------------------------------------
--
-- A view, so it cannot drift from the ledger it is derived from. Products with
-- no movements still appear, at zero — otherwise something she has catalogued
-- but never received would vanish from her own stock list.

create or replace view public.product_stock as
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
  'Stock on hand as the sum of the ledger, never a stored counter. A stored '
  'count drifts and cannot explain itself; this can always show its working.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
--
-- Evelyn only, like the rest of the money schema. Note the public booking page
-- has no reason to know what anything costs her.

alter table public.products            enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists products_admin_all on public.products;
create policy products_admin_all on public.products
  for all to authenticated using (true) with check (true);

drop policy if exists inventory_movements_admin_all on public.inventory_movements;
create policy inventory_movements_admin_all on public.inventory_movements
  for all to authenticated using (true) with check (true);

commit;
