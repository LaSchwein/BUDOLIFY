import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView as SafeArea } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type UserRole = 'customer' | 'admin' | 'super_admin';

type ManagedProfile = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  is_suspended: boolean;
  created_at: string;
};

type ProfileDraft = Pick<ManagedProfile, 'full_name' | 'phone'>;
type AdminTab = 'products' | 'shops' | 'users';
type RecordFilter = 'all' | 'active' | 'archived';

type AdminShop = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  is_published: boolean;
  is_archived: boolean;
};

type AdminProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  is_published: boolean;
  is_archived: boolean;
  shops: { name: string } | { name: string }[] | null;
};

type ConfirmAction = {
  kind: 'archive-product' | 'restore-product' | 'delete-product' |
    'archive-shop' | 'restore-shop' | 'disable-user' | 'enable-user';
  id: string;
  label: string;
};

const roles: UserRole[] = ['customer', 'admin', 'super_admin'];

export default function AdminScreen() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [profiles, setProfiles] = useState<ManagedProfile[]>([]);
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({});
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('products');
  const [recordFilter, setRecordFilter] = useState<RecordFilter>('all');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ConfirmAction | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }

    let active = true;

    const loadDashboard = async () => {
      setIsLoading(true);
      setPageError(null);
      const { data: currentProfile, error: roleError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!active) return;
      if (roleError) {
        setPageError(roleError.message);
        setIsLoading(false);
        return;
      }

      if (currentProfile.role !== 'admin' && currentProfile.role !== 'super_admin') {
        setIsLoading(false);
        router.replace('/');
        return;
      }

      setIsSuperAdmin(currentProfile.role === 'super_admin');
      const [usersResult, shopsResult, productsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,email,full_name,phone,role,is_suspended,created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('shops')
          .select('id,name,slug,owner_id,is_published,is_archived')
          .order('created_at', { ascending: false }),
        supabase
          .from('shop_products')
          .select('id,name,category,price,is_published,is_archived,shops!inner(name)')
          .order('created_at', { ascending: false }),
      ]);

      if (!active) return;
      const loadError = usersResult.error ?? shopsResult.error ?? productsResult.error;
      if (loadError) {
        setPageError(loadError.message);
        setIsLoading(false);
        return;
      }

      const users = (usersResult.data ?? []) as ManagedProfile[];
      setProfiles(users);
      setShops((shopsResult.data ?? []) as AdminShop[]);
      setProducts((productsResult.data ?? []) as AdminProduct[]);
      setDrafts(
        Object.fromEntries(
          users.map((profile) => [
            profile.id,
            {
              full_name: profile.full_name,
              phone: profile.phone,
            },
          ]),
        ),
      );
      setIsLoading(false);
    };

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [isAuthLoading, user]);

  const filteredProfiles = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      const matchesSearch = !normalizedSearch ||
        profile.email.toLowerCase().includes(normalizedSearch) ||
        profile.full_name.toLowerCase().includes(normalizedSearch) ||
        profile.phone.toLowerCase().includes(normalizedSearch);
      const matchesStatus = recordFilter === 'all' ||
        (recordFilter === 'archived' ? profile.is_suspended : !profile.is_suspended);
      return matchesSearch && matchesStatus;
    });
  }, [profiles, search, recordFilter]);

  const filteredShops = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return shops.filter((shop) => {
      const matchesSearch = !normalizedSearch ||
        shop.name.toLowerCase().includes(normalizedSearch) ||
        shop.slug.toLowerCase().includes(normalizedSearch);
      const matchesStatus = recordFilter === 'all' ||
        (recordFilter === 'archived' ? shop.is_archived : !shop.is_archived);
      return matchesSearch && matchesStatus;
    });
  }, [shops, search, recordFilter]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return products.filter((product) => {
      const shopName = Array.isArray(product.shops)
        ? product.shops[0]?.name ?? ''
        : product.shops?.name ?? '';
      const matchesSearch = !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.category.toLowerCase().includes(normalizedSearch) ||
        shopName.toLowerCase().includes(normalizedSearch);
      const matchesStatus = recordFilter === 'all' ||
        (recordFilter === 'archived' ? product.is_archived : !product.is_archived);
      return matchesSearch && matchesStatus;
    });
  }, [products, search, recordFilter]);

  const updateDraft = (
    profile: ManagedProfile,
    field: keyof ProfileDraft,
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [profile.id]: {
        full_name: current[profile.id]?.full_name ?? profile.full_name,
        phone: current[profile.id]?.phone ?? profile.phone,
        [field]: value,
      },
    }));
  };

  const saveProfile = async (profile: ManagedProfile) => {
    const draft = drafts[profile.id];
    if (!draft) return;
    setActiveAction(profile.id);
    setPageError(null);
    setActionMessage(null);

    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: draft.full_name.trim(),
        phone: draft.phone.trim(),
      })
      .eq('id', profile.id)
      .select('id,email,full_name,phone,role,is_suspended,created_at')
      .single();

    if (error) {
      setPageError(error.message);
    } else {
      const updatedProfile = data as ManagedProfile;
      setProfiles((current) =>
        current.map((item) => (item.id === profile.id ? updatedProfile : item)),
      );
      setActionMessage(`Saved profile for ${updatedProfile.email}.`);
    }
    setActiveAction(null);
  };

  const changeRole = async (profile: ManagedProfile, role: UserRole) => {
    if (profile.role === role || profile.id === user?.id) return;
    setActiveAction(profile.id);
    setPageError(null);
    setActionMessage(null);

    const { error } = await supabase.rpc('set_user_role', {
      target_user_id: profile.id,
      new_role: role,
    });

    if (error) {
      setPageError(error.message);
    } else {
      setProfiles((current) =>
        current.map((item) => (item.id === profile.id ? { ...item, role } : item)),
      );
      setActionMessage(`Updated ${profile.email} to ${role.replace('_', ' ')}.`);
    }
    setActiveAction(null);
  };

  const requestUserStatus = (profile: ManagedProfile) => {
    if (profile.id === user?.id || profile.role === 'super_admin') return;
    setPendingAction({
      kind: profile.is_suspended ? 'enable-user' : 'disable-user',
      id: profile.id,
      label: profile.email,
    });
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setActiveAction(action.id);
    setPageError(null);
    setActionMessage(null);

    try {
      if (action.kind === 'archive-product' || action.kind === 'restore-product') {
        const isArchived = action.kind === 'archive-product';
        const { error } = await supabase
          .from('shop_products')
          .update({ is_archived: isArchived, ...(isArchived ? { is_published: false } : {}) })
          .eq('id', action.id);
        if (error) throw error;
        setProducts((current) =>
          current.map((product) =>
            product.id === action.id
              ? { ...product, is_archived: isArchived, ...(isArchived ? { is_published: false } : {}) }
              : product,
          ),
        );
        setActionMessage(`${action.label} has been ${isArchived ? 'archived' : 'restored'}.`);
      } else if (action.kind === 'delete-product') {
        const { error } = await supabase.from('shop_products').delete().eq('id', action.id);
        if (error) throw error;
        setProducts((current) => current.filter((product) => product.id !== action.id));
        setActionMessage(`${action.label} was permanently removed.`);
      } else if (action.kind === 'archive-shop' || action.kind === 'restore-shop') {
        const isArchived = action.kind === 'archive-shop';
        const { error } = await supabase
          .from('shops')
          .update({ is_archived: isArchived, ...(isArchived ? { is_published: false } : {}) })
          .eq('id', action.id);
        if (error) throw error;
        setShops((current) =>
          current.map((shop) =>
            shop.id === action.id
              ? { ...shop, is_archived: isArchived, ...(isArchived ? { is_published: false } : {}) }
              : shop,
          ),
        );
        setActionMessage(`${action.label} has been ${isArchived ? 'archived' : 'restored'}.`);
      } else {
        const accountAction = action.kind === 'disable-user' ? 'disable' : 'enable';
        const { error } = await supabase.functions.invoke('manage-user', {
          body: { action: accountAction, targetUserId: action.id },
        });
        if (error) throw error;
        setProfiles((current) =>
          current.map((profile) =>
            profile.id === action.id
              ? { ...profile, is_suspended: accountAction === 'disable' }
              : profile,
          ),
        );
        setActionMessage(
          `${action.label} has been ${accountAction === 'disable' ? 'deactivated' : 'reactivated'}.`,
        );
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The moderation action failed.');
    } finally {
      setActiveAction(null);
      setPendingAction(null);
    }
  };

  return (
    <SafeArea style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.replace('/')}
              accessibilityRole="link"
              accessibilityLabel="Go to Budolify home">
              <Text style={styles.wordmark}>BUDOLIFY<Text style={styles.wordmarkDot}>.</Text></Text>
            </Pressable>
            <Pressable
              style={styles.profileButton}
              onPress={() => router.replace('/profile')}
              accessibilityRole="button">
              <Text style={styles.backLink}>← My profile</Text>
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>BUDOLIFY · ADMIN</Text>
          <Text style={styles.title}>The back office.</Text>
          <Text style={styles.description}>
            Review shops, product listings, and member accounts from one place.
          </Text>

          <View style={styles.metrics}>
            <MetricCard label="Total users" value={profiles.length} />
            <MetricCard
              label="Active shops"
              value={shops.filter((shop) => shop.is_published && !shop.is_archived).length}
            />
            <MetricCard
              label="Listed products"
              value={products.filter((product) => product.is_published && !product.is_archived).length}
            />
          </View>

          <View style={styles.tabs}>
            {([
              ['products', 'Products'],
              ['shops', 'Shops'],
              ['users', 'Users'],
            ] as const).map(([tab, label]) => (
              <Pressable
                key={tab}
                accessibilityRole="button"
                accessibilityState={{ selected: activeTab === tab }}
                onPress={() => {
                  setActiveTab(tab);
                  setRecordFilter('all');
                }}
                style={[styles.tab, activeTab === tab && styles.tabSelected]}>
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextSelected]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            accessibilityLabel={`Search ${activeTab}`}
            value={search}
            onChangeText={setSearch}
            placeholder={
              activeTab === 'users'
                ? 'Search by name, email, or phone...'
                : activeTab === 'shops'
                  ? 'Search shops by name or slug...'
                  : 'Search products by name, category, or shop...'
            }
            placeholderTextColor="#85877e"
            style={styles.searchInput}
          />

          <View style={styles.filters}>
            {([
              ['all', 'All'],
              ['active', activeTab === 'products' ? 'Not archived' : 'Active'],
              ['archived', activeTab === 'users' ? 'Suspended' : 'Archived'],
            ] as const).map(([filter, label]) => (
              <Pressable
                key={filter}
                accessibilityRole="button"
                accessibilityState={{ selected: recordFilter === filter }}
                onPress={() => setRecordFilter(filter)}
                style={[styles.filterChip, recordFilter === filter && styles.filterChipSelected]}>
                <Text
                  style={[
                    styles.filterChipText,
                    recordFilter === filter && styles.filterChipTextSelected,
                  ]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {pageError && <Text style={styles.errorMessage}>{pageError}</Text>}
          {actionMessage && <Text style={styles.successMessage}>{actionMessage}</Text>}

          {isLoading ? (
            <Text style={styles.loadingText}>Loading dashboard…</Text>
          ) : activeTab === 'products' ? (
            filteredProducts.length ? (
              <View style={styles.userList}>
                {filteredProducts.map((product) => {
                  const shopName = Array.isArray(product.shops)
                    ? product.shops[0]?.name ?? 'Independent shop'
                    : product.shops?.name ?? 'Independent shop';
                  const isBusy = activeAction === product.id;
                  return (
                    <View key={product.id} style={styles.userCard}>
                      <ModerationHeading
                        title={product.name}
                        subtitle={`${product.category} · ${shopName} · ₱${Number(product.price).toLocaleString('en-PH')}`}
                        isArchived={product.is_archived}
                      />
                      <View style={styles.actions}>
                        <Pressable
                          style={[styles.statusButton, isBusy && styles.buttonDisabled]}
                          disabled={isBusy}
                          accessibilityRole="button"
                          onPress={() =>
                            setPendingAction({
                              kind: product.is_archived ? 'restore-product' : 'archive-product',
                              id: product.id,
                              label: product.name,
                            })
                          }>
                          <Text style={styles.statusButtonText}>
                            {product.is_archived ? 'Restore listing' : 'Archive listing'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.deleteButton, isBusy && styles.buttonDisabled]}
                          disabled={isBusy}
                          accessibilityRole="button"
                          onPress={() =>
                            setPendingAction({
                              kind: 'delete-product',
                              id: product.id,
                              label: product.name,
                            })
                          }>
                          <Text style={styles.deleteButtonText}>Permanently remove</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <EmptyState label="No matching products." />
            )
          ) : activeTab === 'shops' ? (
            filteredShops.length ? (
              <View style={styles.userList}>
                {filteredShops.map((shop) => {
                  const isBusy = activeAction === shop.id;
                  return (
                    <View key={shop.id} style={styles.userCard}>
                      <ModerationHeading
                        title={shop.name}
                        subtitle={`/${shop.slug} · ${shop.is_published ? 'Published' : 'Unpublished'}`}
                        isArchived={shop.is_archived}
                      />
                      <View style={styles.actions}>
                        <Pressable
                          style={[styles.statusButton, isBusy && styles.buttonDisabled]}
                          disabled={isBusy}
                          accessibilityRole="button"
                          onPress={() =>
                            setPendingAction({
                              kind: shop.is_archived ? 'restore-shop' : 'archive-shop',
                              id: shop.id,
                              label: shop.name,
                            })
                          }>
                          <Text style={styles.statusButtonText}>
                            {shop.is_archived ? 'Restore shop' : 'Archive shop'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <EmptyState label="No matching shops." />
            )
          ) : filteredProfiles.length > 0 ? (
              <View style={styles.userList}>
                {filteredProfiles.map((profile) => {
                  const draft = drafts[profile.id] ?? {
                    full_name: profile.full_name,
                    phone: profile.phone,
                  };
                  const isBusy = activeAction === profile.id;
                  return (
                    <View key={profile.id} style={styles.userCard}>
                      <View style={styles.userHeading}>
                        <View style={styles.userAvatar}>
                          <Text style={styles.userAvatarText}>
                            {(profile.full_name || profile.email).slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.userIdentity}>
                          <Text style={styles.userName} numberOfLines={1}>
                            {profile.full_name || 'New member'}
                          </Text>
                          <Text style={styles.userEmail} numberOfLines={1}>
                            {profile.email}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            profile.is_suspended && styles.statusBadgeDisabled,
                          ]}>
                          <Text
                            style={[
                              styles.statusText,
                              profile.is_suspended && styles.statusTextDisabled,
                            ]}>
                            {profile.is_suspended ? 'DISABLED' : 'ACTIVE'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.detailsGrid}>
                        <AdminField
                          label="Full name"
                          value={draft.full_name}
                          onChangeText={(value) => updateDraft(profile, 'full_name', value)}
                        />
                        <AdminField
                          label="Phone"
                          value={draft.phone}
                          onChangeText={(value) => updateDraft(profile, 'phone', value)}
                        />
                        <View style={styles.readOnlyField}>
                          <Text style={styles.fieldLabel}>Joined</Text>
                          <Text style={styles.readOnlyValue}>
                            {new Date(profile.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>

                      {isSuperAdmin && (
                        <>
                          <Text style={styles.roleLabel}>ACCOUNT ROLE</Text>
                          <View style={styles.roleChoices}>
                            {roles.map((role) => {
                              const selected = profile.role === role;
                              return (
                                <Pressable
                                  key={role}
                                  style={[styles.roleChip, selected && styles.roleChipSelected]}
                                  onPress={() => void changeRole(profile, role)}
                                  disabled={isBusy || profile.id === user?.id}
                                  accessibilityRole="button">
                                  <Text
                                    style={[
                                      styles.roleChipText,
                                      selected && styles.roleChipTextSelected,
                                    ]}>
                                    {role.replace('_', ' ')}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      )}

                      <View style={styles.actions}>
                        <Pressable
                          style={[styles.saveButton, isBusy && styles.buttonDisabled]}
                          onPress={() => void saveProfile(profile)}
                          disabled={isBusy}
                          accessibilityRole="button">
                          <Text style={styles.saveButtonText}>
                            {isBusy ? 'Working…' : 'Save details'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.statusButton,
                            profile.is_suspended && styles.enableButton,
                            (isBusy || profile.role === 'super_admin' || profile.id === user?.id) &&
                              styles.buttonDisabled,
                          ]}
                          onPress={() => requestUserStatus(profile)}
                          disabled={
                            isBusy || profile.role === 'super_admin' || profile.id === user?.id
                          }
                          accessibilityRole="button">
                          <Text
                            style={[
                              styles.statusButtonText,
                              profile.is_suspended && styles.enableButtonText,
                            ]}>
                            {profile.is_suspended ? 'Enable account' : 'Disable account'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <EmptyState label="No matching users." />
            )}
        </View>
      </ScrollView>
      <Modal
        visible={pendingAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingAction(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.eyebrow}>PLEASE CONFIRM</Text>
            <Text style={styles.confirmTitle}>
              {pendingAction?.kind === 'delete-product'
                ? 'Permanently remove this listing?'
                : pendingAction?.kind === 'disable-user'
                  ? 'Deactivate this account?'
                  : pendingAction?.kind === 'enable-user'
                    ? 'Reactivate this account?'
                    : pendingAction?.kind === 'archive-shop'
                      ? 'Archive this shop?'
                      : pendingAction?.kind === 'restore-shop'
                        ? 'Restore this shop?'
                        : pendingAction?.kind === 'archive-product'
                          ? 'Archive this listing?'
                          : 'Restore this listing?'}
            </Text>
            <Text style={styles.confirmDescription}>
              {pendingAction?.label}
              {pendingAction?.kind === 'delete-product'
                ? ' will be deleted permanently. This cannot be undone.'
                : pendingAction?.kind === 'archive-shop' || pendingAction?.kind === 'archive-product'
                  ? ' will no longer be publicly listed.'
                  : pendingAction?.kind === 'disable-user'
                    ? ' will lose access until reactivated.'
                    : ''}
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.cancelButton}
                disabled={activeAction !== null}
                accessibilityRole="button"
                onPress={() => setPendingAction(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, activeAction !== null && styles.buttonDisabled]}
                disabled={activeAction !== null}
                accessibilityRole="button"
                onPress={() => void confirmPendingAction()}>
                <Text style={styles.confirmButtonText}>
                  {activeAction ? 'Working…' : 'Confirm action'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeArea>
  );
}

type AdminFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ModerationHeading({
  title,
  subtitle,
  isArchived,
}: {
  title: string;
  subtitle: string;
  isArchived: boolean;
}) {
  return (
    <View style={styles.userHeading}>
      <View style={styles.userIdentity}>
        <Text style={styles.userName}>{title}</Text>
        <Text style={styles.userEmail}>{subtitle}</Text>
      </View>
      <View style={[styles.statusBadge, isArchived && styles.statusBadgeDisabled]}>
        <Text style={[styles.statusText, isArchived && styles.statusTextDisabled]}>
          {isArchived ? 'ARCHIVED' : 'ACTIVE'}
        </Text>
      </View>
    </View>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{label}</Text>
      <Text style={styles.emptyDescription}>Try changing your search or filter.</Text>
    </View>
  );
}

function AdminField({ label, value, onChangeText, autoCapitalize }: AdminFieldProps) {
  return (
    <View style={styles.adminField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize={autoCapitalize}
        placeholder={label}
        placeholderTextColor="#85877e"
        style={styles.fieldInput}
      />
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
    maxWidth: 1000,
  },
  topBar: {
    minHeight: 78,
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
    color: '#315b46',
    fontSize: 12,
    fontWeight: '700',
  },
  profileButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#d8ddd1',
    borderRadius: 22,
    backgroundColor: '#fffefa',
  },
  eyebrow: {
    color: '#75806e',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: '#193c31',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 6,
  },
  description: {
    color: '#687466',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
    marginBottom: 19,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  metricCard: {
    flex: 1,
    minWidth: 130,
    minHeight: 88,
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#e9eee2',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  metricValue: {
    color: '#193c31',
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#687466',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dedfd5',
    borderRadius: 20,
    paddingHorizontal: 15,
  },
  tabSelected: {
    borderColor: '#183d32',
    backgroundColor: '#183d32',
  },
  tabText: {
    color: '#52594f',
    fontSize: 11,
    fontWeight: '700',
  },
  tabTextSelected: {
    color: '#fffefa',
  },
  searchInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#dedfd5',
    borderRadius: 9,
    backgroundColor: '#fffefa',
    color: '#26372e',
    fontSize: 12,
    paddingHorizontal: 12,
    marginBottom: 15,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 15,
  },
  filterChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dedfd5',
    borderRadius: 16,
    paddingHorizontal: 10,
  },
  filterChipSelected: {
    borderColor: '#d8ed80',
    backgroundColor: '#d8ed80',
  },
  filterChipText: {
    color: '#52594f',
    fontSize: 9,
    fontWeight: '700',
  },
  filterChipTextSelected: {
    color: '#183d32',
  },
  errorMessage: {
    color: '#a54032',
    backgroundColor: '#fff0ec',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
    marginBottom: 13,
  },
  successMessage: {
    color: '#2c6548',
    backgroundColor: '#edf4e9',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
    marginBottom: 13,
  },
  loadingText: {
    color: '#687466',
    fontSize: 13,
    padding: 24,
  },
  userList: {
    gap: 13,
  },
  userCard: {
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 18,
    backgroundColor: '#fffefa',
    padding: 15,
  },
  userHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 15,
  },
  userAvatar: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d8ed80',
  },
  userAvatarText: {
    color: '#183d32',
    fontSize: 15,
    fontWeight: '800',
  },
  userIdentity: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: '#26372e',
    fontSize: 13,
    fontWeight: '700',
  },
  userEmail: {
    color: '#85877e',
    fontSize: 10,
    marginTop: 3,
  },
  statusBadge: {
    borderRadius: 20,
    backgroundColor: '#edf4e9',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusBadgeDisabled: {
    backgroundColor: '#fff0ec',
  },
  statusText: {
    color: '#2c6548',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  statusTextDisabled: {
    color: '#a54032',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  adminField: {
    width: '48%',
    flexGrow: 1,
    minWidth: 200,
    gap: 5,
  },
  fieldLabel: {
    color: '#687466',
    fontSize: 9,
    fontWeight: '700',
  },
  fieldInput: {
    minHeight: 37,
    borderWidth: 1,
    borderColor: '#e2e2da',
    borderRadius: 7,
    backgroundColor: '#fffefa',
    color: '#26372e',
    fontSize: 11,
    paddingHorizontal: 9,
  },
  readOnlyField: {
    width: '48%',
    flexGrow: 1,
    minWidth: 200,
    gap: 5,
    justifyContent: 'center',
  },
  readOnlyValue: {
    minHeight: 37,
    textAlignVertical: 'center',
    borderWidth: 1,
    borderColor: '#e2e2da',
    borderRadius: 7,
    backgroundColor: '#f5f5ef',
    color: '#767c70',
    fontSize: 11,
    paddingHorizontal: 9,
    paddingVertical: 10,
  },
  roleLabel: {
    color: '#687466',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 15,
    marginBottom: 7,
  },
  roleChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dedfd5',
    borderRadius: 16,
    paddingHorizontal: 10,
  },
  roleChipSelected: {
    backgroundColor: '#183d32',
    borderColor: '#183d32',
  },
  roleChipText: {
    color: '#52594f',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  roleChipTextSelected: {
    color: '#fffefa',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  saveButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#183d32',
    paddingHorizontal: 12,
  },
  saveButtonText: {
    color: '#fffefa',
    fontSize: 10,
    fontWeight: '700',
  },
  statusButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#edc8bd',
    borderRadius: 21,
    paddingHorizontal: 12,
  },
  statusButtonText: {
    color: '#a54032',
    fontSize: 10,
    fontWeight: '700',
  },
  deleteButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#edc8bd',
    borderRadius: 21,
    paddingHorizontal: 12,
  },
  deleteButtonText: {
    color: '#a54032',
    fontSize: 10,
    fontWeight: '700',
  },
  enableButton: {
    borderColor: '#ccd9bf',
  },
  enableButtonText: {
    color: '#2c6548',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  emptyState: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 13,
    backgroundColor: '#fffefa',
    padding: 24,
  },
  emptyTitle: {
    color: '#193c31',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyDescription: {
    color: '#777c70',
    fontSize: 11,
    marginTop: 6,
  },
  confirmBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(24, 35, 29, 0.48)',
    padding: 20,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    backgroundColor: '#fffefa',
    padding: 22,
  },
  confirmTitle: {
    color: '#193c31',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    marginTop: 8,
  },
  confirmDescription: {
    color: '#687466',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 18,
  },
  cancelButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dedfd5',
    borderRadius: 23,
    backgroundColor: '#f5f7f0',
    paddingHorizontal: 12,
  },
  cancelButtonText: {
    color: '#52594f',
    fontSize: 11,
    fontWeight: '700',
  },
  confirmButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: '#183d32',
    paddingHorizontal: 12,
  },
  confirmButtonText: {
    color: '#fffefa',
    fontSize: 11,
    fontWeight: '700',
  },
});
