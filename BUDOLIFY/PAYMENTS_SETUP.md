# Maya Checkout Sandbox setup

BUDOLIFY's online payment integration targets Maya Checkout **Sandbox**. The hosted Maya checkout supports sandbox Maya Wallet and card flows. Cash on Delivery remains available. Marketplace orders settle to BUDOLIFY; sellers are paid separately.

## Supabase configuration

The Maya functions require these secrets in [Supabase Edge Functions](https://supabase.com/dashboard/project/fooogugfirnozyulxxdh/functions):

- `MAYA_PUBLIC_KEY`: Sandbox public API key (`pk-...`), used to create Checkout sessions.
- `MAYA_SECRET_KEY`: Sandbox secret API key (`sk-...`), used for payment status reconciliation and refunds.
- `PAYMENT_EXPIRY_SECRET`: keep the existing random server-side secret used to authorize the scheduled expiry function.
- Supabase's service role and publishable keys, already available to the project functions.

Obtain sandbox API keys through Maya Manager 1.0 Sandbox. Keep keys in Supabase secrets; never put them in chat, source control, or Expo public variables. This code intentionally uses Maya's sandbox API host. Do not use production credentials with it.

## Webhook registration

Register the sandbox webhook in Maya Manager 1.0 (Settings → Webhooks), or use Maya's Create Webhook API. Set the callback URL to:

`https://fooogugfirnozyulxxdh.supabase.co/functions/v1/maya-webhook`

Subscribe to `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `PAYMENT_EXPIRED`, and `PAYMENT_CANCELLED`. Webhooks are authenticated against Maya's published Sandbox RSA signing keys and a five-minute timestamp window. Payment confirmation comes only from a verified webhook or status reconciliation.

## Database and function deployment

Apply `supabase/migrations/20261123130000_maya_sandbox_payments.sql` and deploy `maya-checkout`, `maya-webhook`, `maya-refund`, and `maya-expire-checkouts`. Because this project previously had no migration history table, reconcile that history before using `supabase db push`; do not blindly replay older migrations.

Update the existing 15-minute scheduled request to call `/functions/v1/maya-expire-checkouts` and keep its bearer token set to `PAYMENT_EXPIRY_SECRET`. Maya Checkout sessions last one hour. The expiry function queries Maya Sandbox and releases reserved inventory only after Maya reports a terminal unsuccessful status; paid transactions are reconciled.

## Test the complete flow

Use Maya's Sandbox test cards or sandbox Maya Wallet credentials from Maya's testing guide. Confirm that checkout redirects to Maya's hosted sandbox page, a verified `PAYMENT_SUCCESS` webhook moves the orders from pending payment to placed, and failed, cancelled, and expired sessions return stock to the buyer's cart. Check the Maya and Supabase function delivery logs.

Refunds must first be enabled for the merchant by Maya. An active BUDOLIFY admin can then use **Manage online payments and refunds** to request a full refund. Refunds may be unavailable until the next calendar day (Philippine time), depending on Maya's rules. The app marks orders refunded after Maya returns a successful refund response; partial refunds are not exposed in the app.

This integration is Sandbox only and does not accept live payments. Production needs a separate review of production API hosts, keys, webhook verification keys, and operational configuration.

## Maya references

- [Maya Checkout: accept one-time payments](https://developers.maya.ph/reference/accept-one-time-payment-using-maya-checkout)
- [Maya Checkout: configure webhooks](https://developers.maya.ph/reference/configuring-your-webhook-for-maya-checkout)
- [Maya Checkout: webhook security](https://developers.maya.ph/reference/webhook-security)
- [Maya Checkout: sandbox testing](https://developers.maya.ph/reference/testing-and-validating-your-maya-checkout-integration)
- [Maya Checkout: voids and refunds](https://developers.maya.ph/reference/managing-voids-and-refunds-in-maya-checkout)
