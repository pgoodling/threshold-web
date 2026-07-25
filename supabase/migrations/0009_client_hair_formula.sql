-- Threshold Salon — store each client's color formula (level + tone, e.g. "9G",
-- "5N"). Drives the "regrowth" strand color on the client list + card; falls
-- back to a service-type default when blank. Additive, safe to re-run.

begin;

alter table public.clients
  add column if not exists hair_formula text;

commit;
