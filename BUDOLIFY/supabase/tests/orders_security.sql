-- Manual Supabase SQL Editor checks.
-- Replace each placeholder UUID. Use orders owned by different buyers and shops;
-- the buyer test row must not belong to the seller being tested.
--
-- Oversell race check (two SQL Editor sessions):
-- 1. Set one published product's inventory to 1 and place quantity 1 of it in
--    each of two buyer carts (use an authorized fixture/setup account).
-- 2. In both sessions, authenticate as the corresponding buyer and call
--    select * from public.place_order('<address UUID>', 'cod', '');
-- 3. Run both calls at the same time. Exactly one succeeds; the other raises
--    OUT_OF_STOCK. The failed function call must leave its cart and stock intact.

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '<BUYER_A_UUID>', true);

select
  count(*) = 0 as buyer_cannot_read_other_buyers_order
from public.orders
where id = '<ORDER_OWNED_BY_BUYER_B_UUID>'::uuid;

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '<SELLER_A_UUID>', true);

select
  count(*) = 0 as seller_cannot_read_another_shops_order
from public.orders
where id = '<ORDER_FOR_SELLER_B_SHOP_UUID>'::uuid;

reset role;

select
  not has_table_privilege('authenticated', 'public.orders', 'INSERT')
    as client_cannot_insert_orders,
  not has_column_privilege('authenticated', 'public.orders', 'total', 'UPDATE')
    as client_cannot_update_order_total,
  not has_column_privilege('authenticated', 'public.orders', 'status', 'UPDATE')
    as client_cannot_update_order_status,
  not has_table_privilege('authenticated', 'public.order_items', 'INSERT')
    as client_cannot_insert_order_items,
  not has_table_privilege('authenticated', 'public.order_events', 'INSERT')
    as client_cannot_insert_order_events;

select exists (
  select 1
  from pg_constraint
  where conrelid = 'public.cart_items'::regclass
    and confrelid = 'public.shop_products'::regclass
    and contype = 'f'
    and conkey = array[(
      select attnum
      from pg_attribute
      where attrelid = 'public.cart_items'::regclass
        and attname = 'product_id'
        and not attisdropped
    )]::smallint[]
) as cart_product_foreign_key_targets_shop_products;

rollback;
