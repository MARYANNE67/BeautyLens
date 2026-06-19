import { Stack } from 'expo-router';

const PINK = '#C2185B';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: PINK },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#fff' },
      }}
    >
      <Stack.Screen name="(tabs)"   options={{ headerShown: false }} />
      <Stack.Screen name="account"  options={{ headerShown: false }} />
      <Stack.Screen name="scan"     options={{ headerShown: false }} />
      <Stack.Screen name="tryon"    options={{ headerShown: false }} />
      <Stack.Screen name="camera"   options={{ headerShown: false }} />
    </Stack>
  );
}
