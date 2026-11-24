drop function if exists public.place_order(uuid, text, text);

create function public.place_order(
  p_address_id uuid,
  p_payment_method text,
  p_note text default '',
  p_selected_product_ids uuid[] default null
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
  v_distinct_count integer;
  v_selected_product_ids uuid[];
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

  select * into v_address
  from public.addresses
  where id = p_address_id and user_id = v_buyer_id
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'ADDRESS_NOT_FOUND';
  end if;

  if p_selected_product_ids is null then
    select array_agg(product_id order by product_id)
    into v_selected_product_ids
    from public.cart_items
    where user_id = v_buyer_id;
  else
    if cardinality(p_selected_product_ids) = 0 then
      raise exception using errcode = 'P0001', message = 'CART_EMPTY';
    end if;
    select count(distinct selected.product_id)
    into v_distinct_count
    from unnest(p_selected_product_ids) as selected(product_id);
    if v_distinct_count <> cardinality(p_selected_product_ids) then
      raise exception using errcode = '22023', message = 'INVALID_SELECTED_PRODUCTS';
    end if;
    v_selected_product_ids := p_selected_product_ids;
  end if;

  select count(*) into v_item_count
  from public.cart_items
  where user_id = v_buyer_id
    and product_id = any(v_selected_product_ids);
  if v_item_count = 0 then
    raise exception using errcode = 'P0001', message = 'CART_EMPTY';
  end if;
  if v_item_count <> cardinality(v_selected_product_ids) then
    raise exception using errcode = 'P0001', message = 'CART_ITEMS_CHANGED';
  end if;

  perform 1
  from public.cart_items cart_row
  join public.shop_products product on product.id = cart_row.product_id
  join public.shops shop on shop.id = product.shop_id
  where cart_row.user_id = v_buyer_id
    and cart_row.product_id = any(v_selected_product_ids)
  order by product.id
  for update of cart_row, product, shop;

  select count(*) into v_valid_count
  from public.cart_items cart_row
  join public.shop_products product on product.id = cart_row.product_id
  join public.shops shop on shop.id = product.shop_id
  where cart_row.user_id = v_buyer_id
    and cart_row.product_id = any(v_selected_product_ids)
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
      and cart_row.product_id = any(v_selected_product_ids)
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
      raise exception using errcode = 'P0001', message = 'OUT_OF_STOCK: ' || v_cart_item.name;
    end if;
  end loop;

  for v_shop in
    select shop.id as shop_id,
      sum(product.price * cart_row.quantity)::numeric(12, 2) as subtotal
    from public.cart_items cart_row
    join public.shop_products product on product.id = cart_row.product_id
    join public.shops shop on shop.id = product.shop_id
    where cart_row.user_id = v_buyer_id
      and cart_row.product_id = any(v_selected_product_ids)
    group by shop.id
    order by shop.id
  loop
    v_shipping_fee := case
      when v_shop.subtotal >= v_free_shipping_threshold then 0
      else v_flat_shipping_fee
    end;
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
    where cart_row.user_id = v_buyer_id
      and cart_row.product_id = any(v_selected_product_ids)
      and product.shop_id = v_shop.shop_id;

    insert into public.order_events (order_id, from_status, to_status, actor_id, note)
    values (
      v_order_id,
      null,
      v_initial_status,
      v_buyer_id,
      case when p_payment_method = 'online' then 'Awaiting online payment' else 'Order placed' end
    );
  end loop;

  delete from public.cart_items
  where user_id = v_buyer_id
    and product_id = any(v_selected_product_ids);

  return query
  select order_row.id, order_row.checkout_group_id, order_row.shop_id
  from public.orders order_row
  where order_row.checkout_group_id = v_checkout_group_id
    and order_row.buyer_id = v_buyer_id
  order by order_row.shop_id;
end;
$$;

revoke all on function public.place_order(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.place_order(uuid, text, text, uuid[]) to authenticated;

notify pgrst, 'reload schema';
