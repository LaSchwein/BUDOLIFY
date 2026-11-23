import { createClient } from 'npm:@supabase/supabase-js@2';

function getKey(name: string) {
  const value = Deno.env.get(name);
  if (!value) return null;
  try { return (JSON.parse(value) as Record<string, string>).default ?? value; } catch { return value; }
}

function sameSecret(received: string, expected: string) {
  const left = new TextEncoder().encode(received);
  const right = new TextEncoder().encode(expected);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  const expirySecret = Deno.env.get('PAYMENT_EXPIRY_SECRET');
  const serviceRoleKey = getKey('SUPABASE_SECRET_KEYS') ?? getKey('SUPABASE_SECRET_KEY') ?? getKey('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const mayaSecretKey = Deno.env.get('MAYA_SECRET_KEY');
  const authorization = request.headers.get('Authorization') ?? '';
  if (!expirySecret || !serviceRoleKey || !supabaseUrl || !mayaSecretKey) {
    return Response.json({ error: 'Checkout expiry is not configured.' }, { status: 503 });
  }
  if (!sameSecret(authorization.replace(/^Bearer\s+/i, ''), expirySecret)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staleBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: checkouts, error } = await admin.from('payment_checkouts')
    .select('checkout_group_id,provider_session_id,amount_minor,status')
    .eq('provider', 'maya').in('status', ['creating', 'pending']).lt('created_at', staleBefore).limit(100);
  if (error) return Response.json({ error: 'Unable to find stale checkouts.' }, { status: 500 });

  let expired = 0;
  let confirmed = 0;
  for (const checkout of checkouts ?? []) {
    let sessionId = checkout.provider_session_id;
    if (!sessionId && checkout.status === 'creating') {
      const lookup = await fetch(
        `https://pg-sandbox.paymaya.com/payments/v1/payment-rrns/${encodeURIComponent(checkout.checkout_group_id)}`,
        { headers: { Authorization: `Basic ${btoa(`${mayaSecretKey}:`)}` } },
      );
      if (lookup.status === 404) {
        const { data: released } = await admin.rpc('fail_maya_checkout', {
          p_checkout_group_id: checkout.checkout_group_id,
        });
        if (released === true) expired += 1;
        continue;
      }
      if (!lookup.ok) continue;
      const found = await lookup.json().catch(() => null);
      sessionId = found?.id ?? found?.paymentId;
      if (typeof sessionId !== 'string') continue;
      await admin.from('payment_checkouts').update({ provider_session_id: sessionId })
        .eq('checkout_group_id', checkout.checkout_group_id);
    }
    if (!sessionId) continue;
    const lookupResponse = await fetch(
      `https://pg-sandbox.paymaya.com/payments/v1/payments/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Basic ${btoa(`${mayaSecretKey}:`)}` } },
    );
    if (!lookupResponse.ok) continue;
    const current = await lookupResponse.json().catch(() => null);
    const status = current?.paymentStatus ?? current?.status;
    if (status === 'PAYMENT_SUCCESS' || current?.isPaid === true) {
      const { data: accepted } = await admin.rpc('confirm_maya_payment', {
        p_event_id: `maya-reconcile:${sessionId}`,
        p_event_type: 'PAYMENT_SUCCESS.reconciled',
        p_session_id: sessionId,
        p_payment_id: sessionId,
        p_amount_minor: Math.round(Number(current.amount) * 100),
      });
      if (accepted === true) confirmed += 1;
      continue;
    }
    if (['PAYMENT_EXPIRED', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED'].includes(status)) {
      const { data: released } = await admin.rpc('fail_maya_checkout', {
        p_checkout_group_id: checkout.checkout_group_id,
      });
      if (released === true) expired += 1;
    }
  }

  return Response.json({ expired, confirmed, examined: checkouts?.length ?? 0 });
});
