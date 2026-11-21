do $$
declare
  legacy_column text;
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'user_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
  ) then
    alter table public.profiles rename column user_id to id;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'id'
  ) then
    raise exception 'The existing profiles table must have a user_id or id column.';
  end if;

  alter table public.profiles
    add column if not exists email text not null default '',
    add column if not exists full_name text not null default '',
    add column if not exists role text not null default 'customer'
      check (role in ('customer', 'admin', 'super_admin')),
    add column if not exists is_suspended boolean not null default false;

  foreach legacy_column in array array['first_name', 'last_name'] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = legacy_column
    ) then
      execute format(
        'alter table public.profiles alter column %I set default %L',
        legacy_column,
        ''
      );
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'first_name'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_name'
  ) then
    execute $migration$
      update public.profiles
      set full_name = trim(concat_ws(
        ' ',
        nullif(trim(first_name), ''),
        nullif(trim(last_name), '')
      ))
      where full_name = ''
    $migration$;
  end if;

  update public.profiles profile
  set email = coalesce(auth_user.email, '')
  from auth.users auth_user
  where auth_user.id = profile.id
    and profile.email = '';
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text not null default '',
  avatar_url text not null default '',
  role text not null default 'customer'
    check (role in ('customer', 'admin', 'super_admin')),
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_index profile_index
    join pg_attribute id_attribute
      on id_attribute.attrelid = profile_index.indrelid
     and id_attribute.attname = 'id'
     and id_attribute.attnum = profile_index.indkey[0]
    where profile_index.indrelid = 'public.profiles'::regclass
      and profile_index.indisunique
      and profile_index.indisvalid
      and profile_index.indpred is null
      and profile_index.indnkeyatts = 1
  ) then
    create unique index if not exists profiles_id_unique_idx
      on public.profiles (id);
  end if;
end;
$$;

create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, full_name, created_at)
    values (
      new.id,
      coalesce(new.email, ''),
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      new.created_at
    )
    on conflict (id) do update
      set email = excluded.email;
  else
    update public.profiles
    set email = coalesce(new.email, '')
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_created on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_profile_created
  after insert or update on auth.users
  for each row execute function public.handle_auth_user_profile();
revoke all on function public.handle_auth_user_profile() from public, anon, authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'super_admin'
      and not is_suspended
  );
$$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, phone, avatar_url)
  on table public.profiles to authenticated;

drop policy if exists "Users can view their own profile and super admins can view all"
  on public.profiles;
create policy "Users can view their own profile and super admins can view all"
  on public.profiles
  for select
  to authenticated
  using (
    (id = (select auth.uid()) and not is_suspended)
    or (select public.is_super_admin())
  );

drop policy if exists "Users can update their profile and super admins can edit profiles"
  on public.profiles;
create policy "Users can update their profile and super admins can edit profiles"
  on public.profiles
  for update
  to authenticated
  using (
    (id = (select auth.uid()) and not is_suspended)
    or (select public.is_super_admin())
  )
  with check (
    (id = (select auth.uid()) and not is_suspended)
    or (select public.is_super_admin())
  );

create or replace function public.set_user_role(
  target_user_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text;
  super_admin_count integer;
begin
  if not (select public.is_super_admin()) then
    raise exception 'Only a super admin can change user roles.';
  end if;

  if new_role is null or new_role not in ('customer', 'admin', 'super_admin') then
    raise exception 'Invalid user role.';
  end if;

  if target_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own role.';
  end if;

  select role into current_role
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'User profile not found.';
  end if;

  if current_role = 'super_admin' and new_role <> 'super_admin' then
    select count(*) into super_admin_count
    from public.profiles
    where role = 'super_admin'
      and not is_suspended;

    if super_admin_count <= 1 then
      raise exception 'The last active super admin cannot be demoted.';
    end if;
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id;
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;
