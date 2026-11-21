import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '@/lib/auth-context';
import { getShopImageUrl } from '@/lib/shop-images';
import { supabase } from '@/lib/supabase';
import type { StoreProduct } from '@/lib/storefront-types';

export type CartLine = {
  productId: string;
  quantity: number;
  product: StoreProduct | null;
};

type CartSnapshot = {
  userId: string | null;
  items: CartLine[];
  isLoading: boolean;
  error: string | null;
};

type RawCartProduct = {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  category: string;
  price: number | string;
  image_path: string | null;
  inventory: number;
};

type RawCartShop = {
  id: string;
  name: string;
  slug: string;
};

const colors = ['#e8e4d8', '#f3e7df', '#e4e9e3', '#eee8dd'];
const listeners = new Set<() => void>();
const quantityTimers = new Map<string, ReturnType<typeof setTimeout>>();
let requestedUserId: string | null | undefined;
let connectionPromise: Promise<void> | null = null;
let cartSnapshot: CartSnapshot = {
  userId: null,
  items: [],
  isLoading: false,
  error: null,
};

function publish(next: CartSnapshot) {
  cartSnapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return cartSnapshot;
}

function getProduct(
  row: RawCartProduct | undefined,
  shop: RawCartShop | undefined,
  index: number,
): StoreProduct | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    price: Number(row.price),
    rating: 'NEW',
    badge: 'SHOP FIND',
    image: getShopImageUrl(row.image_path) ?? '',
    background: colors[index % colors.length],
    shopId: row.shop_id,
    shopName: shop?.name ?? 'Community shop',
    shopSlug: shop?.slug,
    stock: row.inventory,
  };
}

async function fetchServerCart(userId: string) {
  const { data: cartRows, error: cartError } = await supabase
    .from('cart_items')
    .select('product_id,quantity')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (cartError) throw cartError;

  const rows = cartRows ?? [];
  if (rows.length === 0) return [];

  const productIds = rows.map((row) => row.product_id);
  const { data: productRows, error: productError } = await supabase
    .from('shop_products')
    .select('id,shop_id,name,description,category,price,image_path,inventory')
    .in('id', productIds)
    .eq('is_archived', false);
  if (productError) throw productError;

  const products = (productRows ?? []) as RawCartProduct[];
  const shopIds = [...new Set(products.map((product) => product.shop_id))];
  const { data: shopRows, error: shopError } =
    shopIds.length === 0
      ? { data: [], error: null }
      : await supabase.from('shops').select('id,name,slug').in('id', shopIds);
  if (shopError) throw shopError;

  const productsById = new Map(products.map((product) => [product.id, product]));
  const shopsById = new Map(
    ((shopRows ?? []) as RawCartShop[]).map((shop) => [shop.id, shop]),
  );
  return rows.map((row, index) => {
    const product = productsById.get(row.product_id);
    return {
      productId: row.product_id,
      quantity: row.quantity,
      product: getProduct(
        product,
        product ? shopsById.get(product.shop_id) : undefined,
        index,
      ),
    };
  });
}

function cancelQuantityTimer(productId: string) {
  const timer = quantityTimers.get(productId);
  if (timer) clearTimeout(timer);
  quantityTimers.delete(productId);
}

function clearQuantityTimers() {
  quantityTimers.forEach((timer) => clearTimeout(timer));
  quantityTimers.clear();
}

async function reloadCart(userId: string) {
  try {
    const items = await fetchServerCart(userId);
    if (requestedUserId === userId) {
      publish({ ...cartSnapshot, userId, items, isLoading: false, error: null });
    }
  } catch (error) {
    if (requestedUserId === userId) {
      publish({
        ...cartSnapshot,
        isLoading: false,
        error: getErrorMessage(error),
      });
    }
  }
}

async function restoreCartAfterError(userId: string, operationError: string) {
  try {
    const items = await fetchServerCart(userId);
    if (requestedUserId === userId) {
      publish({
        ...cartSnapshot,
        userId,
        items,
        isLoading: false,
        error: operationError,
      });
    }
  } catch (refreshError) {
    showCartError(
      `${operationError} Unable to refresh the cart: ${getErrorMessage(refreshError)}`,
    );
  }
}

async function connectCart(userId: string | null) {
  if (requestedUserId === userId) {
    if (connectionPromise) await connectionPromise;
    if (!cartSnapshot.error) return;
  }
  requestedUserId = userId;
  connectionPromise = null;
  clearQuantityTimers();

  if (!userId) {
    publish({ userId: null, items: [], isLoading: false, error: null });
    return;
  }

  const guestItems = cartSnapshot.userId === null ? cartSnapshot.items : [];
  publish({
    userId,
    items: cartSnapshot.userId === null ? guestItems : [],
    isLoading: true,
    error: null,
  });

  connectionPromise = (async () => {
    try {
      let items = await fetchServerCart(userId);
      if (guestItems.length > 0) {
        const merged = new Map(items.map((item) => [item.productId, item]));
        for (const guestItem of guestItems) {
          const current = merged.get(guestItem.productId);
          const requestedQuantity = (current?.quantity ?? 0) + guestItem.quantity;
          const maxQuantity = current?.product?.stock ?? guestItem.product?.stock;
          const quantity =
            maxQuantity === undefined
              ? requestedQuantity
              : Math.min(requestedQuantity, maxQuantity);
          if (quantity > 0) {
            merged.set(guestItem.productId, {
              productId: guestItem.productId,
              quantity,
              product: current?.product ?? guestItem.product,
            });
          }
        }

        const mergedItems = [...merged.values()].filter((item) => item.quantity > 0);
        const { error } =
          mergedItems.length === 0
            ? { error: null }
            : await supabase.from('cart_items').upsert(
                mergedItems.map((item) => ({
            user_id: userId,
            product_id: item.productId,
            quantity: item.quantity,
          })),
          { onConflict: 'user_id,product_id' },
              );
        if (error) throw error;
        items = await fetchServerCart(userId);
      }

      if (requestedUserId === userId) {
        publish({ userId, items, isLoading: false, error: null });
      }
    } catch (error) {
      if (requestedUserId === userId) {
        publish({
          ...cartSnapshot,
          isLoading: false,
          error: getErrorMessage(error),
        });
      }
    } finally {
      if (requestedUserId === userId) connectionPromise = null;
    }
  })();
  await connectionPromise;
}

function getErrorMessage(error: unknown) {
  const details =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : null;
  const code = typeof details?.code === 'string' ? details.code : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof details?.message === 'string'
        ? details.message
        : '';

  if (code === '23503' && message.includes('cart_items_product_id_fkey')) {
    return 'This product is not linked to the active shop catalog. Refresh the storefront; if it continues, rerun the updated orders migration in Supabase.';
  }
  return message || 'Unable to update your cart. Please try again.';
}

function showCartError(message: string) {
  publish({ ...cartSnapshot, error: message });
}

async function persistQuantity(userId: string, productId: string, quantity: number) {
  const { error } = await supabase
    .from('cart_items')
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('product_id', productId);
  if (error) {
    await restoreCartAfterError(userId, getErrorMessage(error));
  }
}

function scheduleQuantityUpdate(userId: string, productId: string, quantity: number) {
  cancelQuantityTimer(productId);
  const timer = setTimeout(() => {
    quantityTimers.delete(productId);
    void persistQuantity(userId, productId, quantity);
  }, 350);
  quantityTimers.set(productId, timer);
}

async function addItem(product: StoreProduct): Promise<boolean> {
  if (cartSnapshot.isLoading) {
    await connectionPromise;
  }
  if (cartSnapshot.isLoading) {
    showCartError('Your cart is still syncing. Please try adding this item again.');
    return false;
  }
  const userId = requestedUserId;
  if (userId) {
    const { data: currentProduct, error: productError } = await supabase
      .from('shop_products')
      .select('id,shop_id,is_published,is_archived')
      .eq('id', product.id)
      .maybeSingle();
    if (productError) {
      showCartError(getErrorMessage(productError));
      return false;
    }
    if (
      !currentProduct ||
      !currentProduct.is_published ||
      currentProduct.is_archived ||
      (product.shopId && currentProduct.shop_id !== product.shopId)
    ) {
      showCartError('This product is no longer available from its shop. Refresh the storefront.');
      return false;
    }
  }

  const existing = cartSnapshot.items.find((item) => item.productId === product.id);
  const nextQuantity = (existing?.quantity ?? 0) + 1;
  if (product.stock !== undefined && nextQuantity > product.stock) {
    showCartError('You have added all available stock to your cart.');
    return false;
  }

  publish({
    ...cartSnapshot,
    error: null,
    items: existing
      ? cartSnapshot.items.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: nextQuantity, product }
            : item,
        )
      : [...cartSnapshot.items, { productId: product.id, quantity: 1, product }],
  });

  if (!userId) return true;
  const { error } = await supabase.from('cart_items').upsert(
    { user_id: userId, product_id: product.id, quantity: nextQuantity },
    { onConflict: 'user_id,product_id' },
  );
  if (error) {
    await restoreCartAfterError(userId, getErrorMessage(error));
    return false;
  }

  try {
    const savedItems = await fetchServerCart(userId);
    if (requestedUserId !== userId) return false;
    publish({
      ...cartSnapshot,
      userId,
      items: savedItems,
      isLoading: false,
      error: null,
    });
    const savedItem = savedItems.find((item) => item.productId === product.id);
    if (!savedItem?.product) {
      showCartError(
        'The item was saved, but it is not visible in your cart. Check that the product and shop are still published.',
      );
      return false;
    }
    return true;
  } catch (verificationError) {
    showCartError(
      `The item may have been saved, but the cart could not be refreshed: ${getErrorMessage(verificationError)}`,
    );
    return false;
  }
}

function setItemQuantity(productId: string, requestedQuantity: number) {
  const item = cartSnapshot.items.find((line) => line.productId === productId);
  if (!item) return;
  if (requestedQuantity <= 0) {
    void removeItem(productId);
    return;
  }
  if (item.product?.stock !== undefined && requestedQuantity > item.product.stock) {
    showCartError(`Only ${item.product.stock} item(s) are currently available.`);
    return;
  }

  const userId = requestedUserId;
  publish({
    ...cartSnapshot,
    error: null,
    items: cartSnapshot.items.map((line) =>
      line.productId === productId ? { ...line, quantity: requestedQuantity } : line,
    ),
  });
  if (userId) scheduleQuantityUpdate(userId, productId, requestedQuantity);
}

async function removeItem(productId: string) {
  cancelQuantityTimer(productId);
  publish({
    ...cartSnapshot,
    error: null,
    items: cartSnapshot.items.filter((item) => item.productId !== productId),
  });
  const userId = requestedUserId;
  if (!userId) return;
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId);
  if (error) {
    await restoreCartAfterError(userId, getErrorMessage(error));
  }
}

export async function clearCart() {
  clearQuantityTimers();
  const userId = requestedUserId;
  publish({ ...cartSnapshot, items: [], error: null });
  if (!userId) return;
  const { error } = await supabase.from('cart_items').delete().eq('user_id', userId);
  if (error) {
    showCartError(getErrorMessage(error));
    await reloadCart(userId);
    throw error;
  }
}

export function useCart() {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void connectCart(user?.id ?? null);
  }, [user?.id]);

  const count = snapshot.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = snapshot.items.reduce(
    (sum, item) => sum + (item.product?.price ?? 0) * item.quantity,
    0,
  );

  return {
    ...snapshot,
    count,
    subtotal,
    addItem,
    setItemQuantity,
    removeItem,
    reload: () => {
      const userId = requestedUserId;
      return userId ? reloadCart(userId) : Promise.resolve();
    },
  };
}
