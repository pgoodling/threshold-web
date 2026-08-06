-- Threshold Salon — record no-show fees charged against a card on file.
--
-- The booking flow has saved cards since Phase 2, but nothing could ever charge
-- one — there was no PaymentIntent anywhere in the app, so "no-show protection"
-- meant Evelyn hand-charging the client in the Stripe dashboard. These columns
-- let /api/stripe/charge-no-show record what it did, which also makes the
-- charge idempotent: a row with no_show_charge_id set is never charged twice.
--
-- Amounts stay in integer cents, matching price_cents / paid_cents.

begin;

alter table public.appointments
  add column if not exists no_show_fee_cents  integer,
  add column if not exists no_show_charge_id  text,        -- Stripe PaymentIntent id
  add column if not exists no_show_charged_at timestamptz;

-- One charge per appointment. Belt and braces alongside the route's own check —
-- a double-tap on a phone must never bill a client twice.
create unique index if not exists appointments_no_show_charge_idx
  on public.appointments (no_show_charge_id)
  where no_show_charge_id is not null;

commit;
