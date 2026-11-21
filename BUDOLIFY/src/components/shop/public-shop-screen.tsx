import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView as SafeArea } from 'react-native-safe-area-context';

import { getShopImageUrl } from '@/lib/shop-images';
import { useCart } from '@/lib/cart';
import { supabase } from '@/lib/supabase';
import type { Shop, ShopProduct } from '@/lib/shop-types';
import type { StoreProduct } from '@/lib/storefront-types';

type PublicProduct = Pick<
  ShopProduct,
  'id' | 'name' | 'description' | 'category' | 'price' | 'inventory' | 'image_path'
>;
type PublicShop = Pick<
  Shop,
  'id' | 'name' | 'slug' | 'description' | 'contact_email' | 'phone' | 'logo_path'
>;

function getErrorMessage(error: unknown) {
  const errorObject =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof errorObject?.message === 'string'
        ? errorObject.message
        : 'Unable to load this shop. Please try again.';

  if (
    errorObject?.code === '42P01' ||
    errorObject?.code === 'PGRST205' ||
    /could not find the table|relation .* does not exist/i.test(message)
  ) {
    return 'Shop pages are not set up. Run supabase/migrations/20261117231500_shops_and_products.sql in your Supabase SQL Editor.';
  }
  return message;
}

function formatPrice(price: number) {
  return `₱${Number(price).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function PublicShopScreen({ slug }: { slug?: string }) {
  const width = useWindowDimensions().width;
  const cart = useCart();
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [cartMessage, setCartMessage] = useState<string | null>(null);

  const addProductToCart = async (product: PublicProduct) => {
    if (!shop || addingProductId) return;
    setAddingProductId(product.id);
    setCartMessage(null);
    try {
      const added = await cart.addItem({
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        price: Number(product.price),
        rating: 'NEW',
        badge: 'SHOP FIND',
        image: getShopImageUrl(product.image_path) ?? '',
        background: '#eee8dd',
        shopId: shop.id,
        shopName: shop.name,
        shopSlug: shop.slug,
        stock: product.inventory,
      } satisfies StoreProduct);
      if (added) setCartMessage(`${product.name} added to your cart.`);
    } catch (error) {
      setCartMessage(
        error instanceof Error ? error.message : 'Unable to add this product to your cart.',
      );
    } finally {
      setAddingProductId(null);
    }
  };

  useEffect(() => {
    let active = true;

    const loadShop = async () => {
      setIsLoading(true);
      setPageError(null);
      setShop(null);
      setProducts([]);

      try {
        if (!slug) {
          setPageError('Shop not found or no longer available.');
          return;
        }

        const { data: shopData, error: shopError } = await supabase
          .from('shops')
          .select('id,name,slug,description,contact_email,phone,logo_path')
          .eq('slug', slug)
          .eq('is_published', true)
          .maybeSingle();
        if (shopError) throw shopError;
        if (!shopData) {
          setPageError('Shop not found or no longer available.');
          return;
        }

        const currentShop = shopData as PublicShop;
        const { data: productData, error: productError } = await supabase
          .from('shop_products')
          .select('id,name,description,category,price,inventory,image_path')
          .eq('shop_id', currentShop.id)
          .eq('is_published', true)
          .order('created_at', { ascending: false });
        if (productError) throw productError;

        if (active) {
          setShop(currentShop);
          setProducts((productData ?? []) as PublicProduct[]);
        }
      } catch (error) {
        if (active) setPageError(getErrorMessage(error));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadShop();
    return () => {
      active = false;
    };
  }, [slug]);

  const isWide = width >= 760;
  const imageWidth = isWide ? 226 : Math.max(130, Math.min(width * 0.42, 190));

  return (
    <SafeArea style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.replace('/')} accessibilityRole="link">
              <Text style={styles.wordmark}>
                BUDOLIFY<Text style={styles.wordmarkDot}>.</Text>
              </Text>
            </Pressable>
            <Pressable
              style={styles.headerAction}
              onPress={() => router.replace('/')}
              accessibilityRole="link">
              <Text style={styles.backLink}>← Storefront</Text>
            </Pressable>
            <Pressable
              style={styles.headerAction}
              onPress={() => router.push('/cart')}
              accessibilityRole="link"
              accessibilityLabel={`Open cart, ${cart.count} items`}>
              <Text style={styles.backLink}>Cart ({cart.count})</Text>
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.status}>
              <ActivityIndicator color="#285445" />
              <Text style={styles.statusText}>Finding this shop…</Text>
            </View>
          ) : pageError ? (
            <View style={styles.status}>
              <Text style={styles.errorTitle}>This shop is unavailable.</Text>
              <Text style={styles.statusText}>{pageError}</Text>
            </View>
          ) : shop ? (
            <>
              <View style={[styles.shopHeader, isWide && styles.shopHeaderWide]}>
                {getShopImageUrl(shop.logo_path) ? (
                  <Image
                    source={{ uri: getShopImageUrl(shop.logo_path) ?? undefined }}
                    style={[styles.shopLogo, { width: imageWidth, height: imageWidth }]}
                    resizeMode="cover"
                    accessibilityLabel={`${shop.name} logo`}
                  />
                ) : (
                  <View
                    style={[
                      styles.shopLogoPlaceholder,
                      { width: imageWidth, height: imageWidth },
                    ]}>
                    <Text style={styles.shopLogoInitial}>
                      {shop.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.shopCopy}>
                  <Text style={styles.eyebrow}>A BUDOLIFY SHOP</Text>
                  <Text style={styles.shopName}>{shop.name}</Text>
                  {!!shop.description && (
                    <Text style={styles.description}>{shop.description}</Text>
                  )}
                  {!!shop.contact_email && (
                    <Text style={styles.contact}>Contact: {shop.contact_email}</Text>
                  )}
                  {!!shop.phone && <Text style={styles.contact}>{shop.phone}</Text>}
                </View>
              </View>

              <View style={styles.catalogHeading}>
                <View>
                  <Text style={styles.eyebrow}>SHOP THE COLLECTION</Text>
                  <Text style={styles.sectionTitle}>Good finds, picked for you.</Text>
                </View>
                <Text style={styles.resultCount}>
                  {products.length} {products.length === 1 ? 'product' : 'products'}
                </Text>
              </View>
                {cart.error || cartMessage ? (
                  <Text
                    style={cart.error ? styles.cartError : styles.cartSuccess}
                    accessibilityRole={cart.error ? 'alert' : 'text'}>
                    {cart.error ?? cartMessage}
                  </Text>
                ) : null}

              {products.length ? (
                <View style={styles.productGrid}>
                  {products.map((product) => {
                    const imageUri = getShopImageUrl(product.image_path);
                    return (
                      <View
                        key={product.id}
                        style={[styles.productCard, isWide && styles.productCardWide]}>
                        <View style={styles.productImageWrap}>
                          {imageUri ? (
                            <Image
                              source={{ uri: imageUri }}
                              style={styles.productImage}
                              resizeMode="cover"
                              accessibilityLabel={product.name}
                            />
                          ) : (
                            <Text style={styles.imagePlaceholder}>A GOOD FIND</Text>
                          )}
                        </View>
                        <View style={styles.productDetails}>
                          <Text style={styles.productCategory}>{product.category}</Text>
                          <Text style={styles.productName}>{product.name}</Text>
                          {!!product.description && (
                            <Text style={styles.productDescription} numberOfLines={3}>
                              {product.description}
                            </Text>
                          )}
                          <View style={styles.priceRow}>
                            <Text style={styles.price}>{formatPrice(product.price)}</Text>
                            <Text
                              style={[
                                styles.stock,
                                product.inventory === 0 && styles.soldOut,
                              ]}>
                              {product.inventory === 0 ? 'Sold out' : 'In stock'}
                            </Text>
                          </View>
                          <Pressable
                            style={[
                              styles.addButton,
                              (product.inventory === 0 || addingProductId !== null) &&
                                styles.addButtonDisabled,
                            ]}
                            onPress={() => void addProductToCart(product)}
                            disabled={product.inventory === 0 || addingProductId !== null}
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${product.name} to cart`}>
                            <Text style={styles.addButtonText}>
                              {product.inventory === 0
                                ? 'Sold out'
                                : addingProductId === product.id
                                  ? 'Adding…'
                                  : 'Add to cart'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>This shelf is still getting ready.</Text>
                  <Text style={styles.statusText}>Check back soon for new finds.</Text>
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f7f1',
  },
  page: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  content: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
  },
  topBar: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e6dc',
    marginBottom: 28,
  },
  wordmark: {
    color: '#183d32',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  wordmarkDot: {
    color: '#e6815d',
  },
  backLink: {
    color: '#315141',
    fontSize: 12,
    fontWeight: '700',
  },
  headerAction: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#d8ddd1',
    borderRadius: 22,
    backgroundColor: '#fffefa',
  },
  cartError: {
    color: '#a54032',
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 8,
  },
  cartSuccess: {
    color: '#315141',
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 8,
  },
  status: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  statusText: {
    color: '#85877e',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#26372e',
    fontSize: 19,
    fontWeight: '800',
  },
  shopHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#eeece2',
  },
  shopHeaderWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
    padding: 36,
  },
  shopLogo: {
    borderRadius: 18,
    backgroundColor: '#e2e0d6',
  },
  shopLogoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#d9e2d5',
  },
  shopLogoInitial: {
    color: '#315141',
    fontSize: 54,
    fontWeight: '800',
  },
  shopCopy: {
    flex: 1,
    alignItems: 'center',
    gap: 9,
  },
  eyebrow: {
    color: '#9a7951',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  shopName: {
    color: '#203c30',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    color: '#64665d',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  contact: {
    color: '#74766d',
    fontSize: 11,
  },
  catalogHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 40,
    marginBottom: 18,
  },
  sectionTitle: {
    color: '#203c30',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 5,
  },
  resultCount: {
    color: '#87897f',
    fontSize: 11,
    paddingBottom: 3,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  productCard: {
    width: '48%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 18,
    backgroundColor: '#fffefa',
  },
  productCardWide: {
    width: '31.5%',
  },
  productImageWrap: {
    height: 164,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9e6db',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    color: '#8b8b7f',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  productDetails: {
    padding: 13,
  },
  productCategory: {
    color: '#9a7951',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  productName: {
    color: '#26372e',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 5,
  },
  productDescription: {
    color: '#77796f',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 13,
  },
  price: {
    color: '#183d32',
    fontSize: 14,
    fontWeight: '800',
  },
  stock: {
    color: '#4d7558',
    fontSize: 9,
    fontWeight: '700',
  },
  soldOut: {
    color: '#a54032',
  },
  addButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#183d32',
    paddingHorizontal: 12,
  },
  addButtonDisabled: {
    opacity: 0.55,
  },
  addButtonText: {
    color: '#fffefa',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    gap: 9,
    borderRadius: 14,
    backgroundColor: '#eeece2',
    padding: 28,
  },
  emptyTitle: {
    color: '#26372e',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
});
