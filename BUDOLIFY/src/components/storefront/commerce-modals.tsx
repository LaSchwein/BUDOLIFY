import { useEffect, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView as SafeArea } from 'react-native-safe-area-context';

import type { StoreProduct } from '@/lib/storefront-types';

type BagLine = {
  product: StoreProduct;
  quantity: number;
};

export function CartIcon({
  color = '#203c30',
  size = 21,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <View style={[styles.cartGlyph, { width: size, height: size }]} accessible={false}>
      <View style={[styles.cartHandle, { backgroundColor: color }]} />
      <View style={[styles.cartBasket, { borderColor: color }]} />
      <View style={[styles.cartWheel, styles.cartWheelLeft, { backgroundColor: color }]} />
      <View style={[styles.cartWheel, styles.cartWheelRight, { backgroundColor: color }]} />
    </View>
  );
}

type ProductDetailsModalProps = {
  product: StoreProduct | null;
  width: number;
  errorMessage?: string | null;
  onClose: () => void;
  onAddToCart: (product: StoreProduct) => Promise<boolean>;
};

export function ProductDetailsModal({
  product,
  width,
  errorMessage,
  onClose,
  onAddToCart,
}: ProductDetailsModalProps) {
  const [isAdding, setIsAdding] = useState(false);
  if (!product) return null;

  const isWide = width >= 680;
  const isSoldOut = product.stock === 0;
  const handleAddToCart = async () => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      await onAddToCart(product);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close product details"
        />
        <View style={[styles.productDialog, isWide && styles.productDialogWide]}>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close product details">
            <Text style={styles.closeIcon}>×</Text>
          </Pressable>
          <ScrollView
            contentContainerStyle={[
              styles.productDialogContent,
              isWide && styles.productDialogContentWide,
            ]}
            showsVerticalScrollIndicator={false}>
            <View style={[styles.detailImageFrame, isWide && styles.detailImageFrameWide]}>
              {product.image ? (
                <Image
                  source={{ uri: product.image }}
                  style={styles.detailImage}
                  resizeMode="cover"
                  accessibilityLabel={product.name}
                />
              ) : (
                <View style={[styles.detailImageFallback, { backgroundColor: product.background }]}>
                  <Text style={styles.detailFallbackText}>A GOOD FIND</Text>
                </View>
              )}
              {product.badge && (
                <View style={styles.detailBadge}>
                  <Text style={styles.detailBadgeText}>{product.badge}</Text>
                </View>
              )}
            </View>
            <View style={[styles.detailCopy, isWide && styles.detailCopyWide]}>
              <Text style={styles.detailEyebrow}>
                {product.shopName ? `FROM ${product.shopName.toUpperCase()}` : 'THE BUDOLIFY EDIT'}
              </Text>
              <Text style={styles.detailCategory}>{product.category}</Text>
              <Text style={styles.detailName}>{product.name}</Text>
              <View style={styles.detailPriceRow}>
                <Text style={styles.detailPrice}>{formatPrice(product.price)}</Text>
                {product.oldPrice ? (
                  <Text style={styles.detailOldPrice}>{formatPrice(product.oldPrice)}</Text>
                ) : null}
              </View>
              <Text style={styles.detailDescription}>
                {product.description?.trim() ||
                  'A thoughtful find for everyday living. Add a little something special to your routine.'}
              </Text>
              <View style={styles.detailMeta}>
                <Text style={styles.detailMetaMark}>✦</Text>
                <Text style={styles.detailMetaText}>
                  {isSoldOut ? 'Currently unavailable' : 'Ready to find a place in your day'}
                </Text>
              </View>
              {errorMessage ? (
                <Text style={styles.cartError} accessibilityRole="alert">
                  {errorMessage}
                </Text>
              ) : null}
              <Pressable
                style={[
                  styles.primaryButton,
                  (isSoldOut || isAdding) && styles.disabledButton,
                ]}
                onPress={() => void handleAddToCart()}
                disabled={isSoldOut || isAdding}
                accessibilityRole="button">
                <Text style={styles.primaryButtonText}>
                  {isSoldOut
                    ? 'Currently unavailable'
                    : isAdding
                      ? 'Adding…'
                      : 'Add to cart'}
                </Text>
                {!isSoldOut && !isAdding && <CartIcon color="#d8dfb2" size={20} />}
              </Pressable>
              <Text style={styles.paymentHint}>Secure checkout · GCash · Maya · Cash on Delivery</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type ShoppingBagModalProps = {
  visible: boolean;
  items: BagLine[];
  onClose: () => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onOrderComplete: () => void;
};

type CheckoutDetails = {
  name: string;
  phone: string;
  address: string;
  city: string;
};

type PaymentMethod = 'GCash' | 'Maya' | 'Cash on Delivery';
type BagStage = 'bag' | 'checkout' | 'success';

const FREE_SHIPPING_THRESHOLD = 1500;
const DELIVERY_FEE = 99;

export function ShoppingBagModal({
  visible,
  items,
  onClose,
  onQuantityChange,
  onOrderComplete,
}: ShoppingBagModalProps) {
  const width = useWindowDimensions().width;
  const [slideX] = useState(() => new Animated.Value(width));
  const [stage, setStage] = useState<BagStage>('bag');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('GCash');
  const [checkoutDetails, setCheckoutDetails] = useState<CheckoutDetails>({
    name: '',
    phone: '',
    address: '',
    city: '',
  });
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [completedTotal, setCompletedTotal] = useState(0);
  const isWide = width >= 760;
  const subtotal = items.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0,
  );
  const deliveryFee =
    subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : DELIVERY_FEE;
  const total = subtotal + deliveryFee;

  useEffect(() => {
    if (!visible) return;
    slideX.setValue(width);
    Animated.timing(slideX, {
      toValue: 0,
      duration: 270,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [slideX, visible, width]);

  const close = () => {
    setStage('bag');
    setCheckoutError(null);
    Animated.timing(slideX, {
      toValue: width,
      duration: 210,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const updateDetail = (key: keyof CheckoutDetails, value: string) => {
    setCheckoutDetails((current) => ({ ...current, [key]: value }));
    setCheckoutError(null);
  };

  const placeOrder = () => {
    const digits = checkoutDetails.phone.replace(/\D/g, '');
    if (!checkoutDetails.name.trim() || !checkoutDetails.address.trim() || !checkoutDetails.city.trim()) {
      setCheckoutError('Add your name and complete delivery address to continue.');
      return;
    }
    if (digits.length < 10 || digits.length > 12) {
      setCheckoutError('Enter a valid Philippine mobile number, including area code.');
      return;
    }

    setCompletedTotal(total);
    setOrderNumber(`BDL-${Date.now().toString().slice(-6)}`);
    onOrderComplete();
    setStage('success');
    setCheckoutError(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}>
      <View style={styles.drawerBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close cart"
        />
        <Animated.View
          style={[
            styles.drawerPanel,
            isWide ? styles.drawerPanelWide : styles.drawerPanelMobile,
            { transform: [{ translateX: slideX }] },
          ]}>
          <SafeArea style={styles.drawerSafeArea} edges={['top', 'bottom']}>
            <View style={styles.drawerHeader}>
              <View>
                <Text style={styles.drawerEyebrow}>
                  {stage === 'bag' ? 'YOUR LITTLE COLLECTION' : stage === 'checkout' ? 'ALMOST YOURS' : 'SALAMAT'}
                </Text>
                <Text style={styles.drawerTitle}>
                  {stage === 'bag' ? 'Your cart' : stage === 'checkout' ? 'Delivery & payment' : 'Order placed'}
                </Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close cart">
                <Text style={styles.closeIcon}>×</Text>
              </Pressable>
            </View>

            {stage === 'success' ? (
              <View style={styles.successContent}>
                <View style={styles.successSeal}>
                  <Text style={styles.successSealMark}>✓</Text>
                </View>
                <Text style={styles.successEyebrow}>THANK YOU FOR SHOPPING LOCAL</Text>
                <Text style={styles.successTitle}>Good things are on their way.</Text>
                <Text style={styles.successBody}>
                  Your demo order {orderNumber} is ready. This is a simulated checkout—no payment has been charged.
                </Text>
                <View style={styles.successSummary}>
                  <Text style={styles.summaryLabel}>PAYMENT METHOD</Text>
                  <Text style={styles.summaryValue}>{paymentMethod}</Text>
                  <View style={styles.summaryDivider} />
                  <Text style={styles.summaryLabel}>ORDER TOTAL</Text>
                  <Text style={styles.summaryValue}>{formatPrice(completedTotal)}</Text>
                </View>
                <Pressable style={styles.primaryButton} onPress={close} accessibilityRole="button">
                  <Text style={styles.primaryButtonText}>Back to the good finds</Text>
                  <Text style={styles.primaryButtonArrow}>↗</Text>
                </Pressable>
              </View>
            ) : stage === 'checkout' ? (
              <ScrollView
                style={styles.drawerScroll}
                contentContainerStyle={styles.checkoutContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <Pressable
                  style={styles.backToBag}
                  onPress={() => {
                    setStage('bag');
                    setCheckoutError(null);
                  }}
                  accessibilityRole="button">
                  <Text style={styles.backToBagText}>← Back to cart</Text>
                </Pressable>
                <Text style={styles.formSectionTitle}>Where should we send it?</Text>
                <Text style={styles.formSectionNote}>Delivery details for the Philippines</Text>
                <CheckoutField
                  label="Full name"
                  value={checkoutDetails.name}
                  onChangeText={(value) => updateDetail('name', value)}
                  placeholder="Name on the delivery"
                  autoComplete="name"
                />
                <CheckoutField
                  label="Mobile number"
                  value={checkoutDetails.phone}
                  onChangeText={(value) => updateDetail('phone', value)}
                  placeholder="09XX XXX XXXX"
                  keyboardType="phone-pad"
                />
                <CheckoutField
                  label="Street, building & barangay"
                  value={checkoutDetails.address}
                  onChangeText={(value) => updateDetail('address', value)}
                  placeholder="House no., street, barangay"
                  autoComplete="street-address"
                />
                <CheckoutField
                  label="City / municipality & province"
                  value={checkoutDetails.city}
                  onChangeText={(value) => updateDetail('city', value)}
                  placeholder="City, province"
                />

                <Text style={[styles.formSectionTitle, styles.paymentTitle]}>Choose how to pay</Text>
                <View style={styles.paymentOptions}>
                  {(['GCash', 'Maya', 'Cash on Delivery'] as const).map((method) => {
                    const selected = paymentMethod === method;
                    return (
                      <Pressable
                        key={method}
                        style={[styles.paymentOption, selected && styles.paymentOptionSelected]}
                        onPress={() => setPaymentMethod(method)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}>
                        <View style={[styles.radio, selected && styles.radioSelected]}>
                          {selected && <View style={styles.radioDot} />}
                        </View>
                        <View style={styles.paymentCopy}>
                          <Text style={styles.paymentName}>{method}</Text>
                          <Text style={styles.paymentDetail}>
                            {method === 'GCash'
                              ? 'Mobile wallet · simulated'
                              : method === 'Maya'
                                ? 'Mobile wallet · simulated'
                                : 'Pay when your order arrives'}
                          </Text>
                        </View>
                        <Text style={styles.paymentSymbol}>
                          {method === 'Cash on Delivery' ? '₱' : '↗'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.demoNote}>
                  Demo checkout only. GCash and Maya are not charged and no real order is submitted.
                </Text>
                {checkoutError && <Text style={styles.checkoutError}>{checkoutError}</Text>}
                <View style={styles.checkoutTotal}>
                  <Text style={styles.checkoutTotalLabel}>Total due</Text>
                  <Text style={styles.checkoutTotalValue}>{formatPrice(total)}</Text>
                </View>
                <Pressable style={styles.primaryButton} onPress={placeOrder} accessibilityRole="button">
                  <Text style={styles.primaryButtonText}>Place demo order</Text>
                  <Text style={styles.primaryButtonArrow}>↗</Text>
                </Pressable>
              </ScrollView>
            ) : items.length === 0 ? (
              <View style={styles.emptyBag}>
                <View style={styles.emptyBagMark}>
                  <Text style={styles.emptyBagIcon}>✳</Text>
                </View>
                <Text style={styles.emptyBagTitle}>A little room for something lovely.</Text>
                <Text style={styles.emptyBagBody}>
                  Your cart is empty. Take a look around and find something that feels like you.
                </Text>
                <Pressable style={styles.emptyActionButton} onPress={close} accessibilityRole="button">
                  <Text style={styles.textLink}>Explore the edit →</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <ScrollView
                  style={styles.drawerScroll}
                  contentContainerStyle={styles.bagList}
                  showsVerticalScrollIndicator={false}>
                  {subtotal < FREE_SHIPPING_THRESHOLD ? (
                    <View style={styles.shippingNote}>
                      <Text style={styles.shippingNoteText}>
                        Add {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)} more for free delivery.
                      </Text>
                      <View style={styles.shippingTrack}>
                        <View
                          style={[
                            styles.shippingProgress,
                            { width: `${Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100)}%` },
                          ]}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.shippingNote}>
                      <Text style={styles.shippingNoteText}>Lovely — delivery is on us.</Text>
                    </View>
                  )}
                  {items.map(({ product, quantity }) => (
                    <View key={product.id} style={styles.bagItem}>
                      {product.image ? (
                        <Image
                          source={{ uri: product.image }}
                          style={styles.bagItemImage}
                          resizeMode="cover"
                          accessibilityLabel={product.name}
                        />
                      ) : (
                        <View style={[styles.bagItemFallback, { backgroundColor: product.background }]}>
                          <Text style={styles.bagItemFallbackMark}>✦</Text>
                        </View>
                      )}
                      <View style={styles.bagItemDetails}>
                        <Text style={styles.bagItemEyebrow}>
                          {product.shopName ?? product.category}
                        </Text>
                        <Text style={styles.bagItemName} numberOfLines={2}>{product.name}</Text>
                        <Text style={styles.bagItemPrice}>{formatPrice(product.price)}</Text>
                        <View style={styles.quantityRow}>
                          <Pressable
                            style={styles.quantityButton}
                            onPress={() => onQuantityChange(product.id, quantity - 1)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove one ${product.name}`}>
                            <Text style={styles.quantityButtonText}>−</Text>
                          </Pressable>
                          <Text style={styles.quantityValue}>{quantity}</Text>
                          <Pressable
                            style={[
                              styles.quantityButton,
                              product.stock !== undefined &&
                                quantity >= product.stock &&
                                styles.quantityButtonDisabled,
                            ]}
                            onPress={() => onQuantityChange(product.id, quantity + 1)}
                            disabled={product.stock !== undefined && quantity >= product.stock}
                            accessibilityRole="button"
                            accessibilityLabel={`Add one ${product.name}`}>
                            <Text style={styles.quantityButtonText}>＋</Text>
                          </Pressable>
                          <Pressable
                            style={styles.removeButton}
                            onPress={() => onQuantityChange(product.id, 0)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${product.name} from cart`}>
                            <Text style={styles.removeButtonText}>Remove</Text>
                          </Pressable>
                        </View>
                      </View>
                      <Text style={styles.bagLineTotal}>{formatPrice(product.price * quantity)}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.bagSummary}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Subtotal</Text>
                    <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Delivery</Text>
                    <Text style={styles.summaryValue}>
                      {deliveryFee === 0 ? 'On us' : formatPrice(deliveryFee)}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>{formatPrice(total)}</Text>
                  </View>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => setStage('checkout')}
                    accessibilityRole="button">
                    <Text style={styles.primaryButtonText}>Continue to checkout</Text>
                    <Text style={styles.primaryButtonArrow}>↗</Text>
                  </Pressable>
                  <Text style={styles.paymentHint}>GCash · Maya · Cash on Delivery</Text>
                </View>
              </>
            )}
          </SafeArea>
        </Animated.View>
      </View>
    </Modal>
  );
}

type CheckoutFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad';
  autoComplete?: 'name' | 'street-address';
};

function CheckoutField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoComplete,
}: CheckoutFieldProps) {
  return (
    <View style={styles.checkoutField}>
      <Text style={styles.checkoutFieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#969287"
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        style={styles.checkoutInput}
      />
    </View>
  );
}

function formatPrice(price: number) {
  return `₱${Number(price).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 33, 27, 0.62)',
    padding: 18,
  },
  productDialog: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#fbf9f4',
  },
  productDialogWide: {
    maxWidth: 850,
    borderRadius: 22,
  },
  productDialogContent: {
    paddingBottom: 8,
  },
  productDialogContentWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingBottom: 0,
  },
  closeButton: {
    zIndex: 2,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#f0eee7',
  },
  closeIcon: {
    color: '#26372e',
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '300',
  },
  detailImageFrame: {
    height: 270,
    position: 'relative',
    backgroundColor: '#e8e4d8',
  },
  detailImageFrameWide: {
    width: '50%',
    height: 'auto',
    minHeight: 500,
  },
  detailImage: {
    width: '100%',
    height: '100%',
  },
  detailImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailFallbackText: {
    color: '#697464',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  detailBadge: {
    position: 'absolute',
    left: 16,
    top: 16,
    borderRadius: 3,
    backgroundColor: '#fbf9f4',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  detailBadgeText: {
    color: '#315141',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  detailCopy: {
    paddingHorizontal: 25,
    paddingTop: 27,
    paddingBottom: 24,
  },
  detailCopyWide: {
    flex: 1,
    justifyContent: 'center',
  },
  detailEyebrow: {
    color: '#98694f',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  detailCategory: {
    color: '#85877e',
    fontSize: 11,
    marginTop: 15,
  },
  detailName: {
    color: '#203c30',
    fontFamily: 'Georgia',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
    marginTop: 4,
  },
  detailPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 13,
  },
  detailPrice: {
    color: '#203c30',
    fontSize: 19,
    fontWeight: '800',
  },
  detailOldPrice: {
    color: '#a3a39a',
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  detailDescription: {
    color: '#64665d',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 18,
  },
  detailMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 19,
    marginBottom: 21,
  },
  detailMetaMark: {
    color: '#aa6d50',
    fontSize: 14,
  },
  detailMetaText: {
    color: '#697464',
    fontSize: 11,
  },
  cartError: {
    color: '#a54032',
    backgroundColor: '#fff0ec',
    borderRadius: 4,
    fontSize: 11,
    lineHeight: 16,
    padding: 9,
    marginBottom: 10,
  },
  cartGlyph: {
    position: 'relative',
  },
  cartHandle: {
    position: 'absolute',
    left: 0,
    top: 3,
    width: 7,
    height: 2,
    transform: [{ rotate: '58deg' }],
  },
  cartBasket: {
    position: 'absolute',
    left: 5,
    top: 5,
    width: 14,
    height: 10,
    borderWidth: 1.6,
    borderTopWidth: 1,
    borderRadius: 2,
    transform: [{ skewX: '-10deg' }],
  },
  cartWheel: {
    position: 'absolute',
    top: 17,
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  cartWheelLeft: {
    left: 8,
  },
  cartWheelRight: {
    left: 16,
  },
  primaryButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    backgroundColor: '#203c30',
    paddingHorizontal: 17,
  },
  primaryButtonText: {
    color: '#fffdf8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.25,
  },
  primaryButtonArrow: {
    color: '#d8dfb2',
    fontSize: 17,
  },
  disabledButton: {
    opacity: 0.5,
  },
  paymentHint: {
    color: '#89877d',
    fontSize: 9,
    letterSpacing: 0.25,
    textAlign: 'center',
    marginTop: 13,
  },
  drawerBackdrop: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 33, 27, 0.48)',
  },
  drawerPanel: {
    height: '100%',
    backgroundColor: '#fbf9f4',
  },
  drawerPanelWide: {
    width: 480,
    maxWidth: '100%',
  },
  drawerPanelMobile: {
    width: '100%',
  },
  drawerSafeArea: {
    flex: 1,
    backgroundColor: '#fbf9f4',
  },
  drawerHeader: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e9e5db',
    paddingHorizontal: 24,
  },
  drawerEyebrow: {
    color: '#98694f',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  drawerTitle: {
    color: '#203c30',
    fontFamily: 'Georgia',
    fontSize: 26,
    fontWeight: '700',
    marginTop: 5,
  },
  drawerScroll: {
    flex: 1,
  },
  bagList: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  shippingNote: {
    gap: 9,
    backgroundColor: '#f0efe7',
    padding: 13,
    marginTop: 18,
    marginBottom: 4,
  },
  shippingNoteText: {
    color: '#435646',
    fontSize: 11,
    fontWeight: '600',
  },
  shippingTrack: {
    height: 3,
    overflow: 'hidden',
    backgroundColor: '#dcdcd1',
  },
  shippingProgress: {
    height: '100%',
    backgroundColor: '#a66e50',
  },
  bagItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#e9e5db',
    paddingVertical: 18,
  },
  bagItemImage: {
    width: 82,
    height: 96,
    backgroundColor: '#ebe8df',
  },
  bagItemFallback: {
    width: 82,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bagItemFallbackMark: {
    color: '#627262',
    fontSize: 18,
  },
  bagItemDetails: {
    flex: 1,
  },
  bagItemEyebrow: {
    color: '#98694f',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  bagItemName: {
    color: '#26372e',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
  },
  bagItemPrice: {
    color: '#203c30',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 11,
  },
  quantityButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d9d8cd',
    borderRadius: 19,
    backgroundColor: '#fffefa',
  },
  quantityButtonDisabled: {
    opacity: 0.4,
  },
  quantityButtonText: {
    color: '#26372e',
    fontSize: 14,
  },
  quantityValue: {
    color: '#26372e',
    fontSize: 11,
    minWidth: 12,
    textAlign: 'center',
  },
  removeButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#efd0c8',
    borderRadius: 18,
    backgroundColor: '#fff8f5',
  },
  removeButtonText: {
    color: '#a44738',
    fontSize: 10,
    fontWeight: '700',
  },
  bagLineTotal: {
    color: '#203c30',
    fontSize: 11,
    fontWeight: '700',
    paddingTop: 2,
  },
  bagSummary: {
    borderTopWidth: 1,
    borderTopColor: '#e9e5db',
    backgroundColor: '#fbf9f4',
    paddingHorizontal: 24,
    paddingTop: 17,
    paddingBottom: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  summaryLabel: {
    color: '#77796f',
    fontSize: 11,
  },
  summaryValue: {
    color: '#26372e',
    fontSize: 11,
    fontWeight: '700',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#e9e5db',
    marginTop: 4,
    paddingTop: 13,
    marginBottom: 14,
  },
  totalLabel: {
    color: '#203c30',
    fontSize: 13,
    fontWeight: '800',
  },
  totalValue: {
    color: '#203c30',
    fontSize: 19,
    fontWeight: '800',
  },
  emptyBag: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingBottom: 50,
  },
  emptyBagMark: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: '#eeeee4',
  },
  emptyBagIcon: {
    color: '#98694f',
    fontSize: 27,
  },
  emptyBagTitle: {
    color: '#203c30',
    fontFamily: 'Georgia',
    fontSize: 23,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 22,
  },
  emptyBagBody: {
    color: '#77796f',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 10,
  },
  textLink: {
    color: '#315141',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyActionButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 17,
    borderWidth: 1,
    borderColor: '#cfd8ca',
    borderRadius: 22,
    backgroundColor: '#f5f7f0',
    marginTop: 21,
  },
  checkoutContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  backToBag: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#d8ddd1',
    borderRadius: 20,
    backgroundColor: '#fffefa',
  },
  backToBagText: {
    color: '#667365',
    fontSize: 11,
    fontWeight: '700',
  },
  formSectionTitle: {
    color: '#203c30',
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 7,
  },
  formSectionNote: {
    color: '#89877e',
    fontSize: 10,
    marginTop: 4,
    marginBottom: 14,
  },
  checkoutField: {
    marginBottom: 12,
  },
  checkoutFieldLabel: {
    color: '#51584d',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
  },
  checkoutInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#dedbd1',
    borderRadius: 10,
    backgroundColor: '#fffefa',
    color: '#26372e',
    fontSize: 12,
    paddingHorizontal: 11,
  },
  paymentTitle: {
    marginTop: 12,
    marginBottom: 11,
  },
  paymentOptions: {
    gap: 8,
  },
  paymentOption: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#dedbd1',
    borderRadius: 12,
    backgroundColor: '#fffefa',
    paddingHorizontal: 11,
  },
  paymentOptionSelected: {
    borderColor: '#315141',
    backgroundColor: '#f2f4ed',
  },
  radio: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#a7a79b',
    borderRadius: 8,
  },
  radioSelected: {
    borderColor: '#315141',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#315141',
  },
  paymentCopy: {
    flex: 1,
  },
  paymentName: {
    color: '#26372e',
    fontSize: 11,
    fontWeight: '800',
  },
  paymentDetail: {
    color: '#85877e',
    fontSize: 9,
    marginTop: 3,
  },
  paymentSymbol: {
    color: '#98694f',
    fontSize: 15,
    fontWeight: '700',
  },
  demoNote: {
    color: '#79786e',
    fontSize: 9,
    lineHeight: 14,
    marginTop: 12,
  },
  checkoutError: {
    color: '#a54032',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 10,
  },
  checkoutTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e9e5db',
    marginTop: 18,
    paddingTop: 13,
    marginBottom: 13,
  },
  checkoutTotalLabel: {
    color: '#203c30',
    fontSize: 12,
    fontWeight: '700',
  },
  checkoutTotalValue: {
    color: '#203c30',
    fontSize: 19,
    fontWeight: '800',
  },
  successContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 34,
  },
  successSeal: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#a8b69b',
    borderRadius: 32,
    backgroundColor: '#eff2e9',
  },
  successSealMark: {
    color: '#315141',
    fontSize: 25,
    fontWeight: '700',
  },
  successEyebrow: {
    color: '#98694f',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 22,
  },
  successTitle: {
    color: '#203c30',
    fontFamily: 'Georgia',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  successBody: {
    color: '#77796f',
    fontSize: 11,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 10,
  },
  successSummary: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e6e3d9',
    borderRadius: 4,
    backgroundColor: '#fffefa',
    padding: 15,
    marginTop: 23,
    marginBottom: 20,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#e9e5db',
    marginVertical: 10,
  },
});
