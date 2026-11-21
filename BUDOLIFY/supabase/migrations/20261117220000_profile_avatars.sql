alter table public.profiles
  add column if not exists avatar_path text;

alter table public.profiles
  drop constraint if exists profiles_avatar_path_owner_check;
alter table public.profiles
  add constraint profiles_avatar_path_owner_check
  check (avatar_path is null or avatar_path = id::text || '/avatar');

revoke update (avatar_url) on table public.profiles from authenticated;
grant update (avatar_path) on table public.profiles to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar owners and super admins can view images"
  on storage.objects;
create policy "Avatar owners and super admins can view images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (
        name = (select auth.uid())::text || '/avatar'
        and exists (
          select 1
          from public.profiles
          where id = (select auth.uid())
            and not is_suspended
        )
      )
      or (select public.is_super_admin())
    )
  );

drop policy if exists "Users can upload their own avatar"
  on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar'
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and not is_suspended
    )
  );

drop policy if exists "Users can update their own avatar"
  on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar'
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and not is_suspended
    )
  )
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar'
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and not is_suspended
    )
  );

drop policy if exists "Users can delete their own avatar"
  on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar'
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and not is_suspended
    )
  );
