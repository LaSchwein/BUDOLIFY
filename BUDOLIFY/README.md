# BUDOLIFY

A mobile-first storefront for discovering everyday finds, with Supabase email
authentication, editable user profiles, and a super-admin dashboard.

## Run locally

```bash
npm install
npx expo start
```

Press `w` to open the web version, or run `npx expo start --web`.

## Checks

```bash
npx expo lint
npx tsc --noEmit
```

## Supabase setup

The local `.env.local` uses the project URL and publishable key configured for
this app. For another environment, copy `.env.example` to `.env.local` and set
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Publishable
keys are intended for client apps; never put a Supabase secret/service-role key
in an `EXPO_PUBLIC_` variable.

1. In the Supabase SQL Editor, run
   `supabase/migrations/20261117210000_user_management.sql`. This migration
   also upgrades an existing `profiles` table that uses `user_id`, `first_name`,
   and `last_name` to the fields the app expects while preserving those legacy
   columns and profile records.
2. In the SQL Editor, run
   `supabase/migrations/20261117220000_profile_avatars.sql` to create the private
   avatar bucket and per-user storage policies.
3. In the SQL Editor, run
   `supabase/migrations/20261117231500_shops_and_products.sql` to create seller
   shops, product listings, and shop-image storage.
4. If shop image uploads are blocked by a row-level security error, run
   `supabase/migrations/20261118014500_shop_image_storage_rls.sql` to refresh
   the owner-scoped storage policies.
5. Run `supabase/migrations/20261118040000_admin_moderation.sql` to add archive
   fields and admin-only moderation access with RLS policies.
6. Run `supabase/migrations/20261118220000_orders.sql` to create addresses,
   persisted carts, orders, order-item snapshots, order history, and the secure
   order RPCs. The admin moderation migration must run first because the order
   functions also check shop archive and active-admin fields.
7. Run `supabase/migrations/20261121230000_legacy_profile_name_defaults.sql`
   to allow the profile trigger to create accounts when an existing profiles
   table still has required `first_name` or `last_name` columns. This is
   especially important for databases that already ran the user-management
   migration before this compatibility fix.
8. Run `supabase/migrations/20261121233000_remove_legacy_auth_user_trigger.sql`
   to remove the obsolete signup trigger when upgrading a database that had the
   previous `handle_new_user` function. The user-management trigger now creates
   the profile using the current `id` column.
9. Register and confirm your own account through the app.
10. In the SQL Editor, promote that account to the initial super admin, replacing
   the email with the address you registered:

   ```sql
   update public.profiles
   set role = 'super_admin'
   where lower(email) = lower('you@example.com')
   returning id, email, role;
   ```

11. Deploy the trusted account-management function from the repository root:

   ```bash
   supabase login
   supabase link --project-ref fooogugfirnozyulxxdh
   supabase functions deploy manage-user
   ```

The function uses Supabase's server-side secret key environment variable. It
verifies the caller's session and active admin role before banning or unbanning
an account. Never copy a secret/service-role key into the app or repository.
Configure email confirmation and your app's redirect URLs in Supabase Auth as
appropriate for your deployment.

The user-management migration creates profiles from new Auth users and applies
row-level security. Users can edit their own name and phone and upload a JPEG,
PNG, or WebP profile picture up to 5 MB. Avatar images are private and stored
under each user's own path. Active admins and super-admins can use the
role-restricted dashboard to review shops, listings, and users. Dashboard reads
and moderation updates are protected by database RLS; non-admins are redirected
away from the route. Admins can archive shops and products, permanently remove
products, and deactivate or reactivate accounts after confirmation. Only
super-admins can change account roles. The last active super-admin cannot be
demoted, and super-admin accounts cannot be disabled from the dashboard.

Each signed-in account can create one shop. Published shop pages and product
listings are public immediately; owners can manage products, inventory, and
shop visibility from the shop dashboard.

Product names, prices, and photos are sample content in `src/app/index.tsx`.

## Orders

The order flow uses server-calculated prices, shipping, and stock through the
`place_order` and `update_order_status` RPCs. One checkout creates one order per
shop, grouped by a shared checkout ID. Delivery is ₱99 per shop below ₱1,500
and free at or above ₱1,500. Cash on Delivery is enabled; online payment,
GCash, and Maya remain disabled until a trusted payment provider is integrated.
The app includes saved addresses, buyer order history and tracking, plus a
seller order inbox with courier/tracking entry.

After running the orders migration, use
`supabase/tests/orders_security.sql` in the SQL Editor to check buyer/seller
order visibility and client write privileges. Replace the placeholder UUIDs
with test records. Its comments also describe a two-session, last-item race test:
two buyers attempt to order inventory of one simultaneously; only one order
should succeed and the failed transaction must leave stock and cart unchanged.

If Supabase reports that it cannot find a relationship between `cart_items` and
`shop_products`, re-run the idempotent orders migration so it can ensure the
cart product foreign key exists and reload the PostgREST schema cache. The app
also fetches cart rows and product records separately, so cart loading no
longer depends on PostgREST discovering that relationship.
