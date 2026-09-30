-- Threshold Salon — selling product, with or without an appointment.
--
-- A sale is its own record because two things have nowhere else to live:
--
--   * A walk-in who buys a bottle has no appointment, so there is no row to
--     put the payment method on.
--   * A one-off item — a comb, a gift bag — isn't stock, so there is no
--     product to hang an inventory movement off.
--
-- It also puts every retail dollar and every cent of sales tax in one place,
-- which is exactly what the Ohio return asks for. Service takings stay on
-- appointments.paid_cents, apart from this, on purpose: tax applies to one and
-- not the other, and folding a $32 bottle into a $145 colour would inflate the
-- average ticket and every margin figure built on it.
--
-- Stock still moves through inventory_movements: a line sold from the shelf
-- writes a 'sold' movement and points at it. A custom line writes none.
--
-- record_retail_sale() does the whole thing in one transaction — sale, lines,
-- movements and, at check-out, the appointment itself — so a dropped
-- connection can't leave a bottle off the shelf with no sale behind it, or a
-- sale recorded against an appointment still showing unpaid.
--
-- Safe to run twice.

begin;

create table if not exists public.retail_sales (
  id              uuid primary key default gen_random_uuid(),
  sold_at         timestamptz not null default now(),
  sold_on         date not null default (now() at time zone 'America/New_York')::date,
  appointment_id  uuid references public.appointments(id) on delete set null,
  client_id       uuid references public.clients(id) on delete set null,
  payment_method  text,
  -- The rate in force when she rang it up, copied so a later rate change
  -- can't rewrite what she collected.
  tax_rate        numeric(6,5) not null,
  subtotal_cents  integer not null default 0 check (subtotal_cents >= 0),
  tax_cents       integer not null default 0 check (tax_cents >= 0),
  total_cents     integer not null default 0 check (total_cents >= 0),
  created_at      timestamptz not null default now()
);

comment on table public.retail_sales is
  'Retail product sales, at check-out or on their own. Services are never '
  'here — they stay on appointments.paid_cents, untaxed.';

create table if not exists public.retail_sale_lines (
  id               uuid primary key default gen_random_uuid(),
  sale_id          uuid not null references public.retail_sales(id) on delete cascade,
  -- Null for a one-off item that isn't stock.
  product_id       uuid references public.products(id) on delete set null,
  description      text not null,
  quantity         numeric(10,3) not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  unit_tax_cents   integer not null check (unit_tax_cents >= 0),
  unit_cost_cents  integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  movement_id      uuid references public.inventory_movements(id) on delete set null
);

create index if not exists retail_sales_sold_on on public.retail_sales (sold_on);
create index if not exists retail_sales_appointment on public.retail_sales (appointment_id)
  where appointment_id is not null;
create index if not exists retail_sale_lines_sale on public.retail_sale_lines (sale_id);

alter table public.retail_sales      enable row level security;
alter table public.retail_sale_lines enable row level security;

drop policy if exists retail_sales_admin_all on public.retail_sales;
create policy retail_sales_admin_all on public.retail_sales
  for all to authenticated using (true) with check (true);

drop policy if exists retail_sale_lines_admin_all on public.retail_sale_lines;
create policy retail_sale_lines_admin_all on public.retail_sale_lines
  for all to authenticated using (true) with check (true);

-- p_lines: [{ "product_id": uuid|null, "description": text,
--             "quantity": n, "unit_price_cents": n }, ...]
--
-- The rate is read here, not passed in, so the screen can't disagree with
-- the tax_rates table. Tax is worked out per unit and rounded, which can
-- differ from rounding the whole sale by a cent on a multi-item sale.
--
-- p_service_paid_cents: at check-out, the service amount. When given, the
-- appointment is checked out in the same transaction as the sale.
create or replace function public.record_retail_sale(
  p_lines               jsonb,
  p_payment_method      text,
  p_client_id           uuid default null,
  p_appointment_id      uuid default null,
  p_service_paid_cents  integer default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'America/New_York')::date;
  v_rate    numeric;
  v_sale    uuid;
  v_line    jsonb;
  v_pid     uuid;
  v_qty     numeric;
  v_price   integer;
  v_tax     integer;
  v_cost    integer;
  v_mov     uuid;
  v_sub     integer := 0;
  v_taxsum  integer := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'A sale needs at least one item.';
  end if;

  select rate into v_rate
    from tax_rates
   where jurisdiction = 'ohio_sales_tax' and effective_from <= v_today
   order by effective_from desc
   limit 1;
  if v_rate is null then
    raise exception 'No sales tax rate is set up.';
  end if;

  insert into retail_sales (appointment_id, client_id, payment_method, tax_rate, sold_on)
  values (p_appointment_id, p_client_id, p_payment_method, v_rate, v_today)
  returning id into v_sale;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_pid   := nullif(v_line->>'product_id', '')::uuid;
    v_qty   := coalesce((v_line->>'quantity')::numeric, 1);
    v_price := (v_line->>'unit_price_cents')::integer;
    v_tax   := round(v_price * v_rate)::integer;
    v_mov   := null;
    v_cost  := null;

    if v_pid is not null then
      select unit_cost_cents into v_cost from products where id = v_pid;
      insert into inventory_movements
        (product_id, kind, quantity, unit_cost_cents, unit_price_cents,
         unit_tax_cents, occurred_on, appointment_id)
      values
        (v_pid, 'sold', -v_qty, v_cost, v_price, v_tax, v_today, p_appointment_id)
      returning id into v_mov;
    end if;

    insert into retail_sale_lines
      (sale_id, product_id, description, quantity, unit_price_cents,
       unit_tax_cents, unit_cost_cents, movement_id)
    values
      (v_sale, v_pid, v_line->>'description', v_qty, v_price, v_tax, v_cost, v_mov);

    v_sub    := v_sub + round(v_price * v_qty)::integer;
    v_taxsum := v_taxsum + round(v_tax * v_qty)::integer;
  end loop;

  update retail_sales
     set subtotal_cents = v_sub, tax_cents = v_taxsum, total_cents = v_sub + v_taxsum
   where id = v_sale;

  if p_appointment_id is not null and p_service_paid_cents is not null then
    update appointments
       set status = 'checked_out',
           paid_cents = p_service_paid_cents,
           payment_method = p_payment_method,
           checked_out_at = now()
     where id = p_appointment_id;
  end if;

  return v_sale;
end;
$$;

revoke all on function public.record_retail_sale(jsonb, text, uuid, uuid, integer) from public, anon;
grant execute on function public.record_retail_sale(jsonb, text, uuid, uuid, integer) to authenticated;

commit;
