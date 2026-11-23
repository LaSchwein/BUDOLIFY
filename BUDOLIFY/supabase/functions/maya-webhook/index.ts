import { createClient } from 'npm:@supabase/supabase-js@2';

function getKey(name: string) {
  const value = Deno.env.get(name);
  if (!value) return null;
  try { return (JSON.parse(value) as Record<string, string>).default ?? value; } catch { return value; }
}

const SANDBOX_KEYS = [
  `-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjNkSX6p+goDPaPAYuTzT\nzKTCBeLhh8FkPMbZxDKTUxF93dOwiC7jsdx7KyopupeLosiVlbs+gpAJ7XBQP/Ex\ngiyzXC9TljpyvkUQfyRPMAMKq+BzxdUliTl6hgrLBsH28CP5FuPHCsfxDXe7mDtv\n9H4mP3SKO0HfkZ45tudxD9CWbwWKF0lU9LRbLlJ0y7KEaK7Rv9fI1Dp/KPT+9pls\ntU+CPNKaxJjGRKGuxW2AOCabSD0cTZNXki+K51mNoma7Mj1HMhnsR68FGJvCqk1q\nWsr3q8+EUMVPBMX+5nKATfZYGvxg4ytzT8pnEVeWl6phYKviB9aVVwurh1gDJB4r\nlQIDAQAB\n-----END PUBLIC KEY-----`,
  `-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp14gezqq4dGWu7EZ7BHx\n8wD3y1hqxwQR7UYPXtXJP+WngN4wqwatjsnQaRGnmdPRG8VEzUzw9PlR7t7P24uW\n+J08xBrtTVouD2MKglcIcy13rt1XL79zr/LIAFMFI6f4O8/OQi1xsGsZ6xarD+wl\nOQKG4W66I3yp2jNAbge25eSPuo0BNqPWvebMcIYJu4f3Fxu1eDgeM6zCEqLc6+jX\ncNTP/zFHCvQaiIlLOqfgXDRPBcHPPZ2qcB99UVPAHXBKsKdtBB2w2qT2l99MlTAB\niRy+IKtVQcQyRP7T8blegO25x35G2CZ3VCKPkmUen3eXQ4+r5fVlzEIBSfNvBwT9\njQIDAQAB\n-----END PUBLIC KEY-----`,
];

function flatten(value: unknown, prefix = '', result: string[] = []) {
  if (!value || typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value)) {
    if (child === null || child === '' || child === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'object') flatten(child, path, result);
    else result.push(`${path}=${String(child)}`);
  }
  return result;
}

async function verifies(payload: Record<string, unknown>, signatureHeader: string, timestampHeader: string) {
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;
  const values = Object.fromEntries(signatureHeader.split(',').map((part) => {
    const [key, ...value] = part.trim().split('='); return [key, value.join('=')];
  }));
  if (!values.nonce || !values.v1) return false;
  const signed = new TextEncoder().encode(`${flatten(payload).sort().join('&')}&nonce=${values.nonce}`);
  const signature = Uint8Array.from(values.v1.match(/.{1,2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  for (const pem of SANDBOX_KEYS) {
    try {
      const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), (char) => char.charCodeAt(0));
      const key = await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed)) return true;
    } catch { /* Try Maya's rotated sandbox key. */ }
  }
  return false;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = getKey('SUPABASE_SECRET_KEYS') ?? getKey('SUPABASE_SECRET_KEY') ?? getKey('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: 'Webhook is not configured.' }, { status: 503 });
  let body: Record<string, any>;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const signature = request.headers.get('X-Maya-Webhook-Signature');
  const timestamp = request.headers.get('X-Maya-Webhook-Timestamp');
  if (!signature || !timestamp || !(await verifies(body, signature, timestamp))) {
    return Response.json({ error: 'Invalid Maya webhook signature.' }, { status: 401 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const paymentId = body.id;
  const status = body.paymentStatus ?? body.status;
  if (typeof paymentId !== 'string' || typeof status !== 'string') return Response.json({ error: 'Payment event is incomplete.' }, { status: 400 });
  const eventId = `maya:${paymentId}:${status}`;
  if (status === 'PAYMENT_SUCCESS') {
    const amountMinor = Math.round(Number(body.amount) * 100);
    if (!Number.isSafeInteger(amountMinor) || body.currency !== 'PHP') return Response.json({ error: 'Payment amount is invalid.' }, { status: 400 });
    const { data: accepted, error } = await admin.rpc('confirm_maya_payment', {
      p_event_id: eventId, p_event_type: status, p_session_id: paymentId,
      p_payment_id: paymentId, p_amount_minor: amountMinor,
    });
    if (error || accepted !== true) return Response.json({ error: 'Payment did not match an open order.' }, { status: 409 });
  } else if (['PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'PAYMENT_CANCELLED'].includes(status)) {
    const { data: accepted, error } = await admin.rpc('fail_maya_checkout', { p_checkout_group_id: body.requestReferenceNumber });
    if (error || accepted !== true) return Response.json({ error: 'Checkout did not match an open order.' }, { status: 409 });
  }
  return Response.json({ received: true });
});
