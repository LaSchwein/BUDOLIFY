import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export const MAX_SHOP_IMAGE_SIZE = 5 * 1024 * 1024;
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const ALLOWED_CONTENT_TYPES = new Set(Object.values(CONTENT_TYPE_BY_EXTENSION));

export function getShopImageContentType(asset: ImagePickerAsset) {
  const extension = asset.fileName?.split('.').pop()?.toLowerCase() ?? '';
  const contentType =
    asset.mimeType?.toLowerCase() || CONTENT_TYPE_BY_EXTENSION[extension];

  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('Choose a JPEG, PNG, or WebP image.');
  }
  if (asset.fileSize && asset.fileSize > MAX_SHOP_IMAGE_SIZE) {
    throw new Error('Choose an image smaller than 5 MB.');
  }
  return contentType;
}

export function getShopImageUrl(path: string | null) {
  return path
    ? supabase.storage.from('shop-images').getPublicUrl(path).data.publicUrl
    : null;
}

export async function uploadShopImage(
  ownerId: string,
  shopId: string,
  asset: ImagePickerAsset,
) {
  const contentType = getShopImageContentType(asset);
  let imageData: ArrayBuffer;
  if (asset.file) {
    imageData = await asset.file.arrayBuffer();
  } else {
    const response = await fetch(asset.uri);
    if (!response.ok) {
      throw new Error('Could not read the selected image. Please choose it again.');
    }
    imageData = await response.arrayBuffer();
  }
  if (imageData.byteLength > MAX_SHOP_IMAGE_SIZE) {
    throw new Error('Choose an image smaller than 5 MB.');
  }

  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${ownerId}/${shopId}/${uniqueSuffix}`;
  const { error } = await supabase.storage.from('shop-images').upload(path, imageData, {
    cacheControl: '3600',
    contentType,
    upsert: false,
  });
  if (error) {
    if (/row-level security policy/i.test(error.message)) {
      throw new Error(
        'Supabase blocked the shop image upload. Run supabase/migrations/20261118014500_shop_image_storage_rls.sql in the Supabase SQL Editor, then try again.',
      );
    }
    throw error;
  }
  return path;
}

export async function deleteShopImage(path: string) {
  const { error } = await supabase.storage.from('shop-images').remove([path]);
  if (error) throw error;
}
