import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
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

export default function SignInScreen() {
  const { authError } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = async () => {
    setMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: 'budolify://auth/callback',
          },
        });
        if (error) throw error;

        if (!data.session) {
          setMessage('Check your email to confirm your account, then come back to sign in.');
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }

      if (next === '/checkout') {
        router.replace('/checkout');
      } else if (typeof next === 'string' && /^\/shop\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next)) {
        router.replace({ pathname: '/shop/[slug]', params: { slug: next.slice('/shop/'.length) } });
      } else {
        router.replace('/');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to authenticate. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeArea style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.card}>
          <Pressable onPress={() => router.replace('/')} accessibilityRole="button">
            <Text style={styles.wordmark}>BUDOLIFY<Text style={styles.wordmarkDot}>.</Text></Text>
          </Pressable>
          <Text style={styles.eyebrow}>YOUR GOOD FINDS, ALL IN ONE PLACE</Text>
          <Text style={styles.title}>{isSignUp ? 'Create your account.' : 'Welcome back.'}</Text>
          <Text style={styles.description}>
            {isSignUp
              ? 'Join the club and keep your favorite finds close.'
              : 'Sign in to see your profile and saved details.'}
          </Text>

          {isSignUp && (
            <View style={styles.field}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                autoComplete="name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your name"
                placeholderTextColor="#85877e"
                style={styles.input}
                returnKeyType="next"
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#85877e"
              style={styles.input}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor="#85877e"
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
            />
          </View>

          {message && <Text style={styles.successMessage}>{message}</Text>}
          {authError && <Text style={styles.errorMessage}>{authError}</Text>}
          {errorMessage && <Text style={styles.errorMessage}>{errorMessage}</Text>}

          <Pressable
            style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
            onPress={() => void submit()}
            disabled={isSubmitting}
            accessibilityRole="button">
            <Text style={styles.submitButtonText}>
              {isSubmitting ? 'One moment…' : isSignUp ? 'Create account' : 'Sign in'}
            </Text>
            {!isSubmitting && <Text style={styles.submitArrow}>→</Text>}
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account?' : 'New to Budolify?'}
            </Text>
            <Pressable
              style={styles.switchActionButton}
              accessibilityRole="button"
              onPress={() => {
                setIsSignUp((current) => !current);
                setMessage(null);
                setErrorMessage(null);
              }}>
              <Text style={styles.switchAction}>{isSignUp ? 'Sign in' : 'Create account'}</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.backButton}
            onPress={() => router.replace('/')}
            accessibilityRole="button">
            <Text style={styles.backButtonText}>← Back to the good finds</Text>
          </Pressable>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: '#fffefa',
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 24,
    padding: 30,
    shadowColor: '#183d32',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.07,
    shadowRadius: 24,
    elevation: 3,
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
  eyebrow: {
    color: '#75806e',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 28,
  },
  title: {
    color: '#193c31',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 7,
  },
  description: {
    color: '#687466',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 23,
  },
  field: {
    gap: 7,
    marginBottom: 15,
  },
  label: {
    color: '#35463a',
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#dedfd5',
    borderRadius: 11,
    backgroundColor: '#fffefa',
    color: '#26372e',
    fontSize: 13,
    paddingHorizontal: 12,
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
  errorMessage: {
    color: '#a54032',
    backgroundColor: '#fff0ec',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 18,
    padding: 11,
    marginBottom: 14,
  },
  submitButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#183d32',
    borderRadius: 12,
    paddingHorizontal: 18,
    shadowColor: '#183d32',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
    marginTop: 5,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  submitButtonText: {
    color: '#fffefa',
    fontSize: 13,
    fontWeight: '700',
  },
  submitArrow: {
    color: '#d8ed80',
    fontSize: 17,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 20,
  },
  switchText: {
    color: '#687466',
    fontSize: 11,
  },
  switchAction: {
    color: '#285445',
    fontSize: 11,
    fontWeight: '800',
  },
  switchActionButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#d6ddd1',
    borderRadius: 18,
    backgroundColor: '#f5f7f0',
  },
  backButton: {
    alignSelf: 'center',
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#e7e5dc',
    borderRadius: 22,
    backgroundColor: '#f8f7f2',
    marginTop: 6,
  },
  backButtonText: {
    color: '#687466',
    fontSize: 11,
    fontWeight: '600',
  },
});
