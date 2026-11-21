create table if not exists public.shops (
id uuid primary key default gen_random_uuid(),
owner_id uuid not null unique references auth.users (id) on delete cascade,
name text not null check (char_length(btrim(name)) between 2 and 80),
slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
description text not null default '',
contact_email text not null default '',
phone text not null default '',
logo_path text,
is_published boolean not null default true,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);

create unique index if not exists shops_slug_lower_idx
on public.shops (lower(slug));

create table if not exists public.shop_products (
id uuid primary key default gen_random_uuid(),
shop_id uuid not null references public.shops (id) on delete cascade,
name text not null check (char_length(btrim(name)) between 1 and 120),
description text not null default '',
category text not null default 'Everyday',
price numeric(12, 2) not null check (price > 0),
inventory integer not null default 0 check (inventory >= 0),
image_path text,
is_published boolean not null default true,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);

create index if not exists shop_products_shop_created_idx
on public.shop_products (shop_id, created_at desc);

alter table public.shops enable row level security;
alter table public.shop_products enable row level security;

revoke all on table public.shops, public.shop_products from anon, authenticated;
grant select on table public.shops, public.shop_products to anon, authenticated;
grant insert, update, delete on table public.shops, public.shop_products to authenticated;

drop policy if exists "Public shops and owners can view shops" on public.shops;
create policy "Public shops and owners can view shops"
on public.shops
for select
to anon, authenticated
using (is_published or owner_id = (select auth.uid()));

drop policy if exists "Users can create their own shop" on public.shops;
create policy "Users can create their own shop"
on public.shops
for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "Users can update their own shop" on public.shops;
create policy "Users can update their own shop"
on public.shops
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "Users can delete their own shop" on public.shops;
create policy "Users can delete their own shop"
on public.shops
for delete
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "Public products and shop owners can view products"
on public.shop_products;
create policy "Public products and shop owners can view products"
on public.shop_products
for select
to anon, authenticated
using (
exists (
select 1
from public.shops shop
where shop.id = shop_products.shop_id
and shop.is_published
and shop_products.is_published
)
or exists (
select 1
from public.shops shop
where shop.id = shop_products.shop_id
and shop.owner_id = (select auth.uid())
)
);

drop policy if exists "Shop owners can create products" on public.shop_products;
create policy "Shop owners can create products"
on public.shop_products
for insert
to authenticated
with check (
exists (
select 1
from public.shops shop
where shop.id = shop_products.shop_id
and shop.owner_id = (select auth.uid())
)
);

drop policy if exists "Shop owners can update products" on public.shop_products;
create policy "Shop owners can update products"
on public.shop_products
for update
to authenticated
using (
exists (
select 1
from public.shops shop
where shop.id = shop_products.shop_id
and shop.owner_id = (select auth.uid())
)
)
with check (
exists (
select 1
from public.shops shop
where shop.id = shop_products.shop_id
and shop.owner_id = (select auth.uid())
)
);

drop policy if exists "Shop owners can delete products" on public.shop_products;
create policy "Shop owners can delete products"
on public.shop_products
for delete
to authenticated
using (
exists (
select 1
from public.shops shop
where shop.id = shop_products.shop_id
and shop.owner_id = (select auth.uid())
)
);

insert into storage.buckets (
id,
name,
public,
file_size_limit,
allowed_mime_types
)
values (
'shop-images',
'shop-images',
true,
5242880,
array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
file_size_limit = excluded.file_size_limit,
allowed_mime_types = excluded.allowed_mime_types;

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

<Questions>
</Questions>
</Question>