-- Threshold Salon -- cash counted from check-out, and paying Evelyn back.
--
-- Two categories, both kind='owner' so no screen counts them as income or
-- spending and neither reaches the Schedule C (agreed with Paul 2026-10-08):
--
--   Reimbursement to Evelyn         Relay paying her back for business costs
--                                   she paid personally before Relay existed.
--                                   The costs themselves are already recorded
--                                   ("Paid outside Relay") as expenses when she
--                                   paid them; the repayment isn't a second
--                                   expense, and it isn't a draw.
--
--   Cash deposit (already counted)  Cash taken at check-out now counts as
--                                   income straight from the check-out. If she
--                                   later deposits that cash into Relay, the
--                                   deposit is filed here so it isn't counted
--                                   twice.

begin;

insert into public.expense_categories (name, schedule_c_line, kind, sort_order) values
  ('Reimbursement to Evelyn',        null, 'owner', 905),
  ('Cash deposit (already counted)', null, 'owner', 915)
on conflict (name) do nothing;

commit;
