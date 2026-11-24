import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  formatPrice,
  OrderScreenFrame,
  orderColors,
  orderStyles,
} from '@/components/orders/order-ui';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart';

const FREE_SHIPPING_THRESHOLD = 1500;
const FLAT_SHIPPING_FEE = 99;

export default function CartScreen() {
  const { user } = useAuth();
  const cart = useCart();
  const cartItems = cart.items;
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string> | null>(null);
  const previousProductIds = useRef(new Set<string>());

  useEffect(() => {
    if (cart.isLoading) return;
    const currentProductIds = new Set(cartItems.map((item) => item.productId));
    setSelectedProductIds((current) => {
      if (!current) return new Set(currentProductIds);
      const next = new Set([...current].filter((id) => currentProductIds.has(id)));
      for (const id of currentProductIds) {
        if (!previousProductIds.current.has(id)) next.add(id);
      }
      return next;
    });
    previousProductIds.current = currentProductIds;
  }, [cart.isLoading, cartItems]);

  const selectedIds = useMemo(
    () => selectedProductIds ?? new Set(cartItems.map((item) => item.productId)),
    [cartItems, selectedProductIds],
  );
  const selectedItems = useMemo(
    () => cartItems.filter((item) => selectedIds.has(item.productId)),
    [cartItems, selectedIds],
  );
  const allSelected = cartItems.length > 0 && selectedItems.length === cartItems.length;
  const shopGroups = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; subtotal: number; items: typeof cartItems }
    >();
    for (const item of cartItems) {
      const key = item.product?.shopId ?? 'unavailable';
      const group = groups.get(key) ?? {
        name: item.product?.shopName ?? 'Unavailable item',
        subtotal: 0,
        items: [],
      };
      group.items.push(item);
      if (selectedIds.has(item.productId)) {
        group.subtotal += (item.product?.price ?? 0) * item.quantity;
      }
      groups.set(key, group);
    }
    return [...groups.entries()];
  }, [cartItems, selectedIds]);
  const selectedSubtotal = selectedItems.reduce(
    (total, item) => total + (item.product?.price ?? 0) * item.quantity,
    0,
  );
  const shippingTotal = shopGroups.reduce(
    (total, [, group]) =>
      total + (group.subtotal === 0 || group.subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE),
    0,
  );
  const hasUnavailableItems = selectedItems.some(
    (item) =>
      !item.product ||
      (item.product.stock !== undefined && item.quantity > item.product.stock),
  );

  return (
    <OrderScreenFrame
      eyebrow="YOUR CONSIDERED FINDS"
      title="Your cart"
      description="Your cart is saved to your account when you sign in. Delivery is calculated separately for each shop.">
      {cart.error ? (
        <Text style={orderStyles.error} accessibilityRole="alert">
          {cart.error}
        </Text>
      ) : null}
      {cart.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={orderColors.green} />
          <Text style={orderStyles.muted}>Loading your cart…</Text>
        </View>
      ) : cart.items.length === 0 ? (
        <View style={[orderStyles.card, styles.empty]}>
          <Text style={orderStyles.sectionTitle}>Nothing in your cart just yet.</Text>
          <Text style={orderStyles.muted}>
            Find something lovely from an independent Filipino shop.
          </Text>
          <Pressable
            style={orderStyles.primaryButton}
            onPress={() => router.replace('/')}
            accessibilityRole="button">
            <Text style={orderStyles.primaryButtonText}>Explore the edit</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable
            style={styles.selectAllRow}
            onPress={() => {
              setSelectedProductIds(
                allSelected ? new Set() : new Set(cartItems.map((item) => item.productId)),
              );
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allSelected }}>
            <View style={[styles.checkbox, allSelected && styles.checkboxChecked]}>
              {allSelected ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={orderStyles.muted}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
          </Pressable>
          {shopGroups.map(([shopId, group]) => (
            <View key={shopId} style={styles.shopGroup}>
              <View style={styles.shopHeading}>
                <Text style={styles.shopEyebrow}>FROM THIS SHOP</Text>
                <Text style={orderStyles.sectionTitle}>{group.name}</Text>
              </View>
              {group.items.map((item) => {
                const product = item.product;
                const isSelected = selectedIds.has(item.productId);
                return (
                  <View key={item.productId} style={[orderStyles.card, styles.itemCard]}>
                    <Pressable
                      style={styles.itemCheckboxButton}
                      onPress={() => {
                        setSelectedProductIds((current) => {
                          const next = new Set(current ?? cartItems.map((line) => line.productId));
                          if (next.has(item.productId)) next.delete(item.productId);
                          else next.add(item.productId);
                          return next;
                        });
                      }}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${isSelected ? 'Deselect' : 'Select'} ${product?.name ?? 'item'} for checkout`}
                      accessibilityState={{ checked: isSelected }}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                        {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                      </View>
                    </Pressable>
                    {product?.image ? (
                      <Image
                        source={{ uri: product.image }}
                        style={styles.productImage}
                        resizeMode="cover"
                        accessibilityLabel={product.name}
                      />
                    ) : (
                      <View style={[styles.productImage, styles.imageFallback]}>
                        <Text style={styles.fallbackText}>BUDOLIFY</Text>
                      </View>
                    )}
                    <View style={styles.itemDetails}>
                      <Text style={orderStyles.sectionTitle}>
                        {product?.name ?? 'This product is no longer available'}
                      </Text>
                      {product ? (
                        <>
                          <Text style={orderStyles.muted}>{formatPrice(product.price)} each</Text>
                          {product.stock !== undefined && item.quantity > product.stock ? (
                            <Text style={orderStyles.error}>
                              Only {product.stock} currently available. Update quantity to continue.
                            </Text>
                          ) : null}
                        </>
                      ) : (
                        <Text style={orderStyles.error}>
                          Remove this unavailable item to continue.
                        </Text>
                      )}
                      <View style={styles.quantityRow}>
                        <View style={styles.quantityControl}>
                          <Pressable
                            style={styles.stepButton}
                            onPress={() => cart.setItemQuantity(item.productId, item.quantity - 1)}
                            accessibilityRole="button"
                            accessibilityLabel={`Decrease ${product?.name ?? 'item'} quantity`}>
                            <Text style={styles.stepText}>−</Text>
                          </Pressable>
                          <Text style={styles.quantityValue}>{item.quantity}</Text>
                          <Pressable
                            style={styles.stepButton}
                            onPress={() => cart.setItemQuantity(item.productId, item.quantity + 1)}
                            disabled={product?.stock !== undefined && item.quantity >= product.stock}
                            accessibilityRole="button"
                            accessibilityLabel={`Increase ${product?.name ?? 'item'} quantity`}>
                            <Text style={styles.stepText}>+</Text>
                          </Pressable>
                        </View>
                        <Pressable
                          style={styles.removeButton}
                          onPress={() => void cart.removeItem(item.productId)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${product?.name ?? 'item'} from cart`}>
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.lineTotal}>
                      {formatPrice((product?.price ?? 0) * item.quantity)}
                    </Text>
                  </View>
                );
              })}
              {group.subtotal > 0 ? (
                <View style={styles.shippingRow}>
                  <Text style={orderStyles.muted}>
                    {group.subtotal >= FREE_SHIPPING_THRESHOLD
                      ? 'Free delivery'
                      : `Delivery · ${formatPrice(FLAT_SHIPPING_FEE)}`}
                  </Text>
                  <Text style={styles.shippingHint}>
                    {group.subtotal >= FREE_SHIPPING_THRESHOLD
                      ? 'Orders over ₱1,500'
                      : `Free over ${formatPrice(FREE_SHIPPING_THRESHOLD)}`}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
          <View style={[orderStyles.card, styles.summaryCard]}>
            <Text style={orderStyles.sectionTitle}>Order estimate</Text>
            <View style={orderStyles.row}>
              <Text style={orderStyles.muted}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatPrice(selectedSubtotal)}</Text>
            </View>
            <View style={orderStyles.row}>
              <Text style={orderStyles.muted}>Estimated delivery</Text>
              <Text style={styles.summaryValue}>{formatPrice(shippingTotal)}</Text>
            </View>
            <View style={orderStyles.divider} />
            <View style={orderStyles.row}>
              <Text style={styles.totalLabel}>Estimated total</Text>
              <Text style={styles.totalValue}>{formatPrice(selectedSubtotal + shippingTotal)}</Text>
            </View>
            <Text style={orderStyles.muted}>
              Final totals are calculated securely when you place your order.
            </Text>
            {!user ? (
              <Text style={styles.signInNote}>
                Sign in at checkout to save your order and delivery details.
              </Text>
            ) : null}
            <Pressable
              style={[
                orderStyles.primaryButton,
                (cart.isLoading || hasUnavailableItems || selectedItems.length === 0) &&
                  orderStyles.primaryButtonDisabled,
              ]}
              disabled={cart.isLoading || hasUnavailableItems || selectedItems.length === 0}
              onPress={() =>
                router.push(
                  user
                    ? {
                        pathname: '/checkout',
                          params: {
                            selected: selectedItems.map((item) => item.productId).join(','),
                          },
                      }
                    : { pathname: '/sign-in', params: { next: '/checkout' } },
                )
              }
              accessibilityRole="button">
              <Text style={orderStyles.primaryButtonText}>
                {user ? 'Continue to checkout' : 'Sign in to checkout'}
              </Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.continueShopping}
            onPress={() => router.replace('/')}
            accessibilityRole="link">
            <Text style={styles.continueShoppingText}>← Continue shopping</Text>
          </Pressable>
        </>
      )}
    </OrderScreenFrame>
  );
}

const styles = StyleSheet.create({
  centerState: {
    alignItems: 'center',
    padding: 38,
    gap: 12,
  },
  empty: {
    marginTop: 16,
  },
  selectAllRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
  },
  itemCheckboxButton: {
    minWidth: 30,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: orderColors.green,
    borderRadius: 4,
    backgroundColor: orderColors.card,
  },
  checkboxChecked: {
    backgroundColor: orderColors.green,
  },
  checkmark: {
    color: '#fffefa',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
  },
  shopGroup: {
    gap: 12,
    marginTop: 8,
  },
  shopHeading: {
    gap: 4,
  },
  shopEyebrow: {
    color: orderColors.coral,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  productImage: {
    width: 88,
    height: 96,
    borderRadius: 4,
    backgroundColor: '#eee8dd',
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: orderColors.muted,
    fontSize: 9,
    fontWeight: '800',
  },
  itemDetails: {
    flex: 1,
    minWidth: 140,
    gap: 6,
  },
  quantityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 4,
  },
  stepButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: orderColors.green,
    fontSize: 18,
    fontWeight: '600',
  },
  quantityValue: {
    minWidth: 24,
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  removeText: {
    color: '#a44738',
    fontSize: 11,
    fontWeight: '800',
  },
  removeButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#efd0c8',
    borderRadius: 18,
    backgroundColor: '#fff8f5',
    paddingHorizontal: 12,
  },
  lineTotal: {
    color: orderColors.green,
    fontSize: 14,
    fontWeight: '900',
  },
  shippingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  shippingHint: {
    color: orderColors.muted,
    fontSize: 11,
    textAlign: 'right',
  },
  summaryCard: {
    marginTop: 10,
  },
  summaryValue: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '700',
  },
  totalLabel: {
    color: orderColors.green,
    fontSize: 15,
    fontWeight: '900',
  },
  totalValue: {
    color: orderColors.green,
    fontSize: 18,
    fontWeight: '900',
  },
  signInNote: {
    color: orderColors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  continueShopping: {
    alignSelf: 'flex-start',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 22,
    backgroundColor: orderColors.card,
  },
  continueShoppingText: {
    color: orderColors.green,
    fontSize: 12,
    fontWeight: '800',
  },
});
