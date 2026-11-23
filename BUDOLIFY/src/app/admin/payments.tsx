import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type PaymentRecord = {
  checkout_group_id: string;
  amount_minor: number;
  status: string;
  refund_status: string | null;
  created_at: string;
  provider_payment_id: string | null;
};

export default function AdminPaymentsScreen() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadPayments = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('maya-refund', {
      body: { action: 'list' },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    setPayments((data?.payments ?? []) as PaymentRecord[]);
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }
    let active = true;
    void (async () => {
      const { data: profile, error } = await supabase
        .from('profiles').select('role,is_suspended').eq('id', user.id).single();
      if (!active) return;
      if (error || !profile || !['admin', 'super_admin'].includes(profile.role) || profile.is_suspended) {
        router.replace('/');
        return;
      }
      setIsAdmin(true);
      try {
        await loadPayments();
      } catch (loadError) {
        setMessage(loadError instanceof Error ? loadError.message : 'Unable to load payments.');
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [isAuthLoading, loadPayments, user]);

  const refundPayment = async (checkoutGroupId: string) => {
    if (busyGroup) return;
    setBusyGroup(checkoutGroupId);
    setConfirmGroup(null);
    setMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('maya-refund', {
        body: { checkoutGroupId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setMessage(`Refund submitted. Maya status: ${data.status}.`);
      await loadPayments();
    } catch (refundError) {
      setMessage(refundError instanceof Error ? refundError.message : 'Unable to submit this refund.');
    } finally {
      setBusyGroup(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/admin')} accessibilityRole="link">
          <Text style={styles.link}>← ADMIN</Text>
        </Pressable>
        <Text style={styles.eyebrow}>BUDOLIFY · ADMIN</Text>
        <Text style={styles.title}>Payments and refunds.</Text>
        <Text style={styles.description}>Online payments settle to BUDOLIFY. Refunds return through Maya to the original payment method.</Text>
        {message ? <Text style={styles.message} accessibilityRole="alert">{message}</Text> : null}
        {isLoading || isAuthLoading || !isAdmin ? (
          <ActivityIndicator color="#193c31" />
        ) : payments.length === 0 ? (
          <View style={styles.card}><Text style={styles.body}>No online payments yet.</Text></View>
        ) : payments.map((payment) => {
          const mayRefund = payment.status === 'paid' && !['pending', 'processing', 'succeeded'].includes(payment.refund_status ?? '');
          return (
            <View key={payment.checkout_group_id} style={styles.card}>
              <Text style={styles.amount}>₱{(Number(payment.amount_minor) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</Text>
              <Text style={styles.body}>Checkout {payment.checkout_group_id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.muted}>Payment: {payment.status} · Refund: {payment.refund_status ?? 'none'}</Text>
              <Text style={styles.muted}>{new Date(payment.created_at).toLocaleString('en-PH')}</Text>
              {confirmGroup === payment.checkout_group_id ? (
                <View style={styles.confirmBox}>
                  <Text style={styles.body}>Issue a full refund for this checkout group?</Text>
                  <View style={styles.actions}>
                    <Pressable style={styles.cancelButton} onPress={() => setConfirmGroup(null)} accessibilityRole="button">
                      <Text style={styles.link}>Keep payment</Text>
                    </Pressable>
                    <Pressable style={styles.refundButton} onPress={() => void refundPayment(payment.checkout_group_id)} accessibilityRole="button">
                      <Text style={styles.refundButtonText}>Confirm full refund</Text>
                    </Pressable>
                  </View>
                </View>
              ) : mayRefund ? (
                <Pressable
                  style={[styles.refundButton, busyGroup === payment.checkout_group_id && styles.disabled]}
                  onPress={() => setConfirmGroup(payment.checkout_group_id)}
                  disabled={busyGroup !== null}
                  accessibilityRole="button">
                  <Text style={styles.refundButtonText}>{busyGroup === payment.checkout_group_id ? 'Submitting…' : 'Refund checkout'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8f7f2' },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 20, gap: 12 },
  backButton: { alignSelf: 'flex-start', minHeight: 38, justifyContent: 'center' },
  link: { color: '#315b46', fontSize: 12, fontWeight: '800' },
  eyebrow: { color: '#75806e', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#193c31', fontSize: 28, fontWeight: '800' },
  description: { color: '#687466', fontSize: 13, lineHeight: 19 },
  card: { gap: 8, padding: 16, borderWidth: 1, borderColor: '#e4e2d8', borderRadius: 12, backgroundColor: '#fffefa' },
  amount: { color: '#193c31', fontSize: 20, fontWeight: '900' },
  body: { color: '#26372e', fontSize: 13, fontWeight: '700' },
  muted: { color: '#687466', fontSize: 12 },
  message: { color: '#193c31', backgroundColor: '#e9eee2', padding: 12, borderRadius: 8 },
  confirmBox: { gap: 10, marginTop: 8, padding: 12, borderRadius: 8, backgroundColor: '#f8f1e7' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  refundButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', borderRadius: 6, backgroundColor: '#8c3e31', paddingHorizontal: 14, marginTop: 6 },
  refundButtonText: { color: '#fffefa', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
