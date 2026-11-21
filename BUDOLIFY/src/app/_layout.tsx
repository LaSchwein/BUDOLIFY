import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { AuthProvider } from '@/lib/auth-context';

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="profile"
          options={{
            presentation: Platform.select({ web: 'transparentModal', default: 'modal' }),
            animation: Platform.select({ web: 'none', default: undefined }),
          }}
        />
      </Stack>
    </AuthProvider>
  );
}
