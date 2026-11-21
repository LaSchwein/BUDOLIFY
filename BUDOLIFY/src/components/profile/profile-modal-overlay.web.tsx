import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

type ProfileModalOverlayProps = {
  children: ReactNode;
};

export function ProfileModalOverlay({ children }: ProfileModalOverlayProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && router.canGoBack()) {
        router.back();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const dismiss = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityLabel="Dismiss profile modal"
        onPress={dismiss}
        style={StyleSheet.absoluteFill}
      />
      <View role="dialog" style={styles.dialog}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(24, 35, 29, 0.48)',
    padding: 20,
  },
  dialog: {
    width: '100%',
    height: '90%',
    maxWidth: 680,
    maxHeight: 780,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#f8f7f2',
  },
});
