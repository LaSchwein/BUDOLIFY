import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  OrderScreenFrame,
  orderColors,
  orderStyles,
} from '@/components/orders/order-ui';
import {
  deleteAddress,
  listAddresses,
  saveAddress,
  type AddressDraft,
  type SavedAddress,
} from '@/lib/orders';

const blankDraft: AddressDraft = {
  full_name: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  province: '',
  postal_code: '',
  is_default: false,
};

function toDraft(address: SavedAddress): AddressDraft {
  return {
    full_name: address.full_name,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    province: address.province,
    postal_code: address.postal_code,
    is_default: address.is_default,
  };
}

export default function AddressesScreen() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(blankDraft);
  const [deleteTarget, setDeleteTarget] = useState<SavedAddress | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setAddresses(await listAddresses());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load your addresses.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadAddresses);
  }, [loadAddresses]);

  const updateDraft = (key: keyof AddressDraft, value: string | boolean) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrorMessage(null);
  };

  const beginAdd = () => {
    setEditingId('new');
    setDraft({ ...blankDraft, is_default: addresses.length === 0 });
    setErrorMessage(null);
  };

  const beginEdit = (address: SavedAddress) => {
    setEditingId(address.id);
    setDraft(toDraft(address));
    setErrorMessage(null);
  };

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const address = await saveAddress(draft, editingId === 'new' ? undefined : editingId ?? undefined);
      setAddresses((current) => [
        address,
        ...current.filter((item) => item.id !== address.id).map((item) =>
          address.is_default ? { ...item, is_default: false } : item,
        ),
      ]);
      setEditingId(null);
      setDraft(blankDraft);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save this address.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await deleteAddress(deleteTarget.id);
      setAddresses((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to remove this address.');
      setDeleteTarget(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OrderScreenFrame
      eyebrow="YOUR ACCOUNT"
      title="Saved addresses"
      description="Keep delivery details ready for your next order.">
      {errorMessage ? (
        <Text style={orderStyles.error} accessibilityRole="alert">{errorMessage}</Text>
      ) : null}
      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator color={orderColors.green} />
          <Text style={orderStyles.muted}>Loading your addresses…</Text>
        </View>
      ) : addresses.length === 0 && editingId === null ? (
        <View style={orderStyles.card}>
          <Text style={orderStyles.sectionTitle}>No saved addresses yet.</Text>
          <Text style={orderStyles.muted}>Add your delivery address to make checkout easier.</Text>
        </View>
      ) : (
        addresses.map((address) => (
          <View key={address.id} style={orderStyles.card}>
            <View style={styles.addressHeader}>
              <Text style={styles.name}>{address.full_name}</Text>
              {address.is_default ? <Text style={styles.defaultTag}>DEFAULT</Text> : null}
            </View>
            <Text style={orderStyles.muted}>{address.phone}</Text>
            <Text style={orderStyles.muted}>
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}
              {`, ${address.city}, ${address.province} ${address.postal_code}`}
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.actionButton}
                onPress={() => beginEdit(address)}
                accessibilityRole="button">
                <Text style={styles.actionLink}>Edit</Text>
              </Pressable>
              <Pressable
                style={styles.removeButton}
                onPress={() => setDeleteTarget(address)}
                accessibilityRole="button"
                accessibilityLabel={`Remove address for ${address.full_name}`}>
                <Text style={styles.deleteLink}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {editingId !== null ? (
        <View style={orderStyles.card}>
          <Text style={orderStyles.sectionTitle}>
            {editingId === 'new' ? 'Add an address' : 'Edit address'}
          </Text>
          <AddressField label="Full name" value={draft.full_name} onChangeText={(value) => updateDraft('full_name', value)} />
          <AddressField label="Mobile number" value={draft.phone} keyboardType="phone-pad" onChangeText={(value) => updateDraft('phone', value)} />
          <AddressField label="House number and street" value={draft.line1} onChangeText={(value) => updateDraft('line1', value)} />
          <AddressField label="Unit / barangay (optional)" value={draft.line2 ?? ''} onChangeText={(value) => updateDraft('line2', value)} />
          <View style={styles.formPair}>
            <AddressField label="City" value={draft.city} onChangeText={(value) => updateDraft('city', value)} />
            <AddressField label="Province" value={draft.province} onChangeText={(value) => updateDraft('province', value)} />
          </View>
          <AddressField label="Postal code (optional)" value={draft.postal_code ?? ''} keyboardType="number-pad" onChangeText={(value) => updateDraft('postal_code', value)} />
          <Pressable
            style={styles.defaultCheck}
            onPress={() => updateDraft('is_default', !draft.is_default)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: draft.is_default }}>
            <View style={[styles.checkbox, draft.is_default && styles.checkboxChecked]} />
            <Text style={orderStyles.muted}>Make this my default address</Text>
          </Pressable>
          <Pressable
            style={[orderStyles.primaryButton, isSaving && orderStyles.primaryButtonDisabled]}
            onPress={() => void save()}
            disabled={isSaving}
            accessibilityRole="button">
            <Text style={orderStyles.primaryButtonText}>{isSaving ? 'Saving…' : 'Save address'}</Text>
          </Pressable>
          <Pressable
            style={styles.cancel}
            onPress={() => setEditingId(null)}
            accessibilityRole="button">
            <Text style={styles.actionLink}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={orderStyles.primaryButton}
          onPress={beginAdd}
          accessibilityRole="button">
          <Text style={orderStyles.primaryButtonText}>+ Add an address</Text>
        </Pressable>
      )}

      <Modal
        visible={deleteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={orderStyles.sectionTitle}>Remove this address?</Text>
            <Text style={orderStyles.muted}>You can add it again later if you need it.</Text>
            <Pressable
              style={[orderStyles.primaryButton, isSaving && orderStyles.primaryButtonDisabled]}
              onPress={() => void remove()}
              disabled={isSaving}
              accessibilityRole="button">
              <Text style={orderStyles.primaryButtonText}>{isSaving ? 'Removing…' : 'Remove address'}</Text>
            </Pressable>
            <Pressable
              style={orderStyles.secondaryButton}
              onPress={() => setDeleteTarget(null)}
              accessibilityRole="button">
              <Text style={orderStyles.secondaryButtonText}>Keep address</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </OrderScreenFrame>
  );
}

function AddressField({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
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
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: 'center',
    padding: 38,
    gap: 12,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    color: orderColors.green,
    fontSize: 15,
    fontWeight: '900',
  },
  defaultTag: {
    color: orderColors.green,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
  },
  actionButton: {
    minHeight: 38,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cfd8ca',
    borderRadius: 20,
    backgroundColor: '#f5f7f0',
    paddingHorizontal: 14,
  },
  removeButton: {
    minHeight: 38,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#efd0c8',
    borderRadius: 20,
    backgroundColor: '#fff8f5',
    paddingHorizontal: 14,
  },
  actionLink: {
    color: orderColors.green,
    fontSize: 12,
    fontWeight: '800',
  },
  deleteLink: {
    color: orderColors.coral,
    fontSize: 12,
    fontWeight: '800',
  },
  field: {
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
  cancel: {
    alignSelf: 'center',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 20,
    backgroundColor: orderColors.card,
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
