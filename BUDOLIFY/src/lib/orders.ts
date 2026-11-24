import { supabase } from '@/lib/supabase';

export type OrderStatus =
  | 'pending_payment'
  | 'placed'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded';

export type PaymentMethod = 'cod' | 'online';

export type ShippingAddress = {
  full_name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postal_code: string;
};

export type SavedAddress = ShippingAddress & {
  id: string;
  user_id: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type AddressDraft = Omit<
  ShippingAddress,
  'line2' | 'postal_code'
> & {
  line2?: string;
  postal_code?: string;
  is_default: boolean;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  image_path: string | null;
  line_total: number;
};

export type OrderEvent = {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string | null;
  note: string;
  created_at: string;
};

export type OrderRecord = {
  id: string;
  checkout_group_id: string;
  buyer_id: string;
  shop_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  shipping_address: ShippingAddress;
  buyer_note: string;
  courier: string | null;
  tracking_number: string | null;
  created_at: string;
  updated_at: string;
  shops?: { name: string; slug: string } | null;
  order_items?: OrderItem[];
  order_events?: OrderEvent[];
};

export type PlacedOrder = {
  order_id: string;
  checkout_group_id: string;
  shop_id: string;
};

export type OrderAction = {
  orderId: string;
  newStatus: OrderStatus;
  courier?: string;
  trackingNumber?: string;
};

export class OrderError extends Error {
  readonly code: string;

  constructor(message: string, code = 'ORDER_ERROR') {
    super(message);
    this.name = 'OrderError';
    this.code = code;
  }
}

function mapOrderError(error: unknown): OrderError {
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : error instanceof Error
        ? error.message
        : '';
  const normalized = raw.toUpperCase();

  if (normalized.includes('OUT_OF_STOCK')) {
    return new OrderError(
      raw.split(':').slice(1).join(':').trim()
        ? `${raw.split(':').slice(1).join(':').trim()} is out of stock.`
        : 'One or more items are out of stock. Update your cart and try again.',
      'OUT_OF_STOCK',
    );
  }
  if (normalized.includes('PRODUCT_UNAVAILABLE')) {
    return new OrderError(
      'A product or shop is no longer available. Review your cart.',
      'PRODUCT_UNAVAILABLE',
    );
  }
  if (normalized.includes('CART_EMPTY')) {
    return new OrderError('Your cart is empty.', 'CART_EMPTY');
  }
  if (normalized.includes('CART_ITEMS_CHANGED')) {
    return new OrderError(
      'Your cart changed during checkout. Return to your cart and select items again.',
      'CART_ITEMS_CHANGED',
    );
  }
  if (normalized.includes('ADDRESS_NOT_FOUND')) {
    return new OrderError('Choose a saved address before placing your order.', 'ADDRESS_NOT_FOUND');
  }
  if (normalized.includes('ONLINE_PAYMENT_UNAVAILABLE')) {
    return new OrderError(
      'Online payment is not available yet. Choose Cash on Delivery.',
      'ONLINE_PAYMENT_UNAVAILABLE',
    );
  }
  if (normalized.includes('ORDER_TRANSITION_NOT_ALLOWED')) {
    return new OrderError('That order action is not available right now.', 'INVALID_TRANSITION');
  }
  if (normalized.includes('SHIPPING_DETAILS_REQUIRED')) {
    return new OrderError('Enter the courier and tracking number to ship this order.', 'SHIPPING_DETAILS_REQUIRED');
  }
  if (normalized.includes('AUTHENTICATION_REQUIRED')) {
    return new OrderError('Sign in to continue.', 'AUTHENTICATION_REQUIRED');
  }
  return new OrderError(raw || 'The order request failed. Please try again.');
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw mapOrderError(error ?? new Error('AUTHENTICATION_REQUIRED'));
  return data.user.id;
}

export async function placeOrder(
  addressId: string,
  paymentMethod: PaymentMethod = 'cod',
  note = '',
  selectedProductIds?: string[],
): Promise<PlacedOrder[]> {
  const { data, error } = await supabase.rpc('place_order', {
    p_address_id: addressId,
    p_payment_method: paymentMethod,
    p_note: note,
    p_selected_product_ids: selectedProductIds ?? null,
  });
  if (error) throw mapOrderError(error);
  return (data ?? []) as PlacedOrder[];
}

export async function createMayaCheckout({
  addressId,
  note,
  requestKey,
  selectedProductIds,
}: {
  addressId: string;
  note: string;
  requestKey: string;
  selectedProductIds: string[];
}): Promise<{ checkoutUrl: string; checkoutGroupId: string }> {
  const { data, error } = await supabase.functions.invoke('maya-checkout', {
    body: { addressId, note, requestKey, selectedProductIds },
  });
  if (error) throw new OrderError(error.message || 'Unable to start online checkout.');
  if (
    !data ||
    typeof data.checkoutUrl !== 'string' ||
    typeof data.checkoutGroupId !== 'string'
  ) {
    throw new OrderError(data?.error ?? 'Unable to start online checkout.');
  }
  return data as { checkoutUrl: string; checkoutGroupId: string };
}

export async function resumeMayaCheckout(checkoutGroupId: string) {
  const { data, error } = await supabase.functions.invoke('maya-checkout', {
    body: { action: 'resume', checkoutGroupId },
  });
  if (error) throw new OrderError(error.message || 'Unable to reopen this payment.');
  if (!data || typeof data.checkoutUrl !== 'string') {
    throw new OrderError(data?.error ?? 'Unable to reopen this payment.');
  }
  return data as { checkoutUrl: string; checkoutGroupId: string };
}

export async function listMyOrders(): Promise<OrderRecord[]> {
  const buyerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('orders')
    .select('*,shops(name,slug),order_items(*)')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });
  if (error) throw mapOrderError(error);
  return (data ?? []) as unknown as OrderRecord[];
}

export async function getOrder(orderId: string): Promise<OrderRecord> {
  const { data, error } = await supabase
    .from('orders')
    .select('*,shops(name,slug),order_items(*),order_events(*)')
    .eq('id', orderId)
    .single();
  if (error) throw mapOrderError(error);
  return data as unknown as OrderRecord;
}

export async function listShopOrders(
  shopId: string,
  status?: OrderStatus,
): Promise<OrderRecord[]> {
  let query = supabase
    .from('orders')
    .select('*,order_items(*)')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw mapOrderError(error);
  return (data ?? []) as unknown as OrderRecord[];
}

export async function updateOrderStatus({
  orderId,
  newStatus,
  courier,
  trackingNumber,
}: OrderAction): Promise<OrderRecord> {
  const { data, error } = await supabase.rpc('update_order_status', {
    p_order_id: orderId,
    p_new_status: newStatus,
    p_courier: courier ?? null,
    p_tracking_number: trackingNumber ?? null,
  });
  if (error) throw mapOrderError(error);
  return data as unknown as OrderRecord;
}

export async function listAddresses(): Promise<SavedAddress[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw mapOrderError(error);
  return (data ?? []) as SavedAddress[];
}

export async function saveAddress(
  draft: AddressDraft,
  addressId?: string,
): Promise<SavedAddress> {
  const userId = await getCurrentUserId();
  const values = {
    user_id: userId,
    full_name: draft.full_name.trim(),
    phone: draft.phone.trim(),
    line1: draft.line1.trim(),
    line2: draft.line2?.trim() ?? '',
    city: draft.city.trim(),
    province: draft.province.trim(),
    postal_code: draft.postal_code?.trim() ?? '',
    is_default: draft.is_default,
  };
  const query = addressId
    ? supabase.from('addresses').update(values).eq('id', addressId).eq('user_id', userId)
    : supabase.from('addresses').insert(values);
  const { data, error } = await query.select('*').single();
  if (error) throw mapOrderError(error);
  return data as SavedAddress;
}

export async function deleteAddress(addressId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('addresses')
    .delete()
    .eq('id', addressId)
    .eq('user_id', userId);
  if (error) throw mapOrderError(error);
}
