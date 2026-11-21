import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const ALLOWED_CONTENT_TYPES = new Set(Object.values(CONTENT_TYPE_BY_EXTENSION));

type ProfileAvatarPickerProps = {
  userId: string;
  displayName: string;
  avatarUri: string | null;
  onUploaded: (avatarPath: string, signedUrl: string | null) => void;
};

export function ProfileAvatarPicker({
  userId,
  displayName,
  avatarUri,
  onUploaded,
}: ProfileAvatarPickerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chooseImage = async () => {
    setErrorMessage(null);
    setIsUploading(true);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_AVATAR_SIZE) {
        throw new Error('Choose an image smaller than 5 MB.');
      }

      const extension = asset.fileName?.split('.').pop()?.toLowerCase() ?? '';
      const contentType =
        asset.mimeType?.toLowerCase() ?? CONTENT_TYPE_BY_EXTENSION[extension];
      if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
        throw new Error('Choose a JPEG, PNG, or WebP image.');
      }

      const response = await fetch(asset.uri);
      if (!response.ok) {
        throw new Error('Could not read the selected image. Please choose it again.');
      }
      const imageData = await response.arrayBuffer();
      if (imageData.byteLength > MAX_AVATAR_SIZE) {
        throw new Error('Choose an image smaller than 5 MB.');
      }

      const avatarPath = `${userId}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(avatarPath, imageData, {
          cacheControl: '0',
          contentType,
          upsert: true,
        });
      if (uploadError?.message.toLowerCase().includes('bucket not found')) {
        throw new Error(
          'Avatar storage is not set up. Run supabase/migrations/20261117210000_user_management.sql first, then supabase/migrations/20261117220000_profile_avatars.sql in your Supabase SQL Editor.',
        );
      }
      if (uploadError) throw uploadError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_path: avatarPath })
        .eq('id', userId);
      if (profileError) throw profileError;

      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('avatars')
        .createSignedUrl(avatarPath, 60 * 60);
      onUploaded(avatarPath, signedUrlData?.signedUrl ?? null);
      if (signedUrlError) {
        setErrorMessage(`Picture uploaded, but its preview could not be loaded: ${signedUrlError.message}`);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to upload the selected image.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>
            {(displayName || 'B').slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <Pressable
        style={[styles.button, isUploading && styles.buttonDisabled]}
        onPress={() => void chooseImage()}
        disabled={isUploading}
        accessibilityRole="button">
        <Text style={styles.buttonText}>
          {isUploading ? 'Uploading…' : avatarUri ? 'Change picture' : 'Upload a picture'}
        </Text>
      </Pressable>
      <Text style={styles.helpText}>JPEG, PNG, or WebP · up to 5 MB</Text>
      {errorMessage && <Text style={styles.errorMessage}>{errorMessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#e9eee2',
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d8ed80',
    marginBottom: 10,
  },
  avatarInitial: {
    color: '#183d32',
    fontSize: 28,
    fontWeight: '800',
  },
  button: {
    minHeight: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5c3',
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#285445',
    fontSize: 11,
    fontWeight: '700',
  },
  helpText: {
    color: '#85877e',
    fontSize: 9,
    marginTop: 6,
  },
  errorMessage: {
    color: '#a54032',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
  },
});
