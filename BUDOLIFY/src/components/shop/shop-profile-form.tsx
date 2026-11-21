import type { ImagePickerAsset } from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { getShopImageUrl } from '@/lib/shop-images';
import type { Shop, ShopDraft } from '@/lib/shop-types';

import { ShopFormField } from './shop-form-field';
import { ShopImagePicker } from './shop-image-picker';

type ShopProfileFormProps = {
  shop?: Shop | null;
  contactEmail: string;
  onSubmit: (draft: ShopDraft, logo: ImagePickerAsset | null) => Promise<void>;
};

function createSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function ShopProfileForm({
  shop,
  contactEmail,
  onSubmit,
}: ShopProfileFormProps) {
  const [name, setName] = useState(shop?.name ?? '');
  const [slug, setSlug] = useState(shop?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(Boolean(shop));
  const [description, setDescription] = useState(shop?.description ?? '');
  const [email, setEmail] = useState(shop?.contact_email || contactEmail);
  const [phone, setPhone] = useState(shop?.phone ?? '');
  const [isPublished, setIsPublished] = useState(shop?.is_published ?? true);
  const [logoAsset, setLogoAsset] = useState<ImagePickerAsset | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async () => {
    const normalizedName = name.trim();
    const normalizedSlug = createSlug(slug);
    if (normalizedName.length < 2) {
      setErrorMessage('Shop name must be at least 2 characters.');
      return;
    }
    if (!normalizedSlug) {
      setErrorMessage('Enter a shop name to create its web address.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSubmit(
        {
          name: normalizedName,
          slug: normalizedSlug,
          description: description.trim(),
          contact_email: email.trim(),
          phone: phone.trim(),
          is_published: isPublished,
        },
        logoAsset,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save your shop details.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <ShopImagePicker
        asset={logoAsset}
        currentImageUri={getShopImageUrl(shop?.logo_path ?? null)}
        label="Shop logo (optional)"
        onChange={setLogoAsset}
      />
      <ShopFormField
        label="Shop name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (!slugEdited) setSlug(createSlug(value));
        }}
        placeholder="The Good Finds Shop"
      />
      <ShopFormField
        label="Shop address"
        value={slug}
        onChangeText={(value) => {
          setSlugEdited(true);
          setSlug(createSlug(value));
        }}
        placeholder="the-good-finds"
        autoCapitalize="none"
      />
      <Text style={styles.slugPreview}>budolify.com/shop/{createSlug(slug) || 'your-shop'}</Text>
      <ShopFormField
        label="About your shop"
        value={description}
        onChangeText={setDescription}
        placeholder="Tell shoppers what makes your shop special."
        multiline
      />
      <ShopFormField
        label="Contact email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <ShopFormField
        label="Contact phone"
        value={phone}
        onChangeText={setPhone}
        placeholder="Optional"
        keyboardType="number-pad"
      />
      {shop && (
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Publish shop</Text>
            <Text style={styles.switchDescription}>
              {isPublished ? 'Your shop and products are visible to shoppers.' : 'Your shop is hidden from the storefront.'}
            </Text>
          </View>
          <Switch
            value={isPublished}
            onValueChange={setIsPublished}
            trackColor={{ false: '#d8d8ce', true: '#91a868' }}
            thumbColor="#fffefa"
          />
        </View>
      )}
      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
      <Pressable
        style={[styles.submitButton, isSaving && styles.disabledButton]}
        onPress={() => void save()}
        disabled={isSaving}
        accessibilityRole="button">
        <Text style={styles.submitButtonText}>
          {isSaving ? 'Saving…' : shop ? 'Save shop settings' : 'Create my shop'}
        </Text>
        {!isSaving && <Text style={styles.submitArrow}>→</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 15,
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 16,
    backgroundColor: '#fffefa',
    padding: 18,
  },
  slugPreview: {
    color: '#85877e',
    fontSize: 10,
    marginTop: -10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 5,
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchTitle: {
    color: '#26372e',
    fontSize: 12,
    fontWeight: '700',
  },
  switchDescription: {
    color: '#85877e',
    fontSize: 10,
    lineHeight: 15,
  },
  error: {
    color: '#a54032',
    backgroundColor: '#fff0ec',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
  },
  submitButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 9,
    backgroundColor: '#183d32',
    paddingHorizontal: 15,
    marginTop: 2,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fffefa',
    fontSize: 12,
    fontWeight: '700',
  },
  submitArrow: {
    color: '#d8ed80',
    fontSize: 17,
  },
});
