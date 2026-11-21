import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const orderColors = {
  green: '#183d32',
  lime: '#d8ed80',
  coral: '#ed7253',
  background: '#f8f7f2',
  card: '#fffefa',
  muted: '#74766d',
  border: '#e5e2d8',
};

export function formatPrice(price: number) {
  return `₱${Number(price).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function OrderScreenFrame({
  eyebrow,
  title,
  description,
  children,
}: PropsWithChildren<{
  eyebrow: string;
  title: string;
  description?: string;
}>) {
  const width = useWindowDimensions().width;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.content, { width: Math.min(Math.max(width - 32, 0), 920) }]}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backText}>← <Text style={styles.backWordmark}>BUDOLIFY</Text></Text>
          </Pressable>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={[styles.title, width < 420 && styles.titleMobile]}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const statusColors: Record<string, { background: string; foreground: string }> = {
  placed: { background: '#edf2dd', foreground: '#355a3c' },
  confirmed: { background: '#e7eee8', foreground: '#315141' },
  packed: { background: '#f1ead8', foreground: '#735b27' },
  shipped: { background: '#e5edf1', foreground: '#355d70' },
  delivered: { background: '#e5edf1', foreground: '#355d70' },
  completed: { background: '#e5eddb', foreground: '#355a3c' },
  cancelled: { background: '#f6e5e0', foreground: '#9e4e3a' },
  refunded: { background: '#f1ead8', foreground: '#735b27' },
  pending_payment: { background: '#f6e5e0', foreground: '#9e4e3a' },
};

export function OrderStatusPill({ status }: { status: string }) {
  const colors = statusColors[status] ?? statusColors.placed;
  const label = status.replaceAll('_', ' ');
  return (
    <View style={[styles.statusPill, { backgroundColor: colors.background }]}>
      <Text style={[styles.statusText, { color: colors.foreground }]}>{label}</Text>
    </View>
  );
}

export const orderStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fffefa',
    borderWidth: 1,
    borderColor: '#e8e4d9',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  sectionTitle: {
    color: orderColors.green,
    fontSize: 17,
    fontWeight: '800',
  },
  muted: {
    color: orderColors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    color: orderColors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#dcdacf',
    borderRadius: 10,
    backgroundColor: orderColors.card,
    color: orderColors.green,
    fontSize: 14,
    paddingHorizontal: 12,
  },
  primaryButton: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: orderColors.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: orderColors.green,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#fffefa',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cfd8ca',
    backgroundColor: '#f5f7f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: orderColors.green,
    fontSize: 13,
    fontWeight: '800',
  },
  error: {
    color: '#a43e2d',
    fontSize: 13,
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: orderColors.border,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: orderColors.background,
  },
  page: {
    flex: 1,
    backgroundColor: orderColors.background,
  },
  pageContent: {
    alignItems: 'center',
    paddingBottom: 42,
  },
  content: {
    gap: 14,
    paddingTop: 22,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: orderColors.border,
    borderRadius: 20,
    backgroundColor: orderColors.card,
    marginBottom: 8,
  },
  backText: {
    color: orderColors.green,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  backWordmark: {
    letterSpacing: 0.8,
  },
  eyebrow: {
    color: orderColors.coral,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 12,
  },
  title: {
    color: orderColors.green,
    fontFamily: 'Georgia',
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 40,
  },
  titleMobile: {
    fontSize: 32,
    lineHeight: 36,
  },
  description: {
    color: orderColors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
