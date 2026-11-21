import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  Image,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView as SafeArea } from 'react-native-safe-area-context';

import {
  CartIcon,
  ProductDetailsModal,
} from '@/components/storefront/commerce-modals';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart';
import { getShopImageUrl } from '@/lib/shop-images';
import { supabase } from '@/lib/supabase';
import type { StoreProduct } from '@/lib/storefront-types';

const baseCategories = ['All finds', 'Tech', 'Style', 'Home', 'Everyday'];

const formatPrice = (price: number) => `₱${price.toLocaleString('en-PH')}`;

export default function StorefrontScreen() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const cart = useCart();
  const width = useWindowDimensions().width;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [activeCategory, setActiveCategory] = useState('All finds');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [shopProducts, setShopProducts] = useState<StoreProduct[]>([]);
  const [shopProductsError, setShopProductsError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [mainY, setMainY] = useState(0);
  const [catalogY, setCatalogY] = useState(0);
  const isWide = width >= 1024;
  const contentWidth = Math.min(Math.max(width - (width >= 640 ? 64 : 32), 0), 1160);
  const columnCount = width >= 980 ? 4 : width >= 640 ? 3 : 2;
  const gridGap = width >= 640 ? 18 : 12;
  const cardWidth =
    (contentWidth - gridGap * (columnCount - 1) - 1) / columnCount;
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase
        .from('shop_products')
      .select(
          'id,shop_id,name,description,category,price,image_path,inventory,shops!inner(name,slug,is_published,is_archived)',
      )
        .eq('is_published', true)
        .eq('is_archived', false)
        .eq('shops.is_published', true)
        .eq('shops.is_archived', false)
        .order('created_at', { ascending: false });

      if (!active) return;
      if (error) {
        setShopProductsError(
          error.message.includes('shop_products')
            ? 'Run supabase/migrations/20261117231500_shops_and_products.sql in your Supabase SQL Editor.'
            : error.message,
        );
        return;
      }

      const rows = (data ?? []) as {
        id: string;
        shop_id: string;
        name: string;
        description: string;
        category: string;
        price: number;
        image_path: string | null;
        inventory: number;
        shops:
          | { name: string; slug: string; is_published: boolean; is_archived: boolean }
          | { name: string; slug: string; is_published: boolean; is_archived: boolean }[];
      }[];
      const colors = ['#e8e4d8', '#f3e7df', '#e4e9e3', '#eee8dd'];
      setShopProducts(
        rows.map((product, index) => {
          const shop = Array.isArray(product.shops) ? product.shops[0] : product.shops;
          return {
            id: product.id,
            shopId: product.shop_id,
            name: product.name,
            description: product.description,
            category: product.category,
            price: Number(product.price),
            rating: 'NEW',
            badge: 'SHOP FIND',
            image: getShopImageUrl(product.image_path) ?? '',
            background: colors[index % colors.length],
            shopName: shop?.name ?? 'Community shop',
            shopSlug: shop?.slug,
            stock: product.inventory,
          };
        }),
      );
      setShopProductsError(null);
    })().catch((error: unknown) => {
      if (active) {
        setShopProductsError(
          error instanceof Error ? error.message : 'Unable to load shop products.',
        );
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(
    () => Array.from(new Set([...baseCategories, ...shopProducts.map((product) => product.category)])),
    [shopProducts],
  );
  const visibleProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return shopProducts.filter((product) => {
      const matchesCategory =
        activeCategory === 'All finds' || product.category === activeCategory;
      const matchesSearch =
        !search ||
        product.name.toLowerCase().includes(search) ||
        product.category.toLowerCase().includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, query, shopProducts]);
  const displayCardWidth =
    visibleProducts.length === 1 && width < 640 ? contentWidth : cardWidth;
  const browseFinds = () =>
    scrollRef.current?.scrollTo({ y: mainY + catalogY, animated: true });

  const addToCart = async (product: StoreProduct) => {
    const added = await cart.addItem(product);
    if (added) setSelectedProduct(null);
    return added;
  };

  return (
    <SafeArea style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.announcement}>
          <Text style={styles.announcementText}>Libreng delivery on orders over ₱1,500</Text>
          <Text style={styles.announcementArrow}>→</Text>
        </View>

        <View
          style={[
            styles.header,
            { width: contentWidth },
            !isWide && styles.headerMobile,
          ]}>
          <Pressable
            style={!isWide && styles.brandMobile}
            onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
            accessibilityRole="link"
            accessibilityLabel="Back to the top of Budolify">
            <Text style={styles.wordmark}>BUDOLIFY<Text style={styles.wordmarkDot}>.</Text></Text>
            <Text style={[styles.tagline, !isWide && styles.taglineMobile]} numberOfLines={1}>
              A CONSIDERED EDIT FOR EVERYDAY
            </Text>
          </Pressable>

          {isWide && (
            <View style={styles.navigation}>
              <Pressable style={styles.navButton} onPress={browseFinds} accessibilityRole="button">
                <Text style={styles.navLink}>The edit</Text>
              </Pressable>
              <Pressable style={styles.navButton} onPress={() => setActiveCategory('Tech')} accessibilityRole="button">
                <Text style={styles.navLink}>Tech</Text>
              </Pressable>
              <Pressable style={styles.navButton} onPress={() => setActiveCategory('Style')} accessibilityRole="button">
                <Text style={styles.navLink}>Style</Text>
              </Pressable>
              <Pressable style={styles.navButton} onPress={browseFinds} accessibilityRole="button">
                <Text style={styles.navLink}>New finds</Text>
              </Pressable>
            </View>
          )}

          <View style={[styles.headerActions, !isWide && styles.headerActionsMobile]}>
            <Pressable
              style={[styles.shopButton, !isWide && styles.compactHeaderButton]}
              onPress={() => router.push(user ? '/my-shop' : '/sign-in')}
              disabled={isAuthLoading}
              accessibilityRole="button">
              <Text style={styles.shopButtonText}>
                {user ? 'My shop' : isWide ? 'Start selling' : 'Sell'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.signInButton, !isWide && styles.compactHeaderButton]}
              onPress={() => router.push(user ? '/profile' : '/sign-in')}
              disabled={isAuthLoading}
              accessibilityRole="button">
              <Text style={styles.signInButtonText}>
                {isAuthLoading ? '…' : user ? 'Profile' : 'Sign in'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.cartButton, !isWide && styles.cartButtonCompact]}
              onPress={() => router.push('/cart')}
              accessibilityRole="button"
              accessibilityLabel={`Open cart, ${cart.count} items`}>
              <CartIcon />
              {isWide && <Text style={styles.cartLabel}>Cart</Text>}
              <View style={styles.cartCount}>
                <Text style={styles.cartCountText}>{cart.count}</Text>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={[styles.searchWrap, { width: contentWidth }]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search products"
            value={query}
            onChangeText={setQuery}
            placeholder="Search for a good find..."
            placeholderTextColor="#85877e"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable
              style={styles.clearSearchButton}
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search">
              <Text style={styles.clearSearch}>Clear</Text>
            </Pressable>
          )}
        </View>

        <View
          style={[styles.main, { width: contentWidth }]}
          onLayout={(event) => setMainY(event.nativeEvent.layout.y)}>
          <View style={[styles.hero, { flexDirection: isWide ? 'row' : 'column' }]}>
            <View style={[styles.heroCopy, !isWide && styles.heroCopyMobile]}>
              <View style={styles.heroEyebrow}>
                <View style={styles.eyebrowDot} />
                <Text style={styles.heroEyebrowText}>A LITTLE MORE SOUL. A LOT MORE YOU.</Text>
              </View>
              <Text
                style={[
                  styles.heroTitle,
                  {
                    fontSize: isWide ? (width < 1200 ? 48 : 56) : width < 360 ? 34 : 40,
                    lineHeight: isWide ? (width < 1200 ? 54 : 62) : width < 360 ? 38 : 44,
                  },
                ]}>
                Good things for{'\n'}
                <Text style={styles.heroTitleAccent}>the everyday.</Text>
              </Text>
              <Text style={styles.heroDescription}>
                A considered edit of pieces, finds, and small joys from independent shops across the Philippines.
              </Text>
              <Pressable style={styles.heroButton} onPress={browseFinds} accessibilityRole="button">
                <Text style={styles.heroButtonText}>Explore the edit</Text>
                <Text style={styles.heroButtonArrow}>→</Text>
              </Pressable>
              <View style={styles.socialProof}>
                <View style={styles.avatarStack}>
                  <View style={[styles.avatar, styles.avatarOne]}><Text style={styles.avatarText}>M</Text></View>
                  <View style={[styles.avatar, styles.avatarTwo]}><Text style={styles.avatarText}>J</Text></View>
                  <View style={[styles.avatar, styles.avatarThree]}><Text style={styles.avatarText}>A</Text></View>
                </View>
                <Text style={styles.socialProofText}>Thoughtful finds, close to home</Text>
              </View>
            </View>
            <View style={[styles.heroImageWrap, !isWide && styles.heroImageWrapMobile]}>
              <Image
                source={{
                  uri: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400&auto=format&fit=crop&q=90',
                }}
                style={styles.heroImage}
                resizeMode="cover"
                accessibilityLabel="A curated boutique filled with unique finds"
              />
              <View style={styles.heroImageShade} />
              <View style={styles.heroPhotoLabel}>
                <Text style={styles.photoLabelSmall}>THE BUDOLIFY EDIT</Text>
                <Text style={styles.photoLabelLarge}>Made for your kind of everyday.</Text>
              </View>
              <View style={styles.heroSticker}>
                <Text style={styles.stickerTop}>GOOD</Text>
                <Text style={styles.stickerBottom}>CHOICE!</Text>
              </View>
            </View>
          </View>

          <View style={[styles.perks, !isWide && styles.perksMobile]}>
            <View style={styles.perk}>
              <Text style={styles.perkIcon}>✦</Text>
              <Text style={styles.perkText}>Curated, never random</Text>
            </View>
            {isWide && <View style={styles.perkDivider} />}
            <View style={styles.perk}>
              <Text style={styles.perkIcon}>♡</Text>
              <Text style={styles.perkText}>Good quality, fair price</Text>
            </View>
            {isWide && <View style={styles.perkDivider} />}
            <View style={styles.perk}>
              <Text style={styles.perkIcon}>↗</Text>
              <Text style={styles.perkText}>Fast, happy delivery</Text>
            </View>
          </View>

          <View
            style={styles.catalog}
            onLayout={(event) => setCatalogY(event.nativeEvent.layout.y)}>
            <View
              style={[
                styles.catalogHeading,
                width < 440 && styles.catalogHeadingMobile,
              ]}>
              <View>
                <Text style={styles.sectionEyebrow}>A FEW THINGS WE LOVE</Text>
                <Text style={styles.sectionTitle}>The good things edit.</Text>
              </View>
              <Text style={styles.resultCount}>
                {visibleProducts.length} good {visibleProducts.length === 1 ? 'find' : 'finds'}
              </Text>
            </View>
            {shopProductsError && (
              <Text style={styles.shopProductsError}>
                Shop products are temporarily unavailable: {shopProductsError}
              </Text>
            )}
            {cart.error && <Text style={styles.shopProductsError}>{cart.error}</Text>}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryList}>
              {categories.map((category) => {
                const selected = activeCategory === category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => setActiveCategory(category)}
                    style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}>
                    <Text
                      style={[
                        styles.categoryText,
                        selected && styles.categoryTextSelected,
                      ]}>
                      {category}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {visibleProducts.length > 0 ? (
              <View style={[styles.productGrid, { gap: gridGap }]}>
                {visibleProducts.map((product) => {
                  return (
                    <View
                      key={product.id}
                      style={[styles.productCard, { width: displayCardWidth }]}>
                      <View
                        style={[
                          styles.productImageWrap,
                          !isWide && styles.productImageWrapMobile,
                          { backgroundColor: product.background },
                        ]}>
                        <Pressable
                          style={StyleSheet.absoluteFill}
                          onPress={() => setSelectedProduct(product)}
                          accessibilityRole="button"
                          accessibilityLabel={`View ${product.name}`}>
                        {product.image ? (
                          <Image
                            source={{ uri: product.image }}
                            style={styles.productImage}
                            resizeMode="cover"
                            accessibilityLabel={product.name}
                          />
                        ) : (
                          <View style={styles.productImagePlaceholder}>
                            <Text style={styles.productImagePlaceholderText}>A THOUGHTFUL FIND</Text>
                          </View>
                        )}
                        {product.badge && (
                          <View style={styles.productBadge}>
                            <Text style={styles.productBadgeText}>{product.badge}</Text>
                          </View>
                        )}
                        </Pressable>
                        <Pressable
                          style={styles.favoriteButton}
                          onPress={() =>
                            setFavorites((current) => ({
                              ...current,
                              [product.id]: !current[product.id],
                            }))
                          }
                          accessibilityRole="button"
                          accessibilityLabel={
                            favorites[product.id]
                              ? `Remove ${product.name} from saved finds`
                              : `Save ${product.name}`
                          }>
                          <Text
                            style={[
                              styles.favoriteIcon,
                              favorites[product.id] && styles.favoriteIconSaved,
                            ]}>
                            {favorites[product.id] ? '♥' : '♡'}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={styles.productDetails}>
                        <View>
                          <View style={styles.productNameRow}>
                            <Text style={styles.productName} numberOfLines={2}>
                              {product.name}
                            </Text>
                            <Text style={styles.rating}>
                              {product.shopName ? 'NEW' : `★ ${product.rating}`}
                            </Text>
                          </View>
                        </View>
                        {product.shopName && product.shopSlug ? (
                          <Pressable
                            style={styles.shopLinkButton}
                            onPress={() =>
                              router.push({
                                pathname: '/shop/[slug]',
                                params: { slug: product.shopSlug ?? '' },
                              })
                            }
                            accessibilityRole="link"
                            accessibilityLabel={`Visit ${product.shopName}`}>
                            <Text style={[styles.productCategory, styles.shopProductLink]}>
                              {product.category} · {product.shopName} ↗
                            </Text>
                          </Pressable>
                        ) : (
                          <Text style={styles.productCategory}>
                            {product.category} · BUDOLIFY PICK
                          </Text>
                        )}
                        <View style={styles.priceRow}>
                          <Text style={styles.price}>{formatPrice(product.price)}</Text>
                          {product.oldPrice ? (
                            <Text style={styles.oldPrice}>{formatPrice(product.oldPrice)}</Text>
                          ) : null}
                        </View>
                        <Pressable
                          style={styles.detailButton}
                          onPress={() => setSelectedProduct(product)}
                          accessibilityRole="button">
                          <Text style={styles.detailButtonText}>
                            {product.stock === 0 ? 'Currently unavailable' : 'View the details'}
                          </Text>
                          <Text style={styles.detailButtonArrow}>↗</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No finds just yet.</Text>
                <Text style={styles.emptyDescription}>Try another search or browse all finds.</Text>
                <Pressable
                  style={styles.emptyActionButton}
                  accessibilityRole="button"
                  onPress={() => {
                    setQuery('');
                    setActiveCategory('All finds');
                  }}>
                  <Text style={styles.emptyAction}>Show me everything →</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View
            style={[
              styles.newsletter,
              !isWide && styles.newsletterMobile,
            ]}>
            <View style={styles.newsletterCopy}>
              <Text style={styles.newsletterEyebrow}>THE GOOD STUFF, FIRST</Text>
              <Text style={styles.newsletterTitle}>A softer start to your next scroll.</Text>
              <Text style={styles.newsletterDescription}>
                Discover independent Filipino shops, thoughtful pieces, and everyday finds worth keeping.
              </Text>
            </View>
            <Pressable
              style={styles.newsletterButton}
              onPress={browseFinds}
              accessibilityRole="button">
              <Text style={styles.newsletterButtonText}>Explore the edit</Text>
              <Text style={styles.newsletterButtonArrow}>→</Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <View>
              <Text style={styles.footerBrand}>BUDOLIFY<Text style={styles.wordmarkDot}>.</Text></Text>
              <Text style={styles.footerNote}>A little joy in every delivery.</Text>
            </View>
            <Text style={styles.copyright}>Made for your everyday · © 2026 Budolify</Text>
          </View>
        </View>
      </ScrollView>
      <ProductDetailsModal
        product={selectedProduct}
        width={width}
        errorMessage={cart.error}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={addToCart}
      />
    </SafeArea>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f3eb',
  },
  page: {
    flex: 1,
    backgroundColor: '#f6f3eb',
  },
  pageContent: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  announcement: {
    width: '100%',
    minHeight: 34,
    backgroundColor: '#7d5845',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  announcementText: {
    color: '#f8f4eb',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.35,
    textAlign: 'center',
  },
  announcementArrow: {
    color: '#e8d8a8',
    fontSize: 14,
  },
  header: {
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerMobile: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  brandMobile: {
    flexShrink: 1,
  },
  wordmark: {
    color: '#203c30',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -1,
  },
  wordmarkDot: {
    color: '#a66e50',
  },
  tagline: {
    color: '#89877d',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 1,
  },
  taglineMobile: {
    display: 'none',
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: 20,
    backgroundColor: '#efeee6',
  },
  navLink: {
    color: '#315141',
    fontSize: 12,
    fontWeight: '700',
  },
  cartButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#d8d5ca',
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: '#fffefa',
  },
  cartButtonCompact: {
    width: 44,
    height: 42,
    justifyContent: 'center',
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionsMobile: {
    justifyContent: 'flex-end',
    gap: 6,
  },
  shopButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#c9c5b7',
    borderRadius: 22,
    paddingHorizontal: 13,
  },
  compactHeaderButton: {
    minHeight: 40,
    paddingHorizontal: 8,
  },
  shopButtonText: {
    color: '#315141',
    fontSize: 10,
    fontWeight: '800',
  },
  signInButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#203c30',
    paddingHorizontal: 13,
  },
  signInButtonText: {
    color: '#fffefa',
    fontSize: 11,
    fontWeight: '700',
  },
  cartLabel: {
    color: '#183d32',
    fontSize: 12,
    fontWeight: '700',
  },
  cartCount: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#e7d5a5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cartCountText: {
    color: '#203c30',
    fontSize: 10,
    fontWeight: '800',
  },
  searchWrap: {
    height: 43,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#e0ddd2',
    backgroundColor: '#fffdf8',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 20,
  },
  searchIcon: {
    color: '#7d7a70',
    fontSize: 22,
    lineHeight: 25,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#283a30',
    fontSize: 13,
    paddingVertical: 0,
  },
  clearSearch: {
    color: '#315141',
    fontSize: 12,
    fontWeight: '700',
    padding: 5,
  },
  clearSearchButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#dedfd5',
    borderRadius: 18,
    backgroundColor: '#f5f4ed',
  },
  main: {
    gap: 0,
  },
  hero: {
    width: '100%',
    backgroundColor: '#e8e9de',
    borderRadius: 22,
    overflow: 'hidden',
  },
  heroCopy: {
    flex: 1,
    minHeight: 430,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 48,
    paddingVertical: 42,
  },
  heroCopyMobile: {
    minHeight: 0,
    paddingHorizontal: 24,
    paddingVertical: 31,
  },
  heroEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 17,
  },
  eyebrowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#a66e50',
  },
  heroEyebrowText: {
    color: '#6f674f',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: '#203c30',
    fontFamily: 'Georgia',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  heroTitleAccent: {
    color: '#a66e50',
  },
  heroDescription: {
    maxWidth: 370,
    color: '#64665b',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
  },
  heroButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    backgroundColor: '#203c30',
    borderRadius: 26,
    paddingHorizontal: 18,
    marginTop: 24,
  },
  heroButtonText: {
    color: '#fffefa',
    fontSize: 13,
    fontWeight: '700',
  },
  heroButtonArrow: {
    color: '#e8d8a8',
    fontSize: 17,
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 27,
  },
  avatarStack: {
    flexDirection: 'row',
    marginRight: 9,
  },
  avatar: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#e8e9de',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
  },
  avatarOne: {
    backgroundColor: '#dfb894',
  },
  avatarTwo: {
    backgroundColor: '#d78a73',
  },
  avatarThree: {
    backgroundColor: '#96ac8c',
  },
  avatarText: {
    color: '#fffefa',
    fontSize: 8,
    fontWeight: '800',
  },
  socialProofText: {
    color: '#64665b',
    fontSize: 10,
    fontWeight: '600',
  },
  heroImageWrap: {
    flex: 1,
    minHeight: 340,
    position: 'relative',
    overflow: 'hidden',
  },
  heroImageWrapMobile: {
    flex: 0,
    height: 260,
    minHeight: 260,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  heroImageShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(20, 38, 29, 0.24)',
  },
  heroPhotoLabel: {
    position: 'absolute',
    left: 22,
    bottom: 23,
  },
  photoLabelSmall: {
    color: '#f5f4e9',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.7,
    marginBottom: 4,
  },
  photoLabelLarge: {
    color: '#fffefa',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroSticker: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 63,
    height: 63,
    borderRadius: 32,
    backgroundColor: '#e7d5a5',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '9deg' }],
  },
  stickerTop: {
    color: '#183d32',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  stickerBottom: {
    color: '#183d32',
    fontSize: 8,
    fontWeight: '800',
  },
  perks: {
    width: '100%',
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2ded2',
    marginBottom: 35,
  },
  perksMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingLeft: 22,
  },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  perkIcon: {
    color: '#a66e50',
    fontSize: 16,
    fontWeight: '700',
  },
  perkText: {
    color: '#4d564c',
    fontSize: 11,
    fontWeight: '600',
  },
  perkDivider: {
    height: 21,
    width: 1,
    backgroundColor: '#dfd9cb',
  },
  catalog: {
    width: '100%',
    marginBottom: 48,
  },
  catalogHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 17,
  },
  catalogHeadingMobile: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: 5,
  },
  shopProductsError: {
    color: '#986242',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  sectionEyebrow: {
    color: '#75806e',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 7,
  },
  sectionTitle: {
    color: '#203c30',
    fontFamily: 'Georgia',
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  resultCount: {
    color: '#85877e',
    fontSize: 11,
    fontWeight: '600',
    paddingBottom: 4,
  },
  categoryList: {
    gap: 8,
    paddingBottom: 19,
  },
  categoryChip: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d9d5c9',
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  categoryChipSelected: {
    borderColor: '#203c30',
    backgroundColor: '#203c30',
  },
  categoryText: {
    color: '#52594f',
    fontSize: 11,
    fontWeight: '600',
  },
  categoryTextSelected: {
    color: '#fffdf8',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
  },
  productCard: {
    minWidth: 0,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e4dfd3',
    backgroundColor: '#fffdf8',
  },
  productImageWrap: {
    width: '100%',
    height: 260,
    position: 'relative',
    overflow: 'hidden',
  },
  productImageWrapMobile: {
    height: 210,
  },
  productImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImagePlaceholderText: {
    color: '#7c796f',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productBadge: {
    position: 'absolute',
    top: 11,
    left: 11,
    backgroundColor: '#fffdf8',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  productBadgeText: {
    color: '#315141',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  favoriteButton: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteIcon: {
    color: '#315141',
    fontSize: 18,
  },
  favoriteIconSaved: {
    color: '#a66e50',
  },
  productDetails: {
    padding: 16,
  },
  productNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  productName: {
    flex: 1,
    color: '#26372e',
    fontFamily: 'Georgia',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  rating: {
    color: '#98694f',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  productCategory: {
    color: '#89877d',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.65,
    marginTop: 7,
  },
  shopProductLink: {
    color: '#315141',
    fontWeight: '700',
  },
  shopLinkButton: {
    alignSelf: 'flex-start',
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 15,
    backgroundColor: '#f0f0e8',
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    marginBottom: 14,
  },
  price: {
    color: '#203c30',
    fontSize: 16,
    fontWeight: '800',
  },
  oldPrice: {
    color: '#a3a39a',
    fontSize: 10,
    textDecorationLine: 'line-through',
  },
  detailButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    backgroundColor: '#f0f0e8',
    paddingHorizontal: 10,
  },
  detailButtonText: {
    color: '#315141',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.25,
  },
  detailButtonArrow: {
    color: '#89674f',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e4dfd3',
    borderRadius: 16,
    backgroundColor: '#fffdf8',
    padding: 24,
  },
  emptyTitle: {
    color: '#203c30',
    fontFamily: 'Georgia',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyDescription: {
    color: '#777c70',
    fontSize: 12,
    marginTop: 7,
    marginBottom: 14,
  },
  emptyAction: {
    color: '#315b46',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyActionButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#cfd8ca',
    borderRadius: 22,
    backgroundColor: '#f5f7f0',
  },
  newsletter: {
    width: '100%',
    minHeight: 185,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    borderRadius: 20,
    backgroundColor: '#e8e9de',
    paddingHorizontal: 28,
    paddingVertical: 26,
    marginBottom: 34,
  },
  newsletterMobile: {
    minHeight: 0,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 16,
  },
  newsletterCopy: {
    flex: 1,
  },
  newsletterEyebrow: {
    color: '#8a6c54',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  newsletterTitle: {
    color: '#203c30',
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  newsletterDescription: {
    color: '#64665b',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  newsletterButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 23,
    backgroundColor: '#203c30',
    paddingHorizontal: 14,
  },
  newsletterButtonText: {
    color: '#fffdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  newsletterButtonArrow: {
    color: '#e8d8a8',
    fontSize: 15,
  },
  footer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
  },
  footerBrand: {
    color: '#203c30',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  footerNote: {
    color: '#89877d',
    fontSize: 10,
    marginTop: 3,
  },
  copyright: {
    color: '#89877d',
    fontSize: 10,
    textAlign: 'right',
  },
});