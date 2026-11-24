import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

type CallbackState = 'processing' | 'success' | 'error';

function getCallbackParams(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  fragment.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return params;
}

export default function AuthCallbackScreen() {
  const url = Linking.useURL();
  const processedUrl = useRef<string | null>(null);
  const [state, setState] = useState<CallbackState>('processing');
  const [message, setMessage] = useState('Confirming your email…');

  useEffect(() => {
    if (!url || processedUrl.current === url) return;
    processedUrl.current = url;
    let active = true;

    const processCallback = async () => {
      try {
        const params = getCallbackParams(url);
        const callbackError = params.get('error_description') ?? params.get('error');
        if (callbackError) throw new Error(callbackError.replaceAll('+', ' '));

        const tokenHash = params.get('token_hash');
        const otpType = params.get('type');
        const code = params.get('code');
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (tokenHash && (otpType === 'email' || otpType === 'signup')) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType as EmailOtpType,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        } else {
          throw new Error('This confirmation link is incomplete. Request a new email and try again.');
        }

        // Do not show success until Supabase has returned a valid, persisted session.
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session?.user.email_confirmed_at) {
          throw new Error('Email confirmation could not be verified. Please try signing in or request a new link.');
        }

        if (!active) return;
        setState('success');
        setMessage('Your email is confirmed. You’re signed in and ready to shop.');
        setTimeout(() => router.replace('/'), 1400);
      } catch (error) {
        if (!active) return;
        const detail = error instanceof Error ? error.message : '';
        const lowerDetail = detail.toLowerCase();
        const friendlyMessage = lowerDetail.includes('expired') || lowerDetail.includes('invalid') || lowerDetail.includes('used')
          ? 'This confirmation link has expired or was already used. Sign in if you already confirmed your email, or create a new confirmation email.'
          : detail || 'We could not confirm this email. Please try again.';
        setState('error');
        setMessage(friendlyMessage);
      }
    };

    void processCallback();
    return () => { active = false; };
  }, [url]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <Text style={styles.wordmark}>BUDOLIFY<Text style={styles.dot}>.</Text></Text>
        <Text style={styles.title}>
          {state === 'processing' ? 'One moment…' : state === 'success' ? 'You’re all set.' : 'Could not confirm email.'}
        </Text>
        <Text style={styles.message}>{message}</Text>
        {state !== 'processing' && (
          <Pressable style={styles.button} onPress={() => router.replace('/sign-in')} accessibilityRole="button">
            <Text style={styles.buttonText}>{state === 'success' ? 'Continue to Budolify' : 'Go to sign in'}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, justifyContent: 'center', backgroundColor: '#f8f7f2', padding: 20 },
  card: { width: '100%', maxWidth: 450, alignSelf: 'center', backgroundColor: '#fffefa', borderWidth: 1, borderColor: '#e7e5dc', borderRadius: 24, padding: 30 },
  wordmark: { color: '#183d32', fontSize: 20, fontWeight: '900', letterSpacing: -1 },
  dot: { color: '#ec694b' },
  title: { color: '#193c31', fontSize: 25, lineHeight: 32, fontWeight: '800', marginTop: 28 },
  message: { color: '#687466', fontSize: 14, lineHeight: 21, marginTop: 10 },
  button: { minHeight: 50, justifyContent: 'center', alignItems: 'center', backgroundColor: '#183d32', borderRadius: 12, marginTop: 24, paddingHorizontal: 18 },
  buttonText: { color: '#fffefa', fontSize: 13, fontWeight: '700' },
});
