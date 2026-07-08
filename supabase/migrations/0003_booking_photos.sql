-- Threshold Salon — Phase 1 add-on: photo uploads at booking.
-- Clients can optionally attach up to 3 photos (their hair now / inspiration)
-- when booking. Photos are stored in a PRIVATE Storage bucket, keyed by the
-- appointment id, and are only viewable by Evelyn (authenticated).
--
-- Run this once in the Supabase SQL Editor for the threshold-salon project.

-- Private bucket, images only, 8 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-photos',
  'booking-photos',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone booking (anon) may UPLOAD to this bucket; nobody anon can read/list.
drop policy if exists "booking photos upload" on storage.objects;
create policy "booking photos upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'booking-photos');

-- Only Evelyn (authenticated) can view/list the photos.
drop policy if exists "booking photos read" on storage.objects;
create policy "booking photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'booking-photos');

-- Evelyn can delete photos (cleanup).
drop policy if exists "booking photos delete" on storage.objects;
create policy "booking photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'booking-photos');
