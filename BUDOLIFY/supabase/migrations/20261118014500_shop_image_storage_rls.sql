drop policy if exists "Shop owners can view their images" on storage.objects;
create policy "Shop owners can view their images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'shop-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Shop owners can upload their images" on storage.objects;
create policy "Shop owners can upload their images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'shop-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Shop owners can update their images" on storage.objects;
create policy "Shop owners can update their images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'shop-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'shop-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Shop owners can delete their images" on storage.objects;
create policy "Shop owners can delete their images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'shop-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
