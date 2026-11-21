import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  formatPrice,
  OrderStatusPill,
  orderColors,
  orderStyles,
} from '@/components/orders/order-ui';
import { useAuth } from '@/lib/auth-context';
import { listShopOrders, type OrderRecord, type OrderStatus } from '@/lib/orders';
import { supabase } from '@/lib/supabase';

const filters: { label: string; value: OrderStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'placed' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Packed', value: 'packed' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Delivered', value: 'delivered' },
];

export default function ShopOrdersScreen() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [shopId, setShopId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState<OrderStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadShopOrders = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { data: shop, error: shopError } = await supabase
        .from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (shopError) throw shopError;
      if (!shop) {
        setShopId(null);
        setOrders([]);
        return;
      }
      setShopId(shop.id);
      setOrders(await listShopOrders(shop.id, activeFilter === 'all' ? undefined : activeFilter));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load shop orders.');
    } finally {
      setIsLoading(false);
    }
  }, [activeFilter, user]);

  useEffect(() => {
    if (!isAuthLoading && !user) router.replace('/sign-in');
  }, [isAuthLoading, user]);

  useEffect(() => {
    void Promise.resolve().then(loadShopOrders);
  }, [loadShopOrders]);

  const newOrderCount = useMemo(
    () => orders.filter((order) => order.status === 'placed').length,
    [orders],
  );

  if (isAuthLoading || !user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator color={orderColors.green} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace('/my-shop')}
            accessibilityRole="link">
            <Text style={styles.back}>← MY SHOP</Text>
          </Pressable>
          <Text style={styles.eyebrow}>SELLER CENTER</Text>
          <Text style={styles.title}>Shop orders.</Text>
          <Text style={orderStyles.muted}>
            Review incoming orders and keep each buyer up to date.
          </Text>
          {newOrderCount > 0 ? (
            <Text style={styles.newBadge}>{newOrderCount} new order(s) need attention</Text>
          ) : null}
        </View>

        {!isLoading && !errorMessage && !shopId ? (
          <View style={orderStyles.card}>
            <Text style={orderStyles.sectionTitle}>Create your shop first.</Text>
            <Text style={orderStyles.muted}>Your order inbox will appear once your shop is set up.</Text>
            <Pressable
              style={orderStyles.primaryButton}
              onPress={() => router.replace('/my-shop')}
              accessibilityRole="button">
              <Text style={orderStyles.primaryButtonText}>Go to My Shop</Text>
            </Pressable>
          </View>
        ) : null}

        {shopId ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}>
            {filters.map((filter) => (
              <Pressable
                key={filter.value}
                style={[styles.filterChip, activeFilter === filter.value && styles.filterSelected]}
                onPress={() => setActiveFilter(filter.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: activeFilter === filter.value }}>
                <Text style={[styles.filterText, activeFilter === filter.value && styles.filterTextSelected]}>
                  {filter.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {errorMessage ? (
          <View style={orderStyles.card}>
            <Text style={orderStyles.error} accessibilityRole="alert">{errorMessage}</Text>
            <Pressable
              style={orderStyles.secondaryButton}
              onPress={() => void loadShopOrders()}
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
        ) : shopId && orders.length === 0 && !errorMessage ? (
          <View style={orderStyles.card}>
            <Text style={orderStyles.sectionTitle}>No orders in this view.</Text>
            <Text style={orderStyles.muted}>New orders from shoppers will show up here.</Text>
          </View>
        ) : (
          orders.map((order) => (
            <Pressable
              key={order.id}
              style={orderStyles.card}
              onPress={() =>
                router.push({ pathname: '/my-shop/orders/[id]', params: { id: order.id } })
              }
              accessibilityRole="link"
              accessibilityLabel={`Manage order for ${order.shipping_address.full_name}`}>
              <View style={orderStyles.row}>
                <View style={styles.orderCopy}>
                  <Text style={orderStyles.sectionTitle}>{order.shipping_address.full_name}</Text>
                  <Text style={orderStyles.muted}>
                    {new Date(order.created_at).toLocaleDateString('en-PH')}
                    {' · '}{order.order_items?.reduce((count, item) => count + item.quantity, 0) ?? 0} item(s)
                  </Text>
                </View>
                <OrderStatusPill status={order.status} />
              </View>
              <View style={orderStyles.row}>
                <Text style={orderStyles.muted}>Order total</Text>
                <Text style={styles.total}>{formatPrice(order.total)}</Text>
              </View>
              <Text style={styles.openLink}>Open order →</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: orderColors.background,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 920,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 42,
    gap: 14,
  },
  top: {
    gap: 9,
    marginBottom: 8,
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
    backgroundColor: orderColors.card,
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
    fontSize: 34,
    fontWeight: '700',
  },
  newBadge: {
    alignSelf: 'flex-start',
    color: orderColors.green,
    backgroundColor: orderColors.lime,
    borderRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '900',
  },
  filterList: {
    gap: 8,
    paddingBottom: 3,
  },
  filterChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: orderColors.border,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  filterSelected: {
    backgroundColor: orderColors.green,
    borderColor: orderColors.green,
  },
  filterText: {
    color: orderColors.green,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextSelected: {
    color: '#fffefa',
  },
  state: {
    alignItems: 'center',
    padding: 38,
    gap: 12,
  },
  orderCopy: {
    flex: 1,
    gap: 4,
  },
  total: {
    color: orderColors.green,
    fontSize: 15,
    fontWeight: '900',
  },
  openLink: {
    alignSelf: 'flex-start',
    color: orderColors.green,
    fontSize: 12,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: '#cfd8ca',
    borderRadius: 19,
    backgroundColor: '#f5f7f0',
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
});
