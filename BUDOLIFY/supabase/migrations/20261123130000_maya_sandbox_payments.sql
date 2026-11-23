-- Maya hosted checkout records. Provider API keys and webhook secrets stay
-- in Supabase Edge Function secrets, never in the client.
create table if not exists public.payment_checkouts (
  checkout_group_id uuid primary key,
  request_key text not null unique,
  buyer_id uuid not null references auth.users (id) on delete restrict,
  provider text not null default 'maya' check (provider = 'maya'),
  provider_session_id text unique,
  provider_payment_id text,
  provider_refund_id text,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'PHP' check (currency = 'PHP'),
  status text not null default 'creating'
    check (status in ('creating', 'pending', 'paid', 'failed', 'refunded')),
  refund_status text check (refund_status is null or refund_status in ('pending', 'processing', 'succeeded', 'failed')),
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_webhook_events (
  provider_event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

create or replace function public.guard_online_refund_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.payment_method = 'online'
    and (new.status = 'refunded' or new.payment_status = 'refunded')
    and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ONLINE_REFUND_REQUIRES_MAYA';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_online_refunds on public.orders;
create trigger orders_guard_online_refunds before update on public.orders
for each row execute function public.guard_online_refund_status();

alter table public.payment_checkouts enable row level security;
alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_checkouts, public.payment_webhook_events from public, anon, authenticated;
grant all on public.payment_checkouts, public.payment_webhook_events to service_role;

-- Recreate the existing order RPC so online orders are reserved in the same
-- transaction as COD orders, but remain pending until Maya confirms them.
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
  v_initial_status text;
begin
  if v_buyer_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_payment_method is null or p_payment_method not in ('cod', 'online') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD';
  end if;
  if char_length(v_note) > 1000 then
    raise exception using errcode = '22023', message = 'ORDER_NOTE_TOO_LONG';
  end if;

  v_initial_status := case when p_payment_method = 'online' then 'pending_payment' else 'placed' end;

  select * into v_address from public.addresses
  where id = p_address_id and user_id = v_buyer_id for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'ADDRESS_NOT_FOUND';
  end if;

  select count(*) into v_item_count from public.cart_items where user_id = v_buyer_id;
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
  where cart_row.user_id = v_buyer_id and product.is_published and not product.is_archived
    and shop.is_published and coalesce(shop.is_archived, false) = false;
  if v_valid_count <> v_item_count then
    raise exception using errcode = 'P0001', message = 'PRODUCT_UNAVAILABLE';
  end if;

  for v_cart_item in
    select cart_row.product_id, cart_row.quantity, product.name
    from public.cart_items cart_row
    join public.shop_products product on product.id = cart_row.product_id
    where cart_row.user_id = v_buyer_id order by product.id
  loop
    update public.shop_products product
    set inventory = product.inventory - v_cart_item.quantity, updated_at = now()
    where product.id = v_cart_item.product_id and product.inventory >= v_cart_item.quantity
      and product.is_published and not product.is_archived
      and exists (select 1 from public.shops shop where shop.id = product.shop_id
        and shop.is_published and coalesce(shop.is_archived, false) = false);
    if not found then
      raise exception using errcode = 'P0001', message = 'OUT_OF_STOCK: ' || v_cart_item.name;
    end if;
  end loop;

  for v_shop in
    select shop.id as shop_id,
      sum(product.price * cart_row.quantity)::numeric(12, 2) as subtotal
    from public.cart_items cart_row
    join public.shop_products product on product.id = cart_row.product_id
    join public.shops shop on shop.id = product.shop_id
    where cart_row.user_id = v_buyer_id group by shop.id order by shop.id
  loop
    v_shipping_fee := case when v_shop.subtotal >= v_free_shipping_threshold then 0
      else v_flat_shipping_fee end;
    insert into public.orders (
      checkout_group_id, buyer_id, shop_id, status, payment_method, payment_status,
      subtotal, shipping_fee, total, shipping_address, buyer_note
    ) values (
      v_checkout_group_id, v_buyer_id, v_shop.shop_id, v_initial_status, p_payment_method,
      'pending', v_shop.subtotal, v_shipping_fee, v_shop.subtotal + v_shipping_fee,
      jsonb_build_object(
        'full_name', v_address.full_name, 'phone', v_address.phone,
        'line1', v_address.line1, 'line2', v_address.line2,
        'city', v_address.city, 'province', v_address.province,
        'postal_code', v_address.postal_code
      ), btrim(v_note)
    ) returning id into v_order_id;

    insert into public.order_items (
      order_id, product_id, product_name, unit_price, quantity, image_path, line_total
    )
    select v_order_id, product.id, product.name, product.price, cart_row.quantity,
      product.image_path, product.price * cart_row.quantity
    from public.cart_items cart_row
    join public.shop_products product on product.id = cart_row.product_id
    where cart_row.user_id = v_buyer_id and product.shop_id = v_shop.shop_id;

    insert into public.order_events (order_id, from_status, to_status, actor_id, note)
    values (v_order_id, null, v_initial_status, v_buyer_id,
      case when p_payment_method = 'online' then 'Awaiting online payment' else 'Order placed' end);
  end loop;

  delete from public.cart_items where user_id = v_buyer_id;
  return query select order_row.id, order_row.checkout_group_id, order_row.shop_id
  from public.orders order_row
  where order_row.checkout_group_id = v_checkout_group_id and order_row.buyer_id = v_buyer_id
  order by order_row.shop_id;
end;
$$;

revoke all on function public.place_order(uuid, text, text) from public, anon;
grant execute on function public.place_order(uuid, text, text) to authenticated;

create or replace function public.confirm_maya_payment(
  p_event_id text, p_event_type text, p_session_id text,
  p_payment_id text, p_amount_minor bigint
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_checkout public.payment_checkouts%rowtype; v_order record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if exists (select 1 from public.payment_webhook_events where provider_event_id = p_event_id) then
    return true;
  end if;
  select * into v_checkout from public.payment_checkouts
  where provider_session_id = p_session_id for update;
  if not found or v_checkout.amount_minor <> p_amount_minor then return false; end if;
  insert into public.payment_webhook_events(provider_event_id, event_type)
  values (p_event_id, p_event_type) on conflict do nothing;
  if not found then return true; end if;
  if v_checkout.status = 'paid' then return true; end if;
  update public.payment_checkouts set status = 'paid', provider_payment_id = p_payment_id,
    updated_at = now() where checkout_group_id = v_checkout.checkout_group_id;
  for v_order in select id, status from public.orders
    where checkout_group_id = v_checkout.checkout_group_id for update
  loop
    if v_order.status = 'pending_payment' then
      update public.orders set status = 'placed', payment_status = 'paid', updated_at = now()
        where id = v_order.id;
      insert into public.order_events(order_id, from_status, to_status, actor_id, note)
      values (v_order.id, 'pending_payment', 'placed', null, 'Maya payment confirmed');
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.record_maya_refund(
  p_event_id text, p_event_type text, p_payment_id text,
  p_refund_id text, p_refund_status text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_checkout public.payment_checkouts%rowtype; v_order record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if exists (select 1 from public.payment_webhook_events where provider_event_id = p_event_id) then
    return true;
  end if;
  select * into v_checkout from public.payment_checkouts
  where provider_payment_id = p_payment_id for update;
  if not found then return false; end if;
  insert into public.payment_webhook_events(provider_event_id, event_type)
  values (p_event_id, p_event_type) on conflict do nothing;
  if not found then return true; end if;
  update public.payment_checkouts set provider_refund_id = p_refund_id,
    refund_status = p_refund_status,
    status = case when p_refund_status = 'succeeded' then 'refunded' else status end,
    updated_at = now() where checkout_group_id = v_checkout.checkout_group_id;
  if p_refund_status = 'succeeded' then
    for v_order in select id, status from public.orders
      where checkout_group_id = v_checkout.checkout_group_id for update
    loop
      if v_order.status <> 'refunded' then
        update public.orders set status = 'refunded', payment_status = 'refunded', updated_at = now()
          where id = v_order.id;
        insert into public.order_events(order_id, from_status, to_status, actor_id, note)
        values (v_order.id, v_order.status, 'refunded', null, 'Maya refund completed');
      end if;
    end loop;
  end if;
  return true;
end;
$$;

revoke all on function public.confirm_maya_payment(text, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.record_maya_refund(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.confirm_maya_payment(text, text, text, text, bigint) to service_role;
grant execute on function public.record_maya_refund(text, text, text, text, text) to service_role;

create or replace function public.fail_maya_checkout(p_checkout_group_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_order record; v_item record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  perform 1 from public.payment_checkouts
  where checkout_group_id = p_checkout_group_id and status in ('creating', 'pending') for update;
  if found then
    update public.payment_checkouts set status = 'failed', updated_at = now()
      where checkout_group_id = p_checkout_group_id;
  elsif not exists (select 1 from public.orders
    where checkout_group_id = p_checkout_group_id and status = 'pending_payment') then
    if exists (select 1 from public.payment_checkouts
      where checkout_group_id = p_checkout_group_id and status = 'failed') then
      return true;
    end if;
    return false;
  end if;
  for v_order in select id from public.orders
    where checkout_group_id = p_checkout_group_id and status = 'pending_payment' for update
  loop
    for v_item in select product_id, quantity from public.order_items
      where order_id = v_order.id and product_id is not null
    loop
      insert into public.cart_items(user_id, product_id, quantity)
      select order_row.buyer_id, v_item.product_id, v_item.quantity
      from public.orders order_row where order_row.id = v_order.id
      on conflict (user_id, product_id) do update
      set quantity = public.cart_items.quantity + excluded.quantity, updated_at = now();
      update public.shop_products set inventory = inventory + v_item.quantity, updated_at = now()
        where id = v_item.product_id;
    end loop;
    update public.orders set status = 'cancelled', payment_status = 'failed', updated_at = now()
      where id = v_order.id;
    insert into public.order_events(order_id, from_status, to_status, actor_id, note)
    values (v_order.id, 'pending_payment', 'cancelled', null, 'Payment checkout could not be created');
  end loop;
  return true;
end;
$$;

revoke all on function public.fail_maya_checkout(uuid) from public, anon, authenticated;
grant execute on function public.fail_maya_checkout(uuid) to service_role;
