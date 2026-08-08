import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';

import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { FeatureFlags } from '../config/flags';

const PINK = '#C2185B';
const BG = '#F6F1F4';

function Splash() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG }}>
      <ActivityIndicator color={PINK} size="large" />
    </View>
  );
}

/**
 * Single place that decides whether the user may be anywhere other than the
 * login screen. Keeping it here rather than in each screen means a signed-out
 * user can't land on a protected route by deep link or back-navigation.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  // Dev-only escape hatch, off by default -- see FeatureFlags.DEV_BYPASS_LOGIN.
  // AND-ed with __DEV__ so a stray `true` left in the flag can never affect a
  // production/release build (Metro/EAS release builds set __DEV__ false).
  const devBypass = __DEV__ && FeatureFlags.DEV_BYPASS_LOGIN;

  useEffect(() => {
    // Wait for the persisted session to be restored, otherwise every cold start
    // would briefly bounce an already-signed-in user to the login screen.
    if (initializing) return;

    if (devBypass) {
      // The bypass skips the login redirect entirely, but index.tsx's
      // "wait for the backend session" spinner would still spin forever --
      // there's no real auth to produce one. Skip straight to a screen
      // that doesn't need a session.
      if (pathname === '/') {
        router.replace('/scan');
      }
      return;
    }

    const onLoginScreen = segments[0] === 'login';

    if (!user && !onLoginScreen) {
      router.replace('/login');
    } else if (user && onLoginScreen) {
      // Back to the index route, which routes on to onboarding or home
      // depending on whether this account already has a profile.
      router.replace('/');
    }
  }, [user, initializing, segments, pathname, router, devBypass]);

  if (initializing) return <Splash />;

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: PINK },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: '#fff' },
          }}
        >
          <Stack.Screen name="(tabs)"             options={{ headerShown: false }} />
          <Stack.Screen name="login"              options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="account"            options={{ headerShown: false }} />
          <Stack.Screen name="scan"               options={{ headerShown: false }} />
          <Stack.Screen name="tutorial"           options={{ headerShown: false }} />
          <Stack.Screen name="camera"             options={{ headerShown: false }} />
          <Stack.Screen name="onboarding"         options={{ headerShown: false }} />
          <Stack.Screen name="skin-scan/index"    options={{ headerShown: false }} />
          <Stack.Screen name="undertone-confirm"  options={{ headerShown: false }} />
          <Stack.Screen name="shade-preview"      options={{ headerShown: false }} />
        </Stack>
      </AuthGate>
    </AuthProvider>
  );
}
