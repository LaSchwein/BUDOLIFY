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
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = getKey('SUPABASE_PUBLISHABLE_KEYS') ?? getKey('SUPABASE_PUBLISHABLE_KEY') ?? getKey('SUPABASE_ANON_KEY');
  const serviceRoleKey = getKey('SUPABASE_SECRET_KEYS') ?? getKey('SUPABASE_SECRET_KEY') ?? getKey('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !publishableKey || !serviceRoleKey) {
    return response(401, { error: 'Sign in with an authorized account to refund an order.' });
  }
  let body: { action?: unknown; checkoutGroupId?: unknown };
  try { body = await request.json(); } catch { return response(400, { error: 'Invalid JSON.' }); }

  const caller = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await caller.auth.getUser(authorization.slice(7));
  if (authError || !userData.user) return response(401, { error: 'Your session is invalid or expired.' });
  const { data: profile } = await caller.from('profiles').select('role,is_suspended').eq('id', userData.user.id).single();
  if (!profile || !['admin', 'super_admin'].includes(profile.role) || profile.is_suspended) {
    return response(403, { error: 'Only an active admin can issue a refund.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (body.action === 'list') {
    const { data, error } = await admin.from('payment_checkouts')
      .select('checkout_group_id,amount_minor,status,refund_status,created_at,provider_payment_id')
      .eq('provider', 'maya')
      .order('created_at', { ascending: false }).limit(100);
    if (error) return response(500, { error: 'Unable to load payment records.' });
    return response(200, { payments: data ?? [] });
  }
  if (typeof body.checkoutGroupId !== 'string') return response(400, { error: 'Choose a valid checkout.' });
  const { data: checkout, error: lookupError } = await admin.from('payment_checkouts')
    .select('checkout_group_id,provider_payment_id,amount_minor,status,refund_status')
    .eq('checkout_group_id', body.checkoutGroupId).eq('provider', 'maya').single();
  if (lookupError || !checkout) return response(404, { error: 'Payment not found.' });
  if (checkout.status !== 'paid' || !checkout.provider_payment_id) {
    return response(409, { error: 'Only a confirmed payment can be refunded.' });
  }
  if (checkout.refund_status === 'pending' || checkout.refund_status === 'processing' || checkout.refund_status === 'succeeded') {
    return response(409, { error: 'A refund has already been requested for this checkout.' });
  }
  const mayaSecretKey = Deno.env.get('MAYA_SECRET_KEY');
  if (!mayaSecretKey) return response(503, { error: 'Maya Sandbox refunds are not configured on the server.' });

  const providerResponse = await fetch(`https://pg-sandbox.paymaya.com/payments/v1/payments/${encodeURIComponent(checkout.provider_payment_id)}/refunds`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${mayaSecretKey}:`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: `Full refund for BUDOLIFY checkout ${checkout.checkout_group_id}`,
      totalAmount: { amount: Number(checkout.amount_minor) / 100, currency: 'PHP' },
    }),
  });
  const result = await providerResponse.json().catch(() => null);
  const refund = result?.data ?? result;
  const refundId = refund?.id;
  const refundStatus = refund?.status === 'SUCCESS' ? 'succeeded' : refund?.status?.toLowerCase();
  if (!providerResponse.ok || typeof refundId !== 'string' || typeof refundStatus !== 'string') {
    return response(502, { error: result?.message ?? 'Maya could not process this refund.' });
  }
  const { error: recordError } = await admin.rpc('record_maya_refund', {
    p_event_id: `api:${refundId}`,
    p_event_type: 'refund.api_response',
    p_payment_id: checkout.provider_payment_id,
    p_refund_id: refundId,
    p_refund_status: refundStatus,
  });
  if (recordError) return response(503, { error: 'Refund submitted; its final status is being synchronized.' });
  return response(200, { refundId, status: refundStatus });
});
