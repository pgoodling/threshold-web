-- Threshold Salon -- one category for every transfer back to Evelyn.
--
-- Relay paying her back covers two things: receipts she paid on her own card
-- (Paid outside Relay), and the money she moved into Relay from her own bank
-- to start the business (Owner contribution, $3,300 in Aug 2026). Both are her
-- money coming back -- nothing deducted, nothing taxed -- so one category,
-- renamed from 0050's "Reimbursement to Evelyn" now it covers both
-- (agreed with Paul 2026-10-08). Same row, same id; only the name changes.

begin;

update public.expense_categories
   set name = 'Paid back to Evelyn'
 where name = 'Reimbursement to Evelyn'
   and not exists (select 1 from public.expense_categories where name = 'Paid back to Evelyn');

commit;
