import { useEffect, useState, type ChangeEvent } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getShopImageContentType,
  MAX_SHOP_IMAGE_SIZE,
} from '@/lib/shop-images';

type ShopImagePickerProps = {
  asset: ImagePicker.ImagePickerAsset | null;
  currentImageUri?: string | null;
  label: string;
  onChange: (asset: ImagePicker.ImagePickerAsset | null) => void;
};

export function ShopImagePicker({
  asset,
  currentImageUri,
  label,
  onChange,
}: ShopImagePickerProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPreviewUri, setSelectedPreviewUri] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPreviewUri?.startsWith('blob:')) {
      return () => URL.revokeObjectURL(selectedPreviewUri);
    }
  }, [selectedPreviewUri]);

  const previewUri = selectedPreviewUri ?? asset?.uri ?? currentImageUri;

  const acceptImage = (selectedAsset: ImagePicker.ImagePickerAsset) => {
    getShopImageContentType(selectedAsset);
    if (selectedAsset.fileSize && selectedAsset.fileSize > MAX_SHOP_IMAGE_SIZE) {
      throw new Error('Choose an image smaller than 5 MB.');
    }

    setSelectedPreviewUri(selectedAsset.uri);
    onChange(selectedAsset);
  };

  const onWebFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    setErrorMessage(null);
    let selectedUri: string | null = null;
    try {
      const selectedAsset: ImagePicker.ImagePickerAsset = {
        uri: '',
        width: 0,
        height: 0,
        file,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        type: 'image',
      };
      getShopImageContentType(selectedAsset);
      if (file.size > MAX_SHOP_IMAGE_SIZE) {
        throw new Error('Choose an image smaller than 5 MB.');
      }

      selectedUri = URL.createObjectURL(file);
      acceptImage({
        ...selectedAsset,
        uri: selectedUri,
      });
    } catch (error) {
      if (selectedUri) URL.revokeObjectURL(selectedUri);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to select the image.',
      );
    }
  };

  const chooseImage = async () => {
    setErrorMessage(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;

      acceptImage(result.assets[0]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to select the image.',
      );
    }
  };

  return (
    <>
      <View style={styles.container}>
        {previewUri ? (
          Platform.OS === 'web' ? (
            <img
              src={previewUri}
              style={{
                width: 76,
                height: 76,
                borderRadius: 12,
                objectFit: 'cover',
                backgroundColor: '#e9eee2',
              }}
              alt={`${label} preview`}
              onError={() =>
                setErrorMessage('Could not display this image. Choose a different file.')
              }
            />
          ) : (
            <Image
              source={{ uri: previewUri }}
              style={styles.preview}
              contentFit="cover"
              onError={() =>
                setErrorMessage('Could not display this image. Choose a different file.')
              }
              accessibilityLabel={`${label} preview`}
            />
          )
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>＋</Text>
          </View>
        )}
        <View style={styles.details}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.hint}>JPEG, PNG, or WebP · up to 5 MB</Text>
          {Platform.OS === 'web' ? (
            <View style={styles.webFileButton}>
              <Text style={styles.buttonText}>
                {previewUri ? 'Choose a different image' : 'Choose image'}
              </Text>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onWebFileChange}
                aria-label={`Choose ${label.toLowerCase()}`}
                style={styles.webFileInput}
              />
            </View>
          ) : (
            <Pressable
              style={styles.button}
              onPress={() => void chooseImage()}
              accessibilityRole="button">
              <Text style={styles.buttonText}>
                {previewUri ? 'Choose a different image' : 'Choose image'}
              </Text>
            </Pressable>
          )}
          {asset?.fileName && (
            <Text style={styles.fileName} numberOfLines={1}>
              Selected: {asset.fileName}
            </Text>
          )}
          {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 6,
  },
  preview: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#e9eee2',
  },
  placeholder: {
    width: 76,
    height: 76,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9eee2',
  },
  placeholderIcon: {
    color: '#4d6655',
    fontSize: 27,
  },
  details: {
    flex: 1,
    gap: 5,
  },
  label: {
    color: '#35463a',
    fontSize: 12,
    fontWeight: '700',
  },
  hint: {
    color: '#85877e',
    fontSize: 10,
  },
  button: {
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#cbd5c3',
    borderRadius: 20,
    backgroundColor: '#f5f7f0',
  },
  webFileButton: {
    alignSelf: 'flex-start',
    position: 'relative',
    overflow: 'hidden',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#cbd5c3',
    borderRadius: 20,
    backgroundColor: '#f5f7f0',
  },
  webFileInput: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
  },
  buttonText: {
    color: '#285445',
    fontSize: 11,
    fontWeight: '700',
  },
  fileName: {
    color: '#687466',
    fontSize: 10,
  },
  error: {
    color: '#a54032',
    fontSize: 10,
  },
});
