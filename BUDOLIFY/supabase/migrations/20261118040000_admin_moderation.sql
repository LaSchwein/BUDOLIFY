alter table public.shops
  add column if not exists is_archived boolean not null default false;

alter table public.shop_products
  add column if not exists is_archived boolean not null default false;

create or replace function public.is_admin()
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
      and role in ('admin', 'super_admin')
      and not is_suspended
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "Users can view their own profile and super admins can view all"
  on public.profiles;
create policy "Users can view their own profile and admins can view all"
  on public.profiles
  for select
  to authenticated
  using (
    (id = (select auth.uid()) and not is_suspended)
    or (select public.is_admin())
  );

drop policy if exists "Users can update their profile and super admins can edit profiles"
  on public.profiles;
create policy "Users can update their profile and admins can edit profiles"
  on public.profiles
  for update
  to authenticated
  using (
    (id = (select auth.uid()) and not is_suspended)
    or (select public.is_admin())
  )
  with check (
    (id = (select auth.uid()) and not is_suspended)
    or (select public.is_admin())
  );

drop policy if exists "Public shops and owners can view shops" on public.shops;
create policy "Public shops owners and admins can view shops"
  on public.shops
  for select
  to anon, authenticated
  using (
    (is_published and not is_archived)
    or owner_id = (select auth.uid())
    or (select public.is_admin())
  );

drop policy if exists "Users can update their own shop" on public.shops;
create policy "Shop owners and admins can update shops"
  on public.shops
  for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (select public.is_admin())
  )
  with check (
    owner_id = (select auth.uid())
    or (select public.is_admin())
  );

drop policy if exists "Users can delete their own shop" on public.shops;
create policy "Shop owners and admins can delete shops"
  on public.shops
  for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (select public.is_admin())
  );

drop policy if exists "Public products and shop owners can view products"
  on public.shop_products;
create policy "Public products shop owners and admins can view products"
  on public.shop_products
  for select
  to anon, authenticated
  using (
    (
      is_published
      and not is_archived
      and exists (
        select 1
        from public.shops shop
        where shop.id = shop_products.shop_id
          and shop.is_published
          and not shop.is_archived
      )
    )
    or exists (
      select 1
      from public.shops shop
      where shop.id = shop_products.shop_id
        and shop.owner_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

drop policy if exists "Shop owners can update products" on public.shop_products;
create policy "Shop owners and admins can update products"
  on public.shop_products
  for update
  to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.shops shop
      where shop.id = shop_products.shop_id
        and shop.owner_id = (select auth.uid())
        and not shop.is_archived
    )
  )
  with check (
    (select public.is_admin())
    or exists (
      select 1
      from public.shops shop
      where shop.id = shop_products.shop_id
        and shop.owner_id = (select auth.uid())
        and not shop.is_archived
    )
  );

drop policy if exists "Shop owners can create products" on public.shop_products;
create policy "Shop owners can create products in active shops"
  on public.shop_products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.shops shop
      where shop.id = shop_products.shop_id
        and shop.owner_id = (select auth.uid())
        and not shop.is_archived
    )
  );

drop policy if exists "Shop owners can delete products" on public.shop_products;
create policy "Shop owners and admins can delete products"
  on public.shop_products
  for delete
  to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.shops shop
      where shop.id = shop_products.shop_id
        and shop.owner_id = (select auth.uid())
    )
  );

create or replace function public.guard_archive_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_archived is distinct from old.is_archived
    and not (select public.is_admin()) then
    raise exception 'Only an admin can archive or restore this record.';
  end if;
  return new;
end;
$$;

drop trigger if exists shops_guard_archive_changes on public.shops;
create trigger shops_guard_archive_changes
  before update of is_archived on public.shops
  for each row execute function public.guard_archive_changes();

drop trigger if exists shop_products_guard_archive_changes on public.shop_products;
create trigger shop_products_guard_archive_changes
  before update of is_archived on public.shop_products
  for each row execute function public.guard_archive_changes();
