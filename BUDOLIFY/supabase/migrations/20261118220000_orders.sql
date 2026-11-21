-- Marketplace ordering. Shipping is charged per shop: ₱99 below ₱1,500,
-- otherwise free. Online payment is reserved in the schema but disabled
-- until a trusted payment provider is integrated.
--
-- RLS rules:
-- - Buyers can read/manage only their own addresses and cart.
-- - Buyers can read their own orders; shop owners can read their shop orders.
-- - Order items/events follow the buyer or seller visibility of their order.
-- - Clients cannot insert orders/items/events or update totals/status. Use RPCs.
-- Manual security checks: see supabase/tests/orders_security.sql.

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 7 and 32),
  line1 text not null check (char_length(btrim(line1)) between 3 and 200),
  line2 text not null default '',
  city text not null check (char_length(btrim(city)) between 2 and 100),
  province text not null check (char_length(btrim(province)) between 2 and 100),
  postal_code text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.shop_products (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

do $$
declare
  v_product_attnum smallint;
begin
  select attnum into v_product_attnum
  from pg_attribute
  where attrelid = 'public.cart_items'::regclass
    and attname = 'product_id'
    and not attisdropped;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cart_items'::regclass
      and confrelid = 'public.shop_products'::regclass
      and contype = 'f'
      and conkey = array[v_product_attnum]::smallint[]
  ) then
    alter table public.cart_items
      drop constraint if exists cart_items_product_id_fkey;

    alter table public.cart_items
      add constraint cart_items_product_id_fkey
      foreign key (product_id)
      references public.shop_products (id)
      on delete cascade
      not valid;
  end if;
end;
$$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  checkout_group_id uuid not null,
  buyer_id uuid not null references auth.users (id) on delete restrict,
  shop_id uuid not null references public.shops (id) on delete restrict,
  status text not null default 'placed'
    check (status in (
      'pending_payment', 'placed', 'confirmed', 'packed', 'shipped',
      'delivered', 'completed', 'cancelled', 'refunded'
    )),
  payment_method text not null check (payment_method in ('cod', 'online')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  shipping_fee numeric(12, 2) not null check (shipping_fee >= 0),
  total numeric(12, 2) not null check (total = subtotal + shipping_fee),
  shipping_address jsonb not null,
  buyer_note text not null default '',
  courier text,
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.shop_products (id) on delete set null,
  product_name text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  image_path text,
  line_total numeric(12, 2) not null check (line_total = unit_price * quantity),
  created_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status text check (from_status is null or from_status in (
    'pending_payment', 'placed', 'confirmed', 'packed', 'shipped',
    'delivered', 'completed', 'cancelled', 'refunded'
  )),
  to_status text not null check (to_status in (
    'pending_payment', 'placed', 'confirmed', 'packed', 'shipped',
    'delivered', 'completed', 'cancelled', 'refunded'
  )),
  actor_id uuid references auth.users (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists addresses_one_default_per_user_idx
  on public.addresses (user_id)
  where is_default;
create index if not exists addresses_user_created_idx
  on public.addresses (user_id, created_at desc);
create index if not exists cart_items_user_idx
  on public.cart_items (user_id);
create index if not exists orders_buyer_created_idx
  on public.orders (buyer_id, created_at desc);
create index if not exists orders_shop_created_idx
  on public.orders (shop_id, created_at desc);
create index if not exists orders_checkout_group_idx
  on public.orders (checkout_group_id);
create index if not exists order_items_order_idx
  on public.order_items (order_id);
create index if not exists order_events_order_created_idx
  on public.order_events (order_id, created_at);

alter table public.addresses enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

revoke all on table public.addresses, public.cart_items, public.orders,
  public.order_items, public.order_events from public, anon, authenticated;
grant select, insert, update, delete on table public.addresses to authenticated;
grant select, insert, delete on table public.cart_items to authenticated;
grant update on table public.cart_items to authenticated;
grant select on table public.orders, public.order_items, public.order_events
  to authenticated;

drop policy if exists "Buyers manage own addresses" on public.addresses;
create policy "Buyers manage own addresses"
  on public.addresses
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Buyers manage own cart" on public.cart_items;
create policy "Buyers manage own cart"
  on public.cart_items
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Buyers and shop owners read orders" on public.orders;
create policy "Buyers and shop owners read orders"
  on public.orders
  for select
  to authenticated
  using (
    buyer_id = (select auth.uid())
    or exists (
      select 1
      from public.shops shop
      where shop.id = orders.shop_id
        and shop.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Buyers and shop owners read order items" on public.order_items;
create policy "Buyers and shop owners read order items"
  on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders order_row
      where order_row.id = order_items.order_id
        and (
          order_row.buyer_id = (select auth.uid())
          or exists (
            select 1
            from public.shops shop
            where shop.id = order_row.shop_id
              and shop.owner_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Buyers and shop owners read order events" on public.order_events;
create policy "Buyers and shop owners read order events"
  on public.order_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders order_row
      where order_row.id = order_events.order_id
        and (
          order_row.buyer_id = (select auth.uid())
          or exists (
            select 1
            from public.shops shop
            where shop.id = order_row.shop_id
              and shop.owner_id = (select auth.uid())
          )
        )
    )
  );

create or replace function public.set_default_address()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default then
    update public.addresses
    set is_default = false
    where user_id = new.user_id
      and id is distinct from new.id
      and is_default;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists addresses_set_default on public.addresses;
create trigger addresses_set_default
  before insert or update on public.addresses
  for each row execute function public.set_default_address();

create or replace function public.place_order(
  p_address_id uuid,
  p_payment_method text,
  p_note text default ''
)
returns table (order_id uuid, checkout_group_id uuid, shop_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer_id uuid := (select auth.uid());
  v_checkout_group_id uuid := gen_random_uuid();
  v_address public.addresses%rowtype;
  v_shop record;
  v_cart_item record;
  v_order_id uuid;
  v_item_count integer;
  v_valid_count integer;
  v_shipping_fee numeric(12, 2);
  v_note text := coalesce(p_note, '');
  v_free_shipping_threshold constant numeric(12, 2) := 1500;
  v_flat_shipping_fee constant numeric(12, 2) := 99;
begin
  if v_buyer_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_payment_method is null or p_payment_method not in ('cod', 'online') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD';
  end if;
  if p_payment_method = 'online' then
    raise exception using errcode = 'P0001', message = 'ONLINE_PAYMENT_UNAVAILABLE';
  end if;
  if char_length(v_note) > 1000 then
    raise exception using errcode = '22023', message = 'ORDER_NOTE_TOO_LONG';
  end if;

  select * into v_address
  from public.addresses
  where id = p_address_id
    and user_id = v_buyer_id
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'ADDRESS_NOT_FOUND';
  end if;

  select count(*) into v_item_count
  from public.cart_items
  where user_id = v_buyer_id;
  if v_item_count = 0 then
    raise exception using errcode = 'P0001', message = 'CART_EMPTY';
  end if;

  perform 1
  from public.cart_items cart_row
  join public.shop_products product on product.id = cart_row.product_id
  join public.shops shop on shop.id = product.shop_id
  where cart_row.user_id = v_buyer_id
  order by product.id
  for update of cart_row, product, shop;

  select count(*) into v_valid_count
  from public.cart_items cart_row
  join public.shop_products product on product.id = cart_row.product_id
  join public.shops shop on shop.id = product.shop_id
  where cart_row.user_id = v_buyer_id
    and product.is_published
    and not product.is_archived
    and shop.is_published
    and coalesce(shop.is_archived, false) = false;
  if v_valid_count <> v_item_count then
    raise exception using errcode = 'P0001', message = 'PRODUCT_UNAVAILABLE';
  end if;

  for v_cart_item in
    select cart_row.product_id, cart_row.quantity, product.name
    from public.cart_items cart_row
    join public.shop_products product on product.id = cart_row.product_id
    where cart_row.user_id = v_buyer_id
    order by product.id
  loop
    update public.shop_products product
    set inventory = product.inventory - v_cart_item.quantity,
        updated_at = now()
    where product.id = v_cart_item.product_id
      and product.inventory >= v_cart_item.quantity
      and product.is_published
      and not product.is_archived
      and exists (
        select 1
        from public.shops shop
        where shop.id = product.shop_id
          and shop.is_published
          and coalesce(shop.is_archived, false) = false
      );
    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'OUT_OF_STOCK: ' || v_cart_item.name;
    end if;
  end loop;

  for v_shop in
    select
      shop.id as shop_id,
      sum(product.price * cart_row.quantity)::numeric(12, 2) as subtotal
    from public.cart_items cart_row
    join public.shop_products product on product.id = cart_row.product_id
    join public.shops shop on shop.id = product.shop_id
    where cart_row.user_id = v_buyer_id
    group by shop.id
    order by shop.id
  loop
    v_shipping_fee := case
      when v_shop.subtotal >= v_free_shipping_threshold then 0
      else v_flat_shipping_fee
    end;

    insert into public.orders (
      checkout_group_id,
      buyer_id,
      shop_id,
      status,
      payment_method,
      payment_status,
      subtotal,
      shipping_fee,
      total,
      shipping_address,
      buyer_note
    )
    values (
      v_checkout_group_id,
      v_buyer_id,
      v_shop.shop_id,
      'placed',
      'cod',
      'pending',
      v_shop.subtotal,
      v_shipping_fee,
      v_shop.subtotal + v_shipping_fee,
      jsonb_build_object(
        'full_name', v_address.full_name,
        'phone', v_address.phone,
        'line1', v_address.line1,
        'line2', v_address.line2,
        'city', v_address.city,
        'province', v_address.province,
        'postal_code', v_address.postal_code
      ),
      btrim(v_note)
    )
    returning id into v_order_id;

    insert into public.order_items (
      order_id, product_id, product_name, unit_price, quantity, image_path, line_total
    )
    select
      v_order_id,
      product.id,
      product.name,
      product.price,
      cart_row.quantity,
      product.image_path,
      product.price * cart_row.quantity
    from public.cart_items cart_row
    join public.shop_products product on product.id = cart_row.product_id
    where cart_row.user_id = v_buyer_id
      and product.shop_id = v_shop.shop_id;

    insert into public.order_events (order_id, from_status, to_status, actor_id, note)
    values (v_order_id, null, 'placed', v_buyer_id, 'Order placed');
  end loop;

  delete from public.cart_items
  where user_id = v_buyer_id;

  return query
  select order_row.id, order_row.checkout_group_id, order_row.shop_id
  from public.orders order_row
  where order_row.checkout_group_id = v_checkout_group_id
    and order_row.buyer_id = v_buyer_id
  order by order_row.shop_id;
end;
$$;

create or replace function public.update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_courier text default null,
  p_tracking_number text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_order public.orders%rowtype;
  v_old_status text;
  v_is_shop_owner boolean;
  v_is_admin boolean;
  v_item record;
  v_transition_allowed boolean := false;
  v_note text := '';
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_new_status not in (
    'placed', 'confirmed', 'packed', 'shipped', 'delivered',
    'completed', 'cancelled', 'refunded'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_STATUS';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;
  v_old_status := v_order.status;

  select exists (
    select 1 from public.shops
    where id = v_order.shop_id and owner_id = v_actor_id
  ) into v_is_shop_owner;
  select exists (
    select 1 from public.profiles
    where id = v_actor_id
      and role in ('admin', 'super_admin')
      and not is_suspended
  ) into v_is_admin;

  if v_order.status = 'placed' and p_new_status = 'confirmed' and v_is_shop_owner then
    v_transition_allowed := true;
  elsif v_order.status = 'confirmed' and p_new_status = 'packed' and v_is_shop_owner then
    v_transition_allowed := true;
  elsif v_order.status = 'packed' and p_new_status = 'shipped' and v_is_shop_owner then
    v_transition_allowed := true;
    if nullif(btrim(coalesce(p_courier, '')), '') is null
      or nullif(btrim(coalesce(p_tracking_number, '')), '') is null then
      raise exception using errcode = '22023', message = 'SHIPPING_DETAILS_REQUIRED';
    end if;
    if char_length(btrim(p_courier)) > 100
      or char_length(btrim(p_tracking_number)) > 160 then
      raise exception using errcode = '22023', message = 'SHIPPING_DETAILS_TOO_LONG';
    end if;
  elsif v_order.status = 'shipped' and p_new_status = 'delivered'
    and v_order.buyer_id = v_actor_id then
    v_transition_allowed := true;
  elsif v_order.status = 'delivered' and p_new_status = 'completed'
    and v_order.buyer_id = v_actor_id then
    v_transition_allowed := true;
  elsif v_order.status in ('placed', 'confirmed', 'packed')
    and p_new_status = 'cancelled'
    and v_order.buyer_id = v_actor_id then
    v_transition_allowed := true;
  elsif v_order.status = 'completed' and p_new_status = 'refunded' and v_is_admin then
    v_transition_allowed := true;
  end if;

  if not v_transition_allowed then
    raise exception using errcode = '42501', message = 'ORDER_TRANSITION_NOT_ALLOWED';
  end if;

  if p_new_status = 'cancelled' then
    for v_item in
      select product_id, quantity
      from public.order_items
      where order_id = v_order.id
        and product_id is not null
      order by product_id
    loop
      update public.shop_products
      set inventory = inventory + v_item.quantity,
          updated_at = now()
      where id = v_item.product_id;
    end loop;
    update public.orders
    set payment_status = 'cancelled'
    where id = v_order.id;
    v_note := 'Buyer cancelled order; inventory restored';
  elsif p_new_status = 'shipped' then
    v_note := 'Shipment details added';
  elsif p_new_status = 'delivered' and v_order.payment_method = 'cod' then
    update public.orders
    set payment_status = 'paid'
    where id = v_order.id;
    v_note := 'Buyer confirmed delivery';
  elsif p_new_status = 'refunded' then
    update public.orders
    set payment_status = 'refunded'
    where id = v_order.id;
    v_note := 'Refund recorded by admin';
  end if;

  update public.orders
  set status = p_new_status,
      courier = case when p_new_status = 'shipped' then btrim(p_courier) else courier end,
      tracking_number = case
        when p_new_status = 'shipped' then btrim(p_tracking_number)
        else tracking_number
      end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_id, note)
  values (
    v_order.id,
    v_old_status,
    p_new_status,
    v_actor_id,
    coalesce(nullif(v_note, ''), 'Order status updated')
  );

  return v_order;
end;
$$;

revoke all on function public.set_default_address() from public, anon, authenticated;
revoke all on function public.place_order(uuid, text, text) from public, anon;
revoke all on function public.update_order_status(uuid, text, text, text) from public, anon;
grant execute on function public.place_order(uuid, text, text) to authenticated;
grant execute on function public.update_order_status(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
