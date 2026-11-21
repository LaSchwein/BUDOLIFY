import type { ImagePickerAsset } from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { getShopImageUrl } from '@/lib/shop-images';
import type { ShopProduct, ShopProductDraft } from '@/lib/shop-types';

import { ShopFormField } from './shop-form-field';
import { ShopImagePicker } from './shop-image-picker';

type ShopProductFormProps = {
  product: ShopProduct | null;
  onCancel: () => void;
  onSubmit: (
    draft: ShopProductDraft,
    image: ImagePickerAsset | null,
  ) => Promise<void>;
};

export function ShopProductForm({
  product,
  onCancel,
  onSubmit,
}: ShopProductFormProps) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [category, setCategory] = useState(product?.category ?? 'Everyday');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [inventory, setInventory] = useState(
    product ? String(product.inventory) : '1',
  );
  const [isPublished, setIsPublished] = useState(product?.is_published ?? true);
  const [imageAsset, setImageAsset] = useState<ImagePickerAsset | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = async () => {
    const normalizedName = name.trim();
    const parsedPrice = Number(price);
    const parsedInventory = Number(inventory);
    if (!normalizedName) {
      setErrorMessage('Add a product name.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setErrorMessage('Enter a price greater than zero.');
      return;
    }
    if (!Number.isSafeInteger(parsedInventory) || parsedInventory < 0) {
      setErrorMessage('Inventory must be a whole number of zero or more.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await onSubmit(
        {
          name: normalizedName,
          description: description.trim(),
          category: category.trim() || 'Everyday',
          price: Number(parsedPrice.toFixed(2)),
          inventory: parsedInventory,
          is_published: isPublished,
        },
        imageAsset,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save this product.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>{product ? 'Edit product' : 'Add a product'}</Text>
      <ShopImagePicker
        asset={imageAsset}
        currentImageUri={getShopImageUrl(product?.image_path ?? null)}
        label="Product photo (optional)"
        onChange={setImageAsset}
      />
      <ShopFormField
        label="Product name"
        value={name}
        onChangeText={setName}
        placeholder="A product shoppers will love"
      />
      <ShopFormField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the details, materials, and sizing."
        multiline
      />
      <View style={styles.row}>
        <View style={styles.column}>
          <ShopFormField
            label="Category"
            value={category}
            onChangeText={setCategory}
            placeholder="Home, style, tech..."
          />
        </View>
        <View style={styles.column}>
          <ShopFormField
            label="Price (PHP)"
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      <ShopFormField
        label="Inventory"
        value={inventory}
        onChangeText={setInventory}
        placeholder="How many are available?"
        keyboardType="number-pad"
      />
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>Publish product</Text>
          <Text style={styles.switchDescription}>
            {isPublished ? 'Visible in the storefront.' : 'Only visible in your dashboard.'}
          </Text>
        </View>
        <Switch
          value={isPublished}
          onValueChange={setIsPublished}
          trackColor={{ false: '#d8d8ce', true: '#91a868' }}
          thumbColor="#fffefa"
        />
      </View>
      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
      <View style={styles.actions}>
        <Pressable
          style={styles.cancelButton}
          onPress={onCancel}
          disabled={isSaving}
          accessibilityRole="button">
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.submitButton, isSaving && styles.disabledButton]}
          onPress={() => void save()}
          disabled={isSaving}
          accessibilityRole="button">
          <Text style={styles.submitButtonText}>
            {isSaving ? 'Saving…' : product ? 'Save changes' : 'Post product'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 16,
    backgroundColor: '#fffefa',
    padding: 17,
  },
  formTitle: {
    color: '#193c31',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  },
  error: {
    color: '#a54032',
    backgroundColor: '#fff0ec',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
    marginTop: 2,
  },
  cancelButton: {
    minHeight: 43,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d8ddd1',
    borderRadius: 22,
    backgroundColor: '#f5f7f0',
    paddingHorizontal: 14,
  },
  cancelButtonText: {
    color: '#4d5c4d',
    fontSize: 12,
    fontWeight: '700',
  },
  submitButton: {
    minHeight: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#183d32',
    paddingHorizontal: 15,
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fffefa',
    fontSize: 12,
    fontWeight: '700',
  },
});
