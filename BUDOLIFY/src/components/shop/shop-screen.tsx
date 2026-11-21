import type { ImagePickerAsset } from 'expo-image-picker';
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
} from 'react-native';
import { SafeAreaView as SafeArea } from 'react-native-safe-area-context';

import { ShopProductForm } from '@/components/shop/shop-product-form';
import { ShopProfileForm } from '@/components/shop/shop-profile-form';
import { useAuth } from '@/lib/auth-context';
import {
  deleteShopImage,
  getShopImageUrl,
  uploadShopImage,
} from '@/lib/shop-images';
import { supabase } from '@/lib/supabase';
import type { Shop, ShopDraft, ShopProduct, ShopProductDraft } from '@/lib/shop-types';

type ShopTab = 'overview' | 'products' | 'settings';

async function fetchProducts(shopId: string) {
  const { data, error } = await supabase
    .from('shop_products')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShopProduct[];
}

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
        : 'Something went wrong. Please try again.';

  if (
    errorObject?.code === '42P01' ||
    errorObject?.code === 'PGRST205' ||
    /could not find the table|relation .* does not exist/i.test(message)
  ) {
    return 'Shop management is not set up. Run supabase/migrations/20261117231500_shops_and_products.sql in your Supabase SQL Editor.';
  }
  if (message.includes('shops_slug_lower_idx')) {
    return 'That shop address is already in use. Choose another one.';
  }
  if (message.includes('shops_owner_id_key')) {
    return 'You already have a shop linked to this account.';
  }
  if (message.toLowerCase().includes('bucket not found')) {
    return 'Shop image storage is not set up. Run supabase/migrations/20261117231500_shops_and_products.sql in your Supabase SQL Editor.';
  }
  return message;
}

function formatPrice(price: number) {
  return `₱${Number(price).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ShopScreen() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ShopTab>('overview');
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }

    let active = true;
    const loadShop = async () => {
      setIsLoading(true);
      setPageError(null);
      try {
        const { data, error } = await supabase
          .from('shops')
          .select('*')
          .eq('owner_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (!active) return;
        if (!data) {
          setShop(null);
          setProducts([]);
          return;
        }

        const currentShop = data as Shop;
        const shopProducts = await fetchProducts(currentShop.id);
        if (!active) return;
        setShop(currentShop);
        setProducts(shopProducts);
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
  }, [isAuthLoading, user]);

  const createShop = async (draft: ShopDraft, logo: ImagePickerAsset | null) => {
    if (!user) throw new Error('Sign in before creating a shop.');
    setPageError(null);
    setSuccessMessage(null);

    const { data, error } = await supabase
      .from('shops')
      .insert({
        ...draft,
        owner_id: user.id,
      })
      .select('*')
      .single();
    if (error) throw new Error(getErrorMessage(error));

    let createdShop = data as Shop;
    setShop(createdShop);
    setActiveTab('overview');
    setSuccessMessage('Your shop is live. Start adding products!');

    if (logo) {
      try {
        const logoPath = await uploadShopImage(user.id, createdShop.id, logo);
        const { data: updatedShop, error: logoError } = await supabase
          .from('shops')
          .update({ logo_path: logoPath, updated_at: new Date().toISOString() })
          .eq('id', createdShop.id)
          .select('*')
          .single();
        if (logoError) {
          await deleteShopImage(logoPath);
          throw logoError;
        }
        createdShop = updatedShop as Shop;
        setShop(createdShop);
      } catch (error) {
        setPageError(`Shop created, but the logo could not be uploaded: ${getErrorMessage(error)}`);
      }
    }
  };

  const saveShop = async (draft: ShopDraft, logo: ImagePickerAsset | null) => {
    if (!user || !shop) throw new Error('Your shop could not be found.');
    setPageError(null);
    setSuccessMessage(null);

    let newLogoPath: string | null = null;
    try {
      if (logo) newLogoPath = await uploadShopImage(user.id, shop.id, logo);
      const { data, error } = await supabase
        .from('shops')
        .update({
          ...draft,
          logo_path: newLogoPath ?? shop.logo_path,
          updated_at: new Date().toISOString(),
        })
        .eq('id', shop.id)
        .select('*')
        .single();
      if (error) throw error;

      const updatedShop = data as Shop;
      setShop(updatedShop);
      setSuccessMessage('Shop settings saved.');
      if (newLogoPath && shop.logo_path) {
        try {
          await deleteShopImage(shop.logo_path);
        } catch (cleanupError) {
          setPageError(`Settings saved, but the old logo could not be removed: ${getErrorMessage(cleanupError)}`);
        }
      }
    } catch (error) {
      if (newLogoPath) {
        try {
          await deleteShopImage(newLogoPath);
        } catch (cleanupError) {
          throw new Error(
            `${getErrorMessage(error)} Image cleanup also failed: ${getErrorMessage(cleanupError)}`,
          );
        }
      }
      throw new Error(getErrorMessage(error));
    }
  };

  const saveProduct = async (
    draft: ShopProductDraft,
    image: ImagePickerAsset | null,
  ) => {
    if (!user || !shop) throw new Error('Your shop could not be found.');
    setPageError(null);
    setSuccessMessage(null);

    let newImagePath: string | null = null;
    try {
      if (image) newImagePath = await uploadShopImage(user.id, shop.id, image);

      const productValues = {
        ...draft,
        shop_id: shop.id,
        updated_at: new Date().toISOString(),
      };
      const result = editingProduct
        ? await supabase
            .from('shop_products')
            .update({
              ...productValues,
              image_path: newImagePath ?? editingProduct.image_path,
            })
            .eq('id', editingProduct.id)
            .eq('shop_id', shop.id)
            .select('*')
            .single()
        : await supabase
            .from('shop_products')
            .insert({
              ...productValues,
              image_path: newImagePath,
            })
            .select('*')
            .single();
      if (result.error) throw result.error;

      const savedProduct = result.data as ShopProduct;
      setProducts((current) =>
        editingProduct
          ? current.map((item) => (item.id === savedProduct.id ? savedProduct : item))
          : [savedProduct, ...current],
      );
      setEditingProduct(null);
      setIsCreatingProduct(false);
      setSuccessMessage(editingProduct ? 'Product changes saved.' : 'Product posted to your shop.');

      if (newImagePath && editingProduct?.image_path) {
        try {
          await deleteShopImage(editingProduct.image_path);
        } catch (cleanupError) {
          setPageError(`Product saved, but the old image could not be removed: ${getErrorMessage(cleanupError)}`);
        }
      }
    } catch (error) {
      if (newImagePath) {
        try {
          await deleteShopImage(newImagePath);
        } catch (cleanupError) {
          throw new Error(
            `${getErrorMessage(error)} Image cleanup also failed: ${getErrorMessage(cleanupError)}`,
          );
        }
      }
      throw new Error(getErrorMessage(error));
    }
  };

  const deleteProduct = async (product: ShopProduct) => {
    if (!shop) return;
    if (confirmDeleteId !== product.id) {
      setConfirmDeleteId(product.id);
      return;
    }

    setBusyProductId(product.id);
    setPageError(null);
    setSuccessMessage(null);
    const { error } = await supabase
      .from('shop_products')
      .delete()
      .eq('id', product.id)
      .eq('shop_id', shop.id);
    if (error) {
      setPageError(getErrorMessage(error));
    } else {
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setSuccessMessage(`${product.name} was removed from your shop.`);
      if (product.image_path) {
        try {
          await deleteShopImage(product.image_path);
        } catch (cleanupError) {
          setPageError(`Product removed, but its image could not be removed: ${getErrorMessage(cleanupError)}`);
        }
      }
    }
    setBusyProductId(null);
    setConfirmDeleteId(null);
  };

  const refreshProducts = async () => {
    if (!shop) return;
    setPageError(null);
    try {
      setProducts(await fetchProducts(shop.id));
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  };

  return (
    <SafeArea style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.replace('/')}
              accessibilityRole="button"
              accessibilityLabel="Go to Budolify home">
              <Text style={styles.wordmark}>BUDOLIFY<Text style={styles.wordmarkDot}>.</Text></Text>
            </Pressable>
            <Pressable
              style={styles.backButton}
              onPress={() => router.replace('/')}
              accessibilityRole="button">
              <Text style={styles.backLink}>← Storefront</Text>
            </Pressable>
          </View>

          {isLoading || isAuthLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color="#285445" />
              <Text style={styles.loadingText}>Getting your shop ready…</Text>
            </View>
          ) : !shop ? (
            <View style={styles.setupSection}>
              <Text style={styles.eyebrow}>SELL ON BUDOLIFY</Text>
              <Text style={styles.title}>Open your little shop.</Text>
              <Text style={styles.description}>
                Set up your store once, then share your finds with shoppers.
              </Text>
              {pageError && <Text style={styles.errorMessage}>{pageError}</Text>}
              <ShopProfileForm
                contactEmail={user?.email ?? ''}
                onSubmit={createShop}
              />
            </View>
          ) : (
            <>
              <View style={styles.shopHeading}>
                {getShopImageUrl(shop.logo_path) ? (
                  <Image
                    source={{ uri: getShopImageUrl(shop.logo_path) ?? undefined }}
                    style={styles.shopLogo}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.shopLogoPlaceholder}>
                    <Text style={styles.shopLogoInitial}>{shop.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.shopHeadingCopy}>
                  <Text style={styles.eyebrow}>YOUR SHOP</Text>
                  <Text style={styles.title} numberOfLines={1}>{shop.name}</Text>
                  <Pressable
                    style={styles.shopSlugButton}
                    onPress={() =>
                      router.push({
                        pathname: '/shop/[slug]',
                        params: { slug: shop.slug },
                      })
                    }
                    accessibilityRole="link"
                    accessibilityLabel={`View ${shop.name} storefront`}>
                    <Text style={styles.shopSlug}>budolify.com/shop/{shop.slug} ↗</Text>
                  </Pressable>
                </View>
                <View style={[styles.statusBadge, !shop.is_published && styles.statusBadgePaused]}>
                  <Text style={[styles.statusText, !shop.is_published && styles.statusTextPaused]}>
                    {shop.is_published ? 'LIVE' : 'PAUSED'}
                  </Text>
                </View>
              </View>

              <View style={styles.tabBar}>
                {(['overview', 'products', 'settings'] as const).map((tab) => (
                  <Pressable
                    key={tab}
                    style={[styles.tab, activeTab === tab && styles.tabSelected]}
                    onPress={() => {
                      setActiveTab(tab);
                      setPageError(null);
                      setSuccessMessage(null);
                      setIsCreatingProduct(false);
                      setEditingProduct(null);
                    }}
                    accessibilityRole="button">
                    <Text style={[styles.tabText, activeTab === tab && styles.tabTextSelected]}>
                      {tab === 'overview' ? 'Dashboard' : tab === 'products' ? 'Products' : 'Settings'}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={styles.tab}
                  onPress={() => router.push('/my-shop/orders')}
                  accessibilityRole="link">
                  <Text style={styles.tabText}>Orders</Text>
                </Pressable>
              </View>

              {pageError && <Text style={styles.errorMessage}>{pageError}</Text>}
              {successMessage && <Text style={styles.successMessage}>{successMessage}</Text>}

              {activeTab === 'overview' && (
                <View style={styles.section}>
                  <View style={styles.sectionHeading}>
                    <View>
                      <Text style={styles.sectionEyebrow}>SHOP OVERVIEW</Text>
                      <Text style={styles.sectionTitle}>Your shop at a glance.</Text>
                    </View>
                    <Pressable
                      style={styles.primarySmallButton}
                      onPress={() => {
                        setActiveTab('products');
                        setIsCreatingProduct(true);
                        setSuccessMessage(null);
                      }}
                      accessibilityRole="button">
                      <Text style={styles.primarySmallButtonText}>＋ Add product</Text>
                    </Pressable>
                  </View>

                  <View style={styles.statsGrid}>
                    <StatCard label="Products" value={String(products.length)} />
                    <StatCard
                      label="Live listings"
                      value={String(products.filter((product) => product.is_published).length)}
                    />
                    <StatCard
                      label="Items in stock"
                      value={String(products.reduce((total, product) => total + product.inventory, 0))}
                    />
                  </View>

                  <View style={styles.infoCard}>
                    <View style={styles.infoCopy}>
                      <Text style={styles.infoTitle}>Your storefront is {shop.is_published ? 'live' : 'paused'}.</Text>
                      <Text style={styles.infoDescription}>
                        {shop.is_published
                          ? 'Published products can be discovered on the Budolify homepage.'
                          : 'Turn publishing back on in settings to show your shop to shoppers.'}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() =>
                        router.push({
                          pathname: '/shop/[slug]',
                          params: { slug: shop.slug },
                        })
                      }
                      accessibilityRole="link">
                      <Text style={styles.secondaryButtonText}>View your shop</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.sectionEyebrow}>RECENT PRODUCTS</Text>
                  {products.length ? (
                    <View style={styles.productList}>
                      {products.slice(0, 3).map((product) => (
                        <ProductRow
                          key={product.id}
                          product={product}
                          onEdit={() => {
                            setActiveTab('products');
                            setEditingProduct(product);
                            setSuccessMessage(null);
                          }}
                        />
                      ))}
                    </View>
                  ) : (
                    <EmptyProducts onAdd={() => {
                      setActiveTab('products');
                      setIsCreatingProduct(true);
                    }} />
                  )}
                </View>
              )}

              {activeTab === 'products' && (
                <View style={styles.section}>
                  <View style={styles.sectionHeading}>
                    <View>
                      <Text style={styles.sectionEyebrow}>YOUR CATALOG</Text>
                      <Text style={styles.sectionTitle}>Products.</Text>
                    </View>
                    {!isCreatingProduct && !editingProduct && (
                      <Pressable
                        style={styles.primarySmallButton}
                        onPress={() => {
                          setIsCreatingProduct(true);
                          setPageError(null);
                          setSuccessMessage(null);
                        }}
                        accessibilityRole="button">
                        <Text style={styles.primarySmallButtonText}>＋ Add product</Text>
                      </Pressable>
                    )}
                  </View>

                  {(isCreatingProduct || editingProduct) && (
                    <ShopProductForm
                      key={editingProduct?.id ?? 'new'}
                      product={editingProduct}
                      onCancel={() => {
                        setIsCreatingProduct(false);
                        setEditingProduct(null);
                      }}
                      onSubmit={saveProduct}
                    />
                  )}

                  {products.length ? (
                    <View style={styles.productList}>
                      {products.map((product) => (
                        <ProductRow
                          key={product.id}
                          product={product}
                          busy={busyProductId === product.id}
                          confirmingDelete={confirmDeleteId === product.id}
                          onEdit={() => {
                            setEditingProduct(product);
                            setIsCreatingProduct(false);
                            setPageError(null);
                            setSuccessMessage(null);
                          }}
                          onDelete={() => void deleteProduct(product)}
                          onCancelDelete={() => setConfirmDeleteId(null)}
                        />
                      ))}
                    </View>
                  ) : !isCreatingProduct ? (
                    <EmptyProducts onAdd={() => setIsCreatingProduct(true)} />
                  ) : null}
                </View>
              )}

              {activeTab === 'settings' && (
                <View style={styles.section}>
                  <Text style={styles.sectionEyebrow}>SHOP SETTINGS</Text>
                  <Text style={styles.sectionTitle}>Make it yours.</Text>
                  <Text style={styles.description}>
                    Update your shop details, contact information, logo, and visibility.
                  </Text>
                  <ShopProfileForm
                    key={`${shop.id}-${shop.updated_at}`}
                    shop={shop}
                    contactEmail={user?.email ?? ''}
                    onSubmit={saveShop}
                  />
                </View>
              )}
            </>
          )}

          {!isLoading && !isAuthLoading && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>A little joy in every delivery.</Text>
              <Pressable
                style={styles.refreshButton}
                onPress={() => void refreshProducts()}
                accessibilityRole="button">
                <Text style={styles.refreshText}>Refresh shop data</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeArea>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyProducts({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>Your shelf is waiting.</Text>
      <Text style={styles.emptyDescription}>Add your first product and it can appear on the storefront.</Text>
      <Pressable style={styles.emptyActionButton} onPress={onAdd} accessibilityRole="button">
        <Text style={styles.emptyAction}>Add your first product →</Text>
      </Pressable>
    </View>
  );
}

type ProductRowProps = {
  product: ShopProduct;
  busy?: boolean;
  confirmingDelete?: boolean;
  onEdit: () => void;
  onDelete?: () => void;
  onCancelDelete?: () => void;
};

function ProductRow({
  product,
  busy = false,
  confirmingDelete = false,
  onEdit,
  onDelete,
  onCancelDelete,
}: ProductRowProps) {
  const imageUri = getShopImageUrl(product.image_path);
  return (
    <View style={styles.productRow}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.productThumbnail} resizeMode="cover" />
      ) : (
        <View style={styles.productThumbnailPlaceholder}>
          <Text style={styles.placeholderIcon}>✦</Text>
        </View>
      )}
      <View style={styles.productRowContent}>
        <View style={styles.productRowTop}>
          <Text style={styles.productRowName} numberOfLines={1}>{product.name}</Text>
          <Text style={styles.productRowPrice}>{formatPrice(product.price)}</Text>
        </View>
        <Text style={styles.productRowMeta} numberOfLines={1}>
          {product.category} · {product.inventory} in stock · {product.is_published ? 'Live' : 'Draft'}
        </Text>
        <View style={styles.productActions}>
          <Pressable
            style={styles.productActionButton}
            onPress={onEdit}
            disabled={busy}
            accessibilityRole="button">
            <Text style={styles.productAction}>Edit</Text>
          </Pressable>
          {onDelete && (
            confirmingDelete ? (
              <>
                <Pressable
                  style={styles.productDeleteButton}
                  onPress={onDelete}
                  disabled={busy}
                  accessibilityRole="button">
                  <Text style={styles.deleteAction}>{busy ? 'Removing…' : 'Confirm remove'}</Text>
                </Pressable>
                <Pressable
                  style={styles.productActionButton}
                  onPress={onCancelDelete}
                  disabled={busy}
                  accessibilityRole="button">
                  <Text style={styles.productAction}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={styles.productDeleteButton}
                onPress={onDelete}
                disabled={busy}
                accessibilityRole="button">
                <Text style={styles.deleteAction}>Remove</Text>
              </Pressable>
            )
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f7f2',
  },
  page: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  content: {
    width: '100%',
    maxWidth: 840,
  },
  topBar: {
    minHeight: 72,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  wordmark: {
    color: '#183d32',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -1,
  },
  wordmarkDot: {
    color: '#ec694b',
  },
  backLink: {
    color: '#285445',
    fontSize: 11,
    fontWeight: '700',
  },
  backButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#d8ddd1',
    borderRadius: 22,
    backgroundColor: '#fffefa',
  },
  setupSection: {
    gap: 12,
    paddingBottom: 10,
  },
  eyebrow: {
    color: '#75806e',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: '#193c31',
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  description: {
    color: '#687466',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 5,
  },
  loading: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  loadingText: {
    color: '#687466',
    fontSize: 12,
  },
  shopHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 20,
  },
  shopLogo: {
    width: 66,
    height: 66,
    borderRadius: 18,
    backgroundColor: '#e9eee2',
  },
  shopLogoPlaceholder: {
    width: 66,
    height: 66,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d8ed80',
  },
  shopLogoInitial: {
    color: '#183d32',
    fontSize: 21,
    fontWeight: '800',
  },
  shopHeadingCopy: {
    flex: 1,
    gap: 2,
  },
  shopSlug: {
    color: '#85877e',
    fontSize: 10,
  },
  shopSlugButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#d8ddd1',
    borderRadius: 18,
    backgroundColor: '#fffefa',
  },
  statusBadge: {
    borderRadius: 20,
    backgroundColor: '#e7f2df',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgePaused: {
    backgroundColor: '#f3e8d8',
  },
  statusText: {
    color: '#3a6949',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  statusTextPaused: {
    color: '#936a35',
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 20,
  },
  tab: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dfe2d7',
    borderRadius: 21,
    backgroundColor: '#fffefa',
    paddingHorizontal: 16,
  },
  tabSelected: {
    borderColor: '#183d32',
    backgroundColor: '#183d32',
  },
  tabText: {
    color: '#73796e',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextSelected: {
    color: '#fffefa',
    fontWeight: '800',
  },
  errorMessage: {
    color: '#a54032',
    backgroundColor: '#fff0ec',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
    marginBottom: 14,
  },
  successMessage: {
    color: '#2c6548',
    backgroundColor: '#edf4e9',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
    marginBottom: 14,
  },
  section: {
    gap: 16,
    paddingBottom: 12,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionEyebrow: {
    color: '#75806e',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: '#193c31',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  primarySmallButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#183d32',
    paddingHorizontal: 12,
  },
  primarySmallButtonText: {
    color: '#fffefa',
    fontSize: 11,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: 105,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 12,
    backgroundColor: '#fffefa',
    padding: 14,
  },
  statValue: {
    color: '#193c31',
    fontSize: 23,
    fontWeight: '800',
  },
  statLabel: {
    color: '#75806e',
    fontSize: 10,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    backgroundColor: '#e8eee3',
    padding: 15,
  },
  infoCopy: {
    flex: 1,
    gap: 5,
  },
  infoTitle: {
    color: '#193c31',
    fontSize: 13,
    fontWeight: '800',
  },
  infoDescription: {
    color: '#687466',
    fontSize: 10,
    lineHeight: 15,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#b7c5b2',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: '#285445',
    fontSize: 10,
    fontWeight: '700',
  },
  productList: {
    gap: 10,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 12,
    backgroundColor: '#fffefa',
    padding: 11,
  },
  productThumbnail: {
    width: 62,
    height: 62,
    borderRadius: 9,
    backgroundColor: '#e9eee2',
  },
  productThumbnailPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9eee2',
  },
  placeholderIcon: {
    color: '#5e7660',
    fontSize: 20,
  },
  productRowContent: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  productRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  productRowName: {
    flex: 1,
    color: '#26372e',
    fontSize: 12,
    fontWeight: '700',
  },
  productRowPrice: {
    color: '#193c31',
    fontSize: 11,
    fontWeight: '800',
  },
  productRowMeta: {
    color: '#85877e',
    fontSize: 10,
  },
  productActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 5,
  },
  productActionButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d5ddd0',
    borderRadius: 18,
    backgroundColor: '#f5f7f0',
  },
  productDeleteButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#efd0c8',
    borderRadius: 18,
    backgroundColor: '#fff8f5',
  },
  productAction: {
    color: '#285445',
    fontSize: 10,
    fontWeight: '700',
  },
  deleteAction: {
    color: '#a54032',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyCard: {
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderStyle: 'dashed',
    borderRadius: 14,
    backgroundColor: '#fffefa',
    paddingHorizontal: 18,
    paddingVertical: 25,
  },
  emptyTitle: {
    color: '#26372e',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyDescription: {
    color: '#85877e',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
  },
  emptyAction: {
    color: '#285445',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  emptyActionButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#cfd8ca',
    borderRadius: 20,
    backgroundColor: '#f5f7f0',
    marginTop: 5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 20,
    marginTop: 8,
    borderTopWidth: 1,
    borderColor: '#e7e5dc',
  },
  footerText: {
    color: '#85877e',
    fontSize: 10,
  },
  refreshText: {
    color: '#285445',
    fontSize: 10,
    fontWeight: '700',
  },
  refreshButton: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#d5ddd0',
    borderRadius: 20,
    backgroundColor: '#fffefa',
  },
});
