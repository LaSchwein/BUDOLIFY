import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView as SafeArea } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

import { ProfileAvatarPicker } from './profile-avatar-picker';
import { ProfileField } from './profile-field';

type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  avatar_path: string | null;
  avatar_url?: string;
  role: 'customer' | 'admin' | 'super_admin';
  is_suspended: boolean;
  created_at: string;
};

export default function ProfileModal() {
  const { user, isLoading: isAuthLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }

    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (!active) return;
        if (error) {
          setErrorMessage(error.message);
          return;
        }

        const userProfile = data as UserProfile;
        setProfile(userProfile);
        setFullName(userProfile.full_name);
        setPhone(userProfile.phone);
        if (userProfile.avatar_path) {
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from('avatars')
            .createSignedUrl(userProfile.avatar_path, 60 * 60);
          if (!active) return;
          if (signedUrlError) {
            setErrorMessage(signedUrlError.message);
          } else {
            setAvatarUri(signedUrlData.signedUrl);
          }
        } else {
          setAvatarUri(userProfile.avatar_url || null);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load your profile.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isAuthLoading, user]);

  const saveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
        })
        .eq('id', user.id)
        .select('*')
        .single();

      if (error) {
        setErrorMessage(error.message);
      } else {
        setProfile(data as UserProfile);
        setSuccessMessage('Your profile has been saved.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setErrorMessage(null);
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign out.');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <SafeArea style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Text style={styles.wordmark}>BUDOLIFY<Text style={styles.wordmarkDot}>.</Text></Text>
            <Pressable
              style={styles.closeButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close profile">
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
          <Text style={styles.title}>Profile details.</Text>
          <Text style={styles.description}>Keep your details up to date for your next good find.</Text>

          {isLoading || isAuthLoading ? (
            <Text style={styles.loadingText}>Loading your profile…</Text>
          ) : (
            <>
              {user && (
                <ProfileAvatarPicker
                  userId={user.id}
                  displayName={fullName || user.email || ''}
                  avatarUri={avatarUri}
                  onUploaded={(avatarPath, signedUrl) => {
                    setProfile((current) =>
                      current ? { ...current, avatar_path: avatarPath } : current,
                    );
                    setAvatarUri(signedUrl);
                    setSuccessMessage('Your profile picture has been updated.');
                    setErrorMessage(null);
                  }}
                />
              )}

              <View style={styles.card}>
                <ProfileField label="Full name" value={fullName} onChangeText={setFullName} />
                <ProfileField
                  label="Email"
                  value={profile?.email ?? user?.email ?? ''}
                  editable={false}
                />
                <ProfileField label="Phone" value={phone} onChangeText={setPhone} />
                <ProfileField label="Role" value={profile?.role ?? 'customer'} editable={false} />
                <ProfileField
                  label="Member since"
                  value={
                    profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString()
                      : ''
                  }
                  editable={false}
                />

                {errorMessage && <Text style={styles.errorMessage}>{errorMessage}</Text>}
                {successMessage && <Text style={styles.successMessage}>{successMessage}</Text>}

                <Pressable
                  style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
                  onPress={() => void saveProfile()}
                  disabled={isSaving}
                  accessibilityRole="button">
                  <Text style={styles.primaryButtonText}>
                    {isSaving ? 'Saving…' : 'Save profile'}
                  </Text>
                  {!isSaving && <Text style={styles.primaryButtonArrow}>→</Text>}
                </Pressable>

                <Pressable
                  style={styles.accountLink}
                  onPress={() => router.push('/orders')}
                  accessibilityRole="link">
                  <Text style={styles.accountLinkText}>View order history →</Text>
                </Pressable>
                <Pressable
                  style={styles.accountLink}
                  onPress={() => router.push('/addresses')}
                  accessibilityRole="link">
                  <Text style={styles.accountLinkText}>Manage saved addresses →</Text>
                </Pressable>

                {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
                  <Pressable
                    style={styles.adminButton}
                    onPress={() => router.push('/admin')}
                    accessibilityRole="button">
                    <Text style={styles.adminButtonText}>Open admin dashboard →</Text>
                  </Pressable>
                )}

                <Pressable
                  style={styles.signOutButton}
                  onPress={() => void handleSignOut()}
                  disabled={isSigningOut}
                  accessibilityRole="button">
                  <Text style={styles.signOutText}>
                    {isSigningOut ? 'Signing out…' : 'Sign out'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeArea>
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
    maxWidth: 680,
  },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9eee2',
  },
  closeButtonText: {
    color: '#183d32',
    fontSize: 25,
    lineHeight: 28,
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
    marginBottom: 20,
  },
  loadingText: {
    color: '#687466',
    fontSize: 13,
    padding: 24,
  },
  card: {
    backgroundColor: '#fffefa',
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 22,
    padding: 22,
  },
  errorMessage: {
    color: '#a54032',
    backgroundColor: '#fff0ec',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
    marginVertical: 8,
  },
  successMessage: {
    color: '#2c6548',
    backgroundColor: '#edf4e9',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
    marginVertical: 8,
  },
  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    backgroundColor: '#183d32',
    paddingHorizontal: 14,
    marginTop: 5,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#fffefa',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButtonArrow: {
    color: '#d8ed80',
    fontSize: 16,
  },
  accountLink: {
    alignSelf: 'flex-start',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#d6ddd1',
    borderRadius: 22,
    backgroundColor: '#f5f7f0',
    marginTop: 7,
  },
  accountLinkText: {
    color: '#285445',
    fontSize: 12,
    fontWeight: '800',
  },
  adminButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d6ddd1',
    borderRadius: 12,
    backgroundColor: '#e9eee2',
    paddingHorizontal: 14,
    marginTop: 5,
  },
  adminButtonText: {
    color: '#285445',
    fontSize: 12,
    fontWeight: '800',
  },
  signOutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#efd0c8',
    borderRadius: 12,
    backgroundColor: '#fff8f5',
    paddingHorizontal: 14,
    marginTop: 8,
  },
  signOutText: {
    color: '#a54032',
    fontSize: 12,
    fontWeight: '700',
  },
});
