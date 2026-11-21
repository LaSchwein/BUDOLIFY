import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { listMyOrders, type OrderRecord } from '@/lib/orders';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setOrders(await listMyOrders());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load your orders.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadOrders);
  }, [loadOrders]);

  return (
    <OrderScreenFrame
      eyebrow="YOUR BUDOLIFY"
      title="Order history"
      description="Every good find, all in one place.">
      {errorMessage ? (
        <View style={orderStyles.card}>
          <Text style={orderStyles.error} accessibilityRole="alert">{errorMessage}</Text>
          <Pressable
            style={orderStyles.secondaryButton}
            onPress={() => void loadOrders()}
            accessibilityRole="button">
            <Text style={orderStyles.secondaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator color={orderColors.green} />
          <Text style={orderStyles.muted}>Loading your orders…</Text>
        </View>
      ) : orders.length === 0 && !errorMessage ? (
        <View style={orderStyles.card}>
          <Text style={orderStyles.sectionTitle}>Your next favorite is out there.</Text>
          <Text style={orderStyles.muted}>Orders you place will appear here.</Text>
          <Pressable
            style={orderStyles.primaryButton}
            onPress={() => router.replace('/')}
            accessibilityRole="button">
            <Text style={orderStyles.primaryButtonText}>Explore the edit</Text>
          </Pressable>
        </View>
      ) : (
        orders.map((order) => {
          const itemCount = (order.order_items ?? []).reduce(
            (total, item) => total + item.quantity,
            0,
          );
          return (
            <Pressable
              key={order.id}
              style={orderStyles.card}
              onPress={() =>
                router.push({ pathname: '/orders/[id]', params: { id: order.id } })
              }
              accessibilityRole="link"
              accessibilityLabel={`View order from ${order.shops?.name ?? 'shop'}, ${order.status}`}>
              <View style={orderStyles.row}>
                <View style={styles.orderInfo}>
                  <Text style={styles.shopName}>{order.shops?.name ?? 'Independent shop'}</Text>
                  <Text style={orderStyles.muted}>
                    {new Date(order.created_at).toLocaleDateString('en-PH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {' · '}{itemCount} item(s)
                  </Text>
                </View>
                <OrderStatusPill status={order.status} />
              </View>
              <View style={orderStyles.divider} />
              <View style={orderStyles.row}>
                <Text style={orderStyles.muted}>Order total</Text>
                <Text style={styles.total}>{formatPrice(order.total)}</Text>
              </View>
              <View style={styles.detailsButton}>
                <Text style={styles.detailsLink}>View order details →</Text>
              </View>
            </Pressable>
          );
        })
      )}
      <Pressable
        style={styles.addressButton}
        onPress={() => router.push('/addresses')}
        accessibilityRole="link">
        <Text style={styles.addressLinkText}>Manage saved addresses</Text>
      </Pressable>
    </OrderScreenFrame>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: 'center',
    padding: 38,
    gap: 12,
  },
  orderInfo: {
    flex: 1,
    gap: 5,
  },
  shopName: {
    color: orderColors.green,
    fontSize: 16,
    fontWeight: '900',
  },
  total: {
    color: orderColors.green,
    fontSize: 16,
    fontWeight: '900',
  },
  detailsLink: {
    color: orderColors.green,
    fontSize: 12,
    fontWeight: '800',
  },
  detailsButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#cfd8ca',
    borderRadius: 20,
    backgroundColor: '#f5f7f0',
    marginTop: 3,
  },
  addressButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 22,
    backgroundColor: orderColors.card,
  },
  addressLinkText: {
    color: orderColors.green,
    fontSize: 12,
    fontWeight: '800',
  },
});
