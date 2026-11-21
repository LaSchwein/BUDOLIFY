import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getDefaultKey(environmentVariable: string) {
  const rawValue = Deno.env.get(environmentVariable);
  if (!rawValue) return null;
  try {
    const keys = JSON.parse(rawValue) as Record<string, string>;
    return keys.default ?? null;
  } catch {
    return rawValue;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'A valid signed-in session is required.' });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse(400, { error: 'Request body must be a JSON object.' });
  }
  const body = payload as { action?: unknown; targetUserId?: unknown };
  if (
    (body.action !== 'disable' && body.action !== 'enable') ||
    typeof body.targetUserId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.targetUserId,
    )
  ) {
    return jsonResponse(400, { error: 'Choose a valid user and account action.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey =
    getDefaultKey('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey =
    getDefaultKey('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'User management is not configured on the server.' });
  }

  const token = authorization.slice('Bearer '.length);
  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await callerClient.auth.getUser(token);
  if (authError || !userData.user) {
    return jsonResponse(401, { error: 'Your session is invalid or expired.' });
  }
  if (userData.user.id === body.targetUserId) {
    return jsonResponse(400, { error: 'You cannot disable or enable your own account.' });
  }

  const { data: callerProfile, error: roleError } = await callerClient
    .from('profiles')
    .select('role,is_suspended')
    .eq('id', userData.user.id)
    .single();
  if (
    roleError ||
    (callerProfile?.role !== 'admin' && callerProfile?.role !== 'super_admin') ||
    callerProfile?.is_suspended
  ) {
    return jsonResponse(403, { error: 'Only an active admin can manage account access.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: targetProfile, error: targetError } = await adminClient
    .from('profiles')
    .select('role,is_suspended')
    .eq('id', body.targetUserId)
    .single();
  if (targetError || !targetProfile) {
    return jsonResponse(404, { error: 'User profile not found.' });
  }
  if (targetProfile.role === 'super_admin') {
    return jsonResponse(403, { error: 'Super admin accounts cannot be disabled here.' });
  }
  if (targetProfile.is_suspended === (body.action === 'disable')) {
    return jsonResponse(200, {
      message: body.action === 'disable' ? 'Account is already disabled.' : 'Account is already enabled.',
    });
  }

  const previousAction = targetProfile.is_suspended ? 'disable' : 'enable';
  const banDuration = body.action === 'disable' ? '876000h' : 'none';
  const { error: banError } = await adminClient.auth.admin.updateUserById(body.targetUserId, {
    ban_duration: banDuration,
  });
  if (banError) {
    return jsonResponse(400, { error: banError.message });
  }

  const { error: profileError } = await adminClient
    .from('profiles')
    .update({ is_suspended: body.action === 'disable' })
    .eq('id', body.targetUserId);
  if (profileError) {
    const rollbackDuration = previousAction === 'disable' ? '876000h' : 'none';
    const { error: rollbackError } = await adminClient.auth.admin.updateUserById(
      body.targetUserId,
      { ban_duration: rollbackDuration },
    );
    if (rollbackError) {
      return jsonResponse(500, {
        error: `Profile status update failed and account rollback failed: ${profileError.message}; ${rollbackError.message}`,
      });
    }
    return jsonResponse(500, { error: `Profile status update failed: ${profileError.message}` });
  }

  return jsonResponse(200, {
    message: body.action === 'disable' ? 'Account disabled.' : 'Account enabled.',
  });
});
