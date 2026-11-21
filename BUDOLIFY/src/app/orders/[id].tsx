import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  formatPrice,
  OrderScreenFrame,
  OrderStatusPill,
  orderColors,
  orderStyles,
} from '@/components/orders/order-ui';
import { getShopImageUrl } from '@/lib/shop-images';
import {
  getOrder,
  updateOrderStatus,
  type OrderRecord,
  type OrderStatus,
} from '@/lib/orders';

const cancellableStatuses: OrderStatus[] = ['placed', 'confirmed', 'packed'];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setOrder(await getOrder(id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load this order.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(loadOrder);
  }, [loadOrder]);

  const events = useMemo(
    () =>
      [...(order?.order_events ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [order?.order_events],
  );
  const address = order?.shipping_address;

  const updateStatus = async (status: OrderStatus) => {
    if (!order || isUpdating) return;
    setIsUpdating(true);
    setErrorMessage(null);
    try {
      await updateOrderStatus({ orderId: order.id, newStatus: status });
      await loadOrder();
      setConfirmCancel(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update this order.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <OrderScreenFrame
      eyebrow="ORDER DETAILS"
      title={order ? `From ${order.shops?.name ?? 'your shop'}` : 'Your order'}
      description={order ? `Placed ${new Date(order.created_at).toLocaleDateString('en-PH')}` : undefined}>
      {errorMessage ? (
        <View style={orderStyles.card}>
          <Text style={orderStyles.error} accessibilityRole="alert">{errorMessage}</Text>
          {!order ? (
            <Pressable
              style={orderStyles.secondaryButton}
              onPress={() => void loadOrder()}
              accessibilityRole="button">
              <Text style={orderStyles.secondaryButtonText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator color={orderColors.green} />
          <Text style={orderStyles.muted}>Loading order details…</Text>
        </View>
      ) : order ? (
        <>
          <View style={orderStyles.card}>
            <View style={orderStyles.row}>
              <Text style={orderStyles.sectionTitle}>Order status</Text>
              <OrderStatusPill status={order.status} />
            </View>
            <Text style={orderStyles.muted}>Order #{order.id.slice(0, 8).toUpperCase()}</Text>
            {order.status === 'shipped' || order.status === 'delivered' ? (
              <View style={styles.trackingBox}>
                <Text style={orderStyles.label}>Tracking</Text>
                <Text style={styles.trackingValue}>
                  {order.courier ?? 'Courier'} · {order.tracking_number ?? 'Tracking unavailable'}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={orderStyles.card}>
            <Text style={orderStyles.sectionTitle}>Your items</Text>
            {(order.order_items ?? []).map((item) => {
              const imageUrl = getShopImageUrl(item.image_path);
              return (
                <View key={item.id} style={styles.itemRow}>
                  {imageUrl ? (
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.itemImage}
                      resizeMode="cover"
                      accessibilityLabel={item.product_name}
                    />
                  ) : (
                    <View style={[styles.itemImage, styles.imageFallback]}>
                      <Text style={styles.fallbackText}>FIND</Text>
                    </View>
                  )}
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>{item.product_name}</Text>
                    <Text style={orderStyles.muted}>
                      {item.quantity} × {formatPrice(item.unit_price)}
                    </Text>
                  </View>
                  <Text style={styles.lineTotal}>{formatPrice(item.line_total)}</Text>
                </View>
              );
            })}
            <View style={orderStyles.divider} />
            <View style={orderStyles.row}>
              <Text style={orderStyles.muted}>Subtotal</Text>
              <Text style={styles.price}>{formatPrice(order.subtotal)}</Text>
            </View>
            <View style={orderStyles.row}>
              <Text style={orderStyles.muted}>Delivery</Text>
              <Text style={styles.price}>{formatPrice(order.shipping_fee)}</Text>
            </View>
            <View style={orderStyles.row}>
              <Text style={styles.totalLabel}>Total · Cash on Delivery</Text>
              <Text style={styles.total}>{formatPrice(order.total)}</Text>
            </View>
            {order.buyer_note ? (
              <Text style={orderStyles.muted}>Note: {order.buyer_note}</Text>
            ) : null}
          </View>

          <View style={orderStyles.card}>
            <Text style={orderStyles.sectionTitle}>Deliver to</Text>
            <Text style={styles.itemName}>{address?.full_name}</Text>
            <Text style={orderStyles.muted}>{address?.phone}</Text>
            <Text style={orderStyles.muted}>
              {address?.line1}
              {address?.line2 ? `, ${address.line2}` : ''}
              {address ? `, ${address.city}, ${address.province} ${address.postal_code}` : ''}
            </Text>
          </View>

          <View style={orderStyles.card}>
            <Text style={orderStyles.sectionTitle}>Order timeline</Text>
            {events.map((event, index) => (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.timeline}>
                  <View style={[styles.timelineDot, index === events.length - 1 && styles.currentDot]} />
                  {index < events.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.eventCopy}>
                  <Text style={styles.eventStatus}>{event.to_status.replace(/_/g, ' ')}</Text>
                  <Text style={orderStyles.muted}>
                    {new Date(event.created_at).toLocaleString('en-PH')}
                  </Text>
                  {event.note ? <Text style={orderStyles.muted}>{event.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>

          {order.status === 'shipped' ? (
            <Pressable
              style={[orderStyles.primaryButton, isUpdating && orderStyles.primaryButtonDisabled]}
              onPress={() => void updateStatus('delivered')}
              disabled={isUpdating}
              accessibilityRole="button">
              <Text style={orderStyles.primaryButtonText}>
                {isUpdating ? 'Updating…' : 'Confirm received'}
              </Text>
            </Pressable>
          ) : null}
          {order.status === 'delivered' ? (
            <Pressable
              style={[orderStyles.primaryButton, isUpdating && orderStyles.primaryButtonDisabled]}
              onPress={() => void updateStatus('completed')}
              disabled={isUpdating}
              accessibilityRole="button">
              <Text style={orderStyles.primaryButtonText}>
                {isUpdating ? 'Updating…' : 'Complete order'}
              </Text>
            </Pressable>
          ) : null}
          {cancellableStatuses.includes(order.status) ? (
            <Pressable
              style={styles.cancelButton}
              onPress={() => setConfirmCancel(true)}
              accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel order</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      <Pressable
        style={styles.historyLink}
        onPress={() => router.replace('/orders')}
        accessibilityRole="link">
        <Text style={styles.historyLinkText}>View all orders</Text>
      </Pressable>

      <Modal
        visible={confirmCancel}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmCancel(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={orderStyles.sectionTitle}>Cancel this order?</Text>
            <Text style={orderStyles.muted}>
              This will release the reserved stock and cannot be undone.
            </Text>
            <Pressable
              style={[orderStyles.primaryButton, isUpdating && orderStyles.primaryButtonDisabled]}
              onPress={() => void updateStatus('cancelled')}
              disabled={isUpdating}
              accessibilityRole="button">
              <Text style={orderStyles.primaryButtonText}>
                {isUpdating ? 'Cancelling…' : 'Yes, cancel order'}
              </Text>
            </Pressable>
            <Pressable
              style={orderStyles.secondaryButton}
              onPress={() => setConfirmCancel(false)}
              accessibilityRole="button">
              <Text style={orderStyles.secondaryButtonText}>Keep my order</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </OrderScreenFrame>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: 'center',
    padding: 38,
    gap: 12,
  },
  trackingBox: {
    gap: 5,
    padding: 12,
    backgroundColor: '#f1f3ea',
    borderRadius: 5,
  },
  trackingValue: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '700',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemImage: {
    width: 58,
    height: 62,
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
  itemCopy: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '800',
  },
  lineTotal: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '800',
  },
  price: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '700',
  },
  totalLabel: {
    color: orderColors.green,
    fontSize: 14,
    fontWeight: '900',
  },
  total: {
    color: orderColors.green,
    fontSize: 18,
    fontWeight: '900',
  },
  eventRow: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
  },
  timeline: {
    width: 14,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#b8bcad',
    marginTop: 4,
  },
  currentDot: {
    backgroundColor: orderColors.coral,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: orderColors.border,
    marginVertical: 3,
  },
  eventCopy: {
    flex: 1,
    gap: 3,
  },
  eventStatus: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  cancelButton: {
    alignSelf: 'center',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#efd0c8',
    borderRadius: 22,
    backgroundColor: '#fff8f5',
  },
  cancelText: {
    color: orderColors.coral,
    fontSize: 13,
    fontWeight: '800',
  },
  historyLink: {
    alignSelf: 'flex-start',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 22,
    backgroundColor: orderColors.card,
  },
  historyLinkText: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 35, 29, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: orderColors.background,
    borderRadius: 8,
    padding: 22,
    gap: 14,
  },
});
