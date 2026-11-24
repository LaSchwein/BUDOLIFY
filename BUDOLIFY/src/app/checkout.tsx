import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
import {
  createMayaCheckout,
  listAddresses,
  placeOrder,
  saveAddress,
  type AddressDraft,
  type SavedAddress,
} from '@/lib/orders';

const FREE_SHIPPING_THRESHOLD = 1500;
const FLAT_SHIPPING_FEE = 99;

const emptyAddress: AddressDraft = {
  full_name: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  province: '',
  postal_code: '',
  is_default: false,
};

function addressLabel(address: SavedAddress) {
  return `${address.line1}${address.line2 ? `, ${address.line2}` : ''}, ${address.city}, ${address.province}`;
}

function createCheckoutRequestKey() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

export default function CheckoutScreen() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { selected } = useLocalSearchParams<{ selected?: string }>();
  const cart = useCart();
  const requestedItemIds = useMemo(
    () =>
      selected === undefined ? null : new Set(selected.split(',').filter(Boolean)),
    [selected],
  );
  const checkoutItems = useMemo(
    () =>
      requestedItemIds
        ? cart.items.filter((item) => requestedItemIds.has(item.productId))
        : cart.items,
    [cart.items, requestedItemIds],
  );
  const checkoutProductIds = useMemo(
    () => checkoutItems.map((item) => item.productId),
    [checkoutItems],
  );
  const checkoutSubtotal = checkoutItems.reduce(
    (total, item) => total + (item.product?.price ?? 0) * item.quantity,
    0,
  );
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [draft, setDraft] = useState<AddressDraft>(emptyAddress);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod');
  const [requestKey, setRequestKey] = useState(createCheckoutRequestKey);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submitLock = useRef(false);

  const shopGroups = useMemo(() => {
    const groups = new Map<string, { name: string; subtotal: number; count: number }>();
    for (const item of checkoutItems) {
      const key = item.product?.shopId ?? 'unavailable';
      const group = groups.get(key) ?? {
        name: item.product?.shopName ?? 'Unavailable item',
        subtotal: 0,
        count: 0,
      };
      group.subtotal += (item.product?.price ?? 0) * item.quantity;
      group.count += item.quantity;
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [checkoutItems]);
  const shippingTotal = shopGroups.reduce(
    (total, group) =>
      total + (group.subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE),
    0,
  );
  const canCheckout =
    !cart.isLoading &&
    checkoutItems.length > 0 &&
    checkoutItems.every(
      (item) =>
        item.product !== null &&
        (item.product.stock === undefined || item.quantity <= item.product.stock),
    );

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace({ pathname: '/sign-in', params: { next: '/checkout' } });
    }
  }, [isAuthLoading, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void listAddresses()
      .then((items) => {
        if (!active) return;
        setAddresses(items);
        setSelectedAddressId(items.find((address) => address.is_default)?.id ?? items[0]?.id ?? '');
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load your addresses.');
        }
      })
      .finally(() => {
        if (active) setIsLoadingAddresses(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const updateDraft = (key: keyof AddressDraft, value: string | boolean) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrorMessage(null);
  };

  const addAddress = async () => {
    if (isSavingAddress) return;
    setIsSavingAddress(true);
    setErrorMessage(null);
    try {
      const address = await saveAddress({
        ...draft,
        is_default: draft.is_default || addresses.length === 0,
      });
      setAddresses((current) => [address, ...current]);
      setSelectedAddressId(address.id);
      setDraft(emptyAddress);
      setIsAddingAddress(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save this address.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const submitOrder = async () => {
    if (submitLock.current || isSubmitting) return;
    if (!canCheckout) {
      setErrorMessage(
        checkoutItems.length === 0
          ? 'Select at least one item from your cart to continue.'
          : 'Remove unavailable items or update quantities before placing your order.',
      );
      return;
    }
    if (!selectedAddressId) {
      setErrorMessage('Choose or add a delivery address first.');
      return;
    }
    submitLock.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      if (paymentMethod === 'online') {
        const checkout = await createMayaCheckout({
          addressId: selectedAddressId,
          note: note.trim(),
          requestKey,
          selectedProductIds: checkoutProductIds,
        });
        if (Platform.OS === 'web') {
          window.location.assign(checkout.checkoutUrl);
          return;
        }
        await WebBrowser.openBrowserAsync(checkout.checkoutUrl);
      } else {
        const createdOrders = await placeOrder(
          selectedAddressId,
          'cod',
          note.trim(),
          checkoutProductIds,
        );
        if (createdOrders.length === 0) {
          throw new Error('The order was not created. Please try again.');
        }
      }
      await cart.reload();
      router.replace('/orders');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to place your order.';
      if (paymentMethod === 'online' && message.includes('returned to your cart')) {
        setRequestKey(createCheckoutRequestKey());
      }
      setErrorMessage(message);
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading || !user) {
    return (
      <OrderScreenFrame eyebrow="SECURE CHECKOUT" title="Checking your account…">
        <ActivityIndicator color={orderColors.green} />
      </OrderScreenFrame>
    );
  }

  return (
    <OrderScreenFrame
      eyebrow="SECURE CHECKOUT"
      title="Almost yours."
      description="Your delivery details and order total are protected by your account.">
      {errorMessage ? (
        <Text style={orderStyles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
      {!cart.isLoading && cart.items.length > 0 && checkoutItems.length === 0 ? (
        <Text style={orderStyles.error} accessibilityRole="alert">
          Those selected cart items are no longer available. Return to your cart and select items again.
        </Text>
      ) : null}
      {cart.isLoading || isLoadingAddresses ? (
        <View style={styles.loading}>
          <ActivityIndicator color={orderColors.green} />
          <Text style={orderStyles.muted}>Getting your checkout ready…</Text>
        </View>
      ) : (
        <>
          <View style={orderStyles.card}>
            <View style={orderStyles.row}>
              <Text style={orderStyles.sectionTitle}>Delivery address</Text>
              <Pressable
                style={styles.manageButton}
                onPress={() => router.push('/addresses')}
                accessibilityRole="link">
                <Text style={styles.manageLink}>Manage</Text>
              </Pressable>
            </View>
            {addresses.map((address) => (
              <Pressable
                key={address.id}
                style={[
                  styles.addressOption,
                  selectedAddressId === address.id && styles.addressSelected,
                ]}
                onPress={() => setSelectedAddressId(address.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedAddressId === address.id }}>
                <View style={styles.radio}>
                  {selectedAddressId === address.id ? <View style={styles.radioSelected} /> : null}
                </View>
                <View style={styles.addressCopy}>
                  <Text style={styles.addressName}>{address.full_name}</Text>
                  <Text style={orderStyles.muted}>{addressLabel(address)}</Text>
                  <Text style={orderStyles.muted}>{address.phone}</Text>
                </View>
                {address.is_default ? <Text style={styles.defaultTag}>DEFAULT</Text> : null}
              </Pressable>
            ))}
            {addresses.length === 0 && !isAddingAddress ? (
              <Text style={orderStyles.muted}>Add an address to continue.</Text>
            ) : null}
            {isAddingAddress ? (
              <View style={styles.addressForm}>
                <AddressField
                  label="Full name"
                  value={draft.full_name}
                  onChangeText={(value) => updateDraft('full_name', value)}
                />
                <AddressField
                  label="Mobile number"
                  value={draft.phone}
                  keyboardType="phone-pad"
                  onChangeText={(value) => updateDraft('phone', value)}
                />
                <AddressField
                  label="House number and street"
                  value={draft.line1}
                  onChangeText={(value) => updateDraft('line1', value)}
                />
                <AddressField
                  label="Unit / barangay (optional)"
                  value={draft.line2 ?? ''}
                  onChangeText={(value) => updateDraft('line2', value)}
                />
                <View style={styles.formPair}>
                  <AddressField
                    label="City"
                    value={draft.city}
                    onChangeText={(value) => updateDraft('city', value)}
                  />
                  <AddressField
                    label="Province"
                    value={draft.province}
                    onChangeText={(value) => updateDraft('province', value)}
                  />
                </View>
                <AddressField
                  label="Postal code (optional)"
                  value={draft.postal_code ?? ''}
                  keyboardType="number-pad"
                  onChangeText={(value) => updateDraft('postal_code', value)}
                />
                <Pressable
                  style={styles.defaultCheck}
                  onPress={() => updateDraft('is_default', !draft.is_default)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: draft.is_default }}>
                  <View style={[styles.checkbox, draft.is_default && styles.checkboxChecked]} />
                  <Text style={orderStyles.muted}>Make this my default address</Text>
                </Pressable>
                <Pressable
                  style={[orderStyles.primaryButton, isSavingAddress && orderStyles.primaryButtonDisabled]}
                  onPress={() => void addAddress()}
                  disabled={isSavingAddress}
                  accessibilityRole="button">
                  <Text style={orderStyles.primaryButtonText}>
                    {isSavingAddress ? 'Saving…' : 'Save address'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.cancelAdd}
                  onPress={() => setIsAddingAddress(false)}
                  accessibilityRole="button">
                  <Text style={styles.manageLink}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={orderStyles.secondaryButton}
                accessibilityRole="button"
                onPress={() => {
                  setDraft({ ...emptyAddress, is_default: addresses.length === 0 });
                  setIsAddingAddress(true);
                }}>
                <Text style={orderStyles.secondaryButtonText}>+ Add a new address</Text>
              </Pressable>
            )}
          </View>

          <View style={orderStyles.card}>
            <Text style={orderStyles.sectionTitle}>Payment</Text>
            {([
              { value: 'cod', title: 'Cash on Delivery', detail: 'Pay when your order arrives.', tag: 'COD' },
              { value: 'online', title: 'Online payment', detail: 'Maya Wallet, Sandbox QRPh, or card via Maya Checkout.', tag: 'SANDBOX' },
            ] as const).map((option) => {
              const selected = paymentMethod === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.paymentOption, selected && styles.paymentOptionSelected]}
                  onPress={() => setPaymentMethod(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}>
                  <View style={styles.radio}>{selected ? <View style={styles.radioSelected} /> : null}</View>
                  <View style={styles.addressCopy}>
                    <Text style={styles.addressName}>{option.title}</Text>
                    <Text style={orderStyles.muted}>{option.detail}</Text>
                  </View>
                  <Text style={styles.codTag}>{option.tag}</Text>
                </Pressable>
              );
            })}
            {paymentMethod === 'online' ? (
              <Text style={styles.paymentExtension}>
                Order confirmation follows Maya&apos;s secure payment notification.
              </Text>
            ) : null}
          </View>

          <View style={orderStyles.card}>
            <Text style={orderStyles.sectionTitle}>Order note</Text>
            <TextInput
              style={[orderStyles.input, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="Anything your sellers should know? (optional)"
              placeholderTextColor={orderColors.muted}
              multiline
              maxLength={1000}
              textAlignVertical="top"
              accessibilityLabel="Optional note for sellers"
            />
          </View>

          <View style={orderStyles.card}>
            <Text style={orderStyles.sectionTitle}>Your order</Text>
            {shopGroups.map((group) => (
              <View key={group.name} style={styles.shopSummary}>
                <View style={orderStyles.row}>
                  <Text style={styles.addressName}>{group.name}</Text>
                  <Text style={styles.addressName}>{formatPrice(group.subtotal)}</Text>
                </View>
                <Text style={orderStyles.muted}>{group.count} item(s)</Text>
                <View style={orderStyles.row}>
                  <Text style={orderStyles.muted}>Delivery</Text>
                  <Text style={orderStyles.muted}>
                    {group.subtotal >= FREE_SHIPPING_THRESHOLD
                      ? 'Free'
                      : formatPrice(FLAT_SHIPPING_FEE)}
                  </Text>
                </View>
              </View>
            ))}
            <View style={orderStyles.divider} />
            <View style={orderStyles.row}>
              <Text style={styles.totalLabel}>Estimated total</Text>
              <Text style={styles.totalValue}>{formatPrice(checkoutSubtotal + shippingTotal)}</Text>
            </View>
            <Text style={styles.authoritativeNote}>
              Final price, delivery, and stock are verified securely by the server.
            </Text>
            <Pressable
              style={[
                orderStyles.primaryButton,
                (!canCheckout || !selectedAddressId || isSubmitting) &&
                  orderStyles.primaryButtonDisabled,
              ]}
              onPress={() => void submitOrder()}
              disabled={!canCheckout || !selectedAddressId || isSubmitting}
              accessibilityRole="button"
              accessibilityLabel={paymentMethod === 'online' ? 'Pay securely with Maya' : 'Place order with Cash on Delivery'}>
              <Text style={orderStyles.primaryButtonText}>
                {isSubmitting
                  ? paymentMethod === 'online' ? 'Preparing secure checkout…' : 'Placing order…'
                  : paymentMethod === 'online' ? 'Continue to Maya' : 'Place order'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </OrderScreenFrame>
  );
}

function AddressField({
  label,
  keyboardType = 'default',
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={orderStyles.label}>{label}</Text>
      <TextInput
        style={orderStyles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={keyboardType}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  manageLink: {
    color: orderColors.green,
    fontSize: 12,
    fontWeight: '800',
  },
  manageButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#cfd8ca',
    borderRadius: 18,
    backgroundColor: '#f5f7f0',
  },
  addressOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 5,
    padding: 12,
  },
  addressSelected: {
    borderColor: orderColors.green,
    backgroundColor: '#f1f3ea',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: orderColors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioSelected: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: orderColors.green,
  },
  addressCopy: {
    flex: 1,
    gap: 3,
  },
  addressName: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '800',
  },
  defaultTag: {
    color: orderColors.green,
    fontSize: 9,
    fontWeight: '900',
  },
  addressForm: {
    gap: 12,
    paddingTop: 4,
  },
  field: {
    flex: 1,
    gap: 5,
  },
  formPair: {
    flexDirection: 'row',
    gap: 10,
  },
  defaultCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 44,
    paddingVertical: 6,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: orderColors.green,
  },
  checkboxChecked: {
    backgroundColor: orderColors.green,
  },
  cancelAdd: {
    alignSelf: 'center',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 20,
    backgroundColor: orderColors.card,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 5,
    padding: 12,
    backgroundColor: orderStyles.card.backgroundColor,
  },
  paymentOptionSelected: {
    borderColor: orderColors.green,
    backgroundColor: '#f1f3ea',
  },
  codTag: {
    color: orderColors.green,
    fontSize: 10,
    fontWeight: '900',
  },
  paymentExtension: {
    color: orderColors.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  noteInput: {
    minHeight: 92,
    paddingTop: 12,
  },
  shopSummary: {
    gap: 7,
    paddingVertical: 4,
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
  authoritativeNote: {
    color: orderColors.muted,
    fontSize: 11,
    lineHeight: 17,
  },
});
