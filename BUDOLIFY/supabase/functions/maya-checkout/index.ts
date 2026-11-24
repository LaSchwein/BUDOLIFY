import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getKey(name: string) {
  const value = Deno.env.get(name);
  if (!value) return null;
  try {
    return (JSON.parse(value) as Record<string, string>).default ?? value;
  } catch {
    return value;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return response(401, { error: 'Sign in to continue.' });
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = getKey('SUPABASE_PUBLISHABLE_KEYS') ?? getKey('SUPABASE_PUBLISHABLE_KEY') ?? getKey('SUPABASE_ANON_KEY');
  const serviceRoleKey = getKey('SUPABASE_SECRET_KEYS') ?? getKey('SUPABASE_SECRET_KEY') ?? getKey('SUPABASE_SERVICE_ROLE_KEY');
  const mayaPublicKey = Deno.env.get('MAYA_PUBLIC_KEY');
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return response(503, { error: 'Online checkout is not configured on the server.' });
  }

  let body: {
    action?: unknown;
    addressId?: unknown;
    note?: unknown;
    requestKey?: unknown;
    checkoutGroupId?: unknown;
    selectedProductIds?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return response(400, { error: 'Request body must be valid JSON.' });
  }
  const isResume = body.action === 'resume';
  const selectedProductIds = body.selectedProductIds;
  const hasValidSelectedProducts =
    selectedProductIds === undefined ||
    (Array.isArray(selectedProductIds) &&
      selectedProductIds.length > 0 &&
      selectedProductIds.every(
        (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
      ) &&
      new Set(selectedProductIds).size === selectedProductIds.length);
  if (isResume) {
    if (typeof body.checkoutGroupId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.checkoutGroupId)) {
      return response(400, { error: 'Choose a valid order.' });
    }
  } else if (
    (body.action !== undefined && body.action !== 'create') ||
    typeof body.addressId !== 'string' ||
    typeof body.requestKey !== 'string' ||
    !/^[a-zA-Z0-9_-]{20,100}$/.test(body.requestKey) ||
    (body.note !== undefined && typeof body.note !== 'string') ||
    !hasValidSelectedProducts
  ) return response(400, { error: 'Choose a delivery address and retry checkout.' });

  const caller = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await caller.auth.getUser(authorization.slice(7));
  if (authError || !userData.user) return response(401, { error: 'Your session is invalid or expired.' });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (isResume) {
    const { data: checkout, error } = await admin.from('payment_checkouts')
      .select('checkout_group_id,checkout_url,status,buyer_id')
      .eq('checkout_group_id', body.checkoutGroupId).maybeSingle();
    if (error || !checkout || checkout.buyer_id !== userData.user.id) return response(404, { error: 'Payment checkout not found.' });
    if (checkout.status !== 'pending' || !checkout.checkout_url) return response(409, { error: 'This order is not waiting for payment.' });
    return response(200, { checkoutUrl: checkout.checkout_url, checkoutGroupId: checkout.checkout_group_id });
  }
  if (!mayaPublicKey) return response(503, { error: 'Online checkout is not configured on the server.' });

  let checkout: {
    checkout_group_id: string;
    buyer_id: string;
    amount_minor: number;
    status: string;
    provider_session_id: string | null;
    checkout_url: string | null;
  } | null = null;
  const prior = await admin.from('payment_checkouts').select('*').eq('request_key', body.requestKey).maybeSingle();
  if (prior.error) return response(500, { error: 'Unable to load this checkout.' });
  if (prior.data) {
    if (prior.data.buyer_id !== userData.user.id) return response(403, { error: 'This checkout belongs to another account.' });
    if (prior.data.status === 'pending' && prior.data.checkout_url) {
      return response(200, { checkoutUrl: prior.data.checkout_url, checkoutGroupId: prior.data.checkout_group_id });
    }
    if (prior.data.status !== 'creating') return response(409, { error: 'This checkout can no longer be paid. Start a new order.' });
    checkout = prior.data;
  } else {
    const { data: orders, error: orderError } = await caller.rpc('place_order', {
      p_address_id: body.addressId,
      p_payment_method: 'online',
      p_note: typeof body.note === 'string' ? body.note.trim() : '',
      p_selected_product_ids: Array.isArray(selectedProductIds) ? selectedProductIds : null,
    });
    if (orderError || !orders?.length) {
      return response(400, { error: orderError?.message ?? 'Your order could not be created.' });
    }
    const checkoutGroupId = orders[0].checkout_group_id as string;
    const { data: groupedOrders, error: totalError } = await admin
      .from('orders').select('total').eq('checkout_group_id', checkoutGroupId).eq('buyer_id', userData.user.id);
    if (totalError || !groupedOrders?.length) {
      await admin.rpc('fail_maya_checkout', { p_checkout_group_id: checkoutGroupId });
      return response(500, { error: 'Unable to prepare your payment. Your items were returned to your cart.' });
    }
    const amountMinor = Math.round(groupedOrders.reduce((sum, row) => sum + Number(row.total), 0) * 100);
    const { data: inserted, error: insertError } = await admin.from('payment_checkouts').insert({
      checkout_group_id: checkoutGroupId,
      request_key: body.requestKey,
      buyer_id: userData.user.id,
      amount_minor: amountMinor,
      provider: 'maya',
      status: 'creating',
    }).select('*').single();
    if (insertError || !inserted) {
      await admin.rpc('fail_maya_checkout', { p_checkout_group_id: checkoutGroupId });
      return response(500, { error: 'Unable to save your payment session.' });
    }
    checkout = inserted;
  }

  const appReturnUrl = Deno.env.get('PAYMENT_RETURN_URL') ?? 'budolify://orders';
  const sessionResponse = await fetch('https://pg-sandbox.paymaya.com/checkout/v1/checkouts', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${mayaPublicKey}:`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      totalAmount: { value: Number(checkout.amount_minor) / 100, currency: 'PHP' },
      requestReferenceNumber: checkout.checkout_group_id,
      redirectUrl: { success: appReturnUrl, failure: appReturnUrl, cancel: appReturnUrl },
      metadata: { checkout_group_id: checkout.checkout_group_id, request_key: body.requestKey },
    }),
  });
  const sessionPayload = await sessionResponse.json().catch(() => null);
  const session = sessionPayload?.data ?? sessionPayload;
  const checkoutUrl = session?.redirectUrl;
  if (!sessionResponse.ok && (sessionResponse.status === 409 || sessionResponse.status === 429 || sessionResponse.status >= 500)) {
    return response(503, { error: 'Maya Sandbox is temporarily unavailable. Retry this checkout.' });
  }
  if (!sessionResponse.ok) {
    await admin.rpc('fail_maya_checkout', { p_checkout_group_id: checkout.checkout_group_id });
    return response(502, { error: 'Maya could not start checkout. Your items were returned to your cart; please try again.' });
  }
  const sessionId = session?.checkoutId ?? session?.id;
  if (typeof sessionId !== 'string' || typeof checkoutUrl !== 'string') {
    return response(503, { error: 'Maya returned an incomplete checkout response. Retry this checkout.' });
  }

  const { error: updateError } = await admin.from('payment_checkouts').update({
    provider_session_id: sessionId,
    checkout_url: checkoutUrl,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }).eq('checkout_group_id', checkout.checkout_group_id);
  if (updateError) return response(503, { error: 'Payment session started. Check your orders before retrying.' });
  return response(200, { checkoutUrl, checkoutGroupId: checkout.checkout_group_id });
});
