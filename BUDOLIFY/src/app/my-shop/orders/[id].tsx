import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  formatPrice,
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

export default function ShopOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [courier, setCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const current = await getOrder(id);
      setOrder(current);
      setCourier(current.courier ?? '');
      setTrackingNumber(current.tracking_number ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load this order.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(loadOrder);
  }, [loadOrder]);

  const advanceOrder = async (newStatus: OrderStatus) => {
    if (!order || isUpdating) return;
    setIsUpdating(true);
    setErrorMessage(null);
    try {
      await updateOrderStatus({
        orderId: order.id,
        newStatus,
        courier: newStatus === 'shipped' ? courier.trim() : undefined,
        trackingNumber: newStatus === 'shipped' ? trackingNumber.trim() : undefined,
      });
      await loadOrder();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update this order.');
    } finally {
      setIsUpdating(false);
    }
  };

  const nextStatus: OrderStatus | null =
    order?.status === 'placed'
      ? 'confirmed'
      : order?.status === 'confirmed'
        ? 'packed'
        : order?.status === 'packed'
          ? 'shipped'
          : null;
  const nextLabel =
    nextStatus === 'confirmed'
      ? 'Confirm order'
      : nextStatus === 'packed'
        ? 'Mark as packed'
        : nextStatus === 'shipped'
          ? 'Add tracking & ship'
          : '';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.page}>
        <View style={styles.content}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="link">
            <Text style={styles.back}>← ORDERS</Text>
          </Pressable>
          <Text style={styles.eyebrow}>SELLER CENTER</Text>
          <Text style={styles.title}>Order details.</Text>
          {errorMessage ? (
            <Text style={orderStyles.error} accessibilityRole="alert">{errorMessage}</Text>
          ) : null}
          {isLoading ? (
            <View style={styles.state}>
              <ActivityIndicator color={orderColors.green} />
              <Text style={orderStyles.muted}>Loading order details…</Text>
            </View>
          ) : order ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled">
              <View style={orderStyles.card}>
                <View style={orderStyles.row}>
                  <Text style={orderStyles.sectionTitle}>Order #{order.id.slice(0, 8).toUpperCase()}</Text>
                  <OrderStatusPill status={order.status} />
                </View>
                <Text style={orderStyles.muted}>
                  Placed {new Date(order.created_at).toLocaleString('en-PH')}
                </Text>
                <View style={orderStyles.row}>
                  <Text style={orderStyles.muted}>
                    Order total · {order.payment_method === 'cod' ? 'COD' : `Online (${order.payment_status})`}
                  </Text>
                  <Text style={styles.total}>{formatPrice(order.total)}</Text>
                </View>
              </View>

              <View style={orderStyles.card}>
                <Text style={orderStyles.sectionTitle}>Buyer and delivery</Text>
                <Text style={styles.buyerName}>{order.shipping_address.full_name}</Text>
                <Text style={orderStyles.muted}>{order.shipping_address.phone}</Text>
                <Text style={orderStyles.muted}>
                  {order.shipping_address.line1}
                  {order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ''}
                  {`, ${order.shipping_address.city}, ${order.shipping_address.province} ${order.shipping_address.postal_code}`}
                </Text>
                <Text style={styles.privacyNote}>
                  This buyer information is visible only to the shop fulfilling this order.
                </Text>
                {order.buyer_note ? (
                  <View style={styles.noteBox}>
                    <Text style={orderStyles.label}>Buyer note</Text>
                    <Text style={orderStyles.muted}>{order.buyer_note}</Text>
                  </View>
                ) : null}
              </View>

              <View style={orderStyles.card}>
                <Text style={orderStyles.sectionTitle}>Items to fulfill</Text>
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
                        <Text style={styles.buyerName}>{item.product_name}</Text>
                        <Text style={orderStyles.muted}>
                          {item.quantity} × {formatPrice(item.unit_price)}
                        </Text>
                      </View>
                      <Text style={styles.lineTotal}>{formatPrice(item.line_total)}</Text>
                    </View>
                  );
                })}
              </View>

              {order.status === 'packed' ? (
                <View style={orderStyles.card}>
                  <Text style={orderStyles.sectionTitle}>Shipment details</Text>
                  <View style={styles.field}>
                    <Text style={orderStyles.label}>Courier</Text>
                    <TextInput
                      style={orderStyles.input}
                      value={courier}
                      onChangeText={setCourier}
                      placeholder="e.g. J&T Express"
                      placeholderTextColor={orderColors.muted}
                      maxLength={100}
                      accessibilityLabel="Courier name"
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={orderStyles.label}>Tracking number</Text>
                    <TextInput
                      style={orderStyles.input}
                      value={trackingNumber}
                      onChangeText={setTrackingNumber}
                      placeholder="Enter tracking number"
                      placeholderTextColor={orderColors.muted}
                      maxLength={160}
                      accessibilityLabel="Tracking number"
                    />
                  </View>
                  <Text style={orderStyles.muted}>
                    Both fields are required before the order can be marked shipped.
                  </Text>
                </View>
              ) : null}

              {nextStatus ? (
                <Pressable
                  style={[
                    orderStyles.primaryButton,
                    (isUpdating ||
                      (nextStatus === 'shipped' &&
                        (!courier.trim() || !trackingNumber.trim()))) &&
                      orderStyles.primaryButtonDisabled,
                  ]}
                  onPress={() => void advanceOrder(nextStatus)}
                  disabled={
                    isUpdating ||
                    (nextStatus === 'shipped' &&
                      (!courier.trim() || !trackingNumber.trim()))
                  }
                  accessibilityRole="button">
                  <Text style={orderStyles.primaryButtonText}>
                    {isUpdating ? 'Updating…' : nextLabel}
                  </Text>
                </Pressable>
              ) : null}
              {order.status === 'delivered' || order.status === 'completed' ? (
                <Text style={orderStyles.muted}>
                  {order.status === 'completed'
                    ? 'This order is complete.'
                    : 'The buyer has confirmed delivery.'}
                </Text>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: orderColors.background,
  },
  page: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 920,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 24,
    gap: 12,
    flex: 1,
  },
  back: {
    color: orderColors.green,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 20,
    backgroundColor: orderStyles.card.backgroundColor,
  },
  eyebrow: {
    color: orderColors.coral,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  title: {
    color: orderColors.green,
    fontFamily: 'Georgia',
    fontSize: 32,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 24,
  },
  state: {
    alignItems: 'center',
    padding: 38,
    gap: 12,
  },
  total: {
    color: orderColors.green,
    fontSize: 17,
    fontWeight: '900',
  },
  buyerName: {
    color: orderColors.green,
    fontSize: 14,
    fontWeight: '800',
  },
  privacyNote: {
    color: orderColors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  noteBox: {
    gap: 5,
    padding: 11,
    borderRadius: 4,
    backgroundColor: '#f1f3ea',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
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
  lineTotal: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '800',
  },
  field: {
    gap: 5,
  },
});
